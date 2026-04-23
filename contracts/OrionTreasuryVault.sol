// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOrionBurnable {
    function burn(uint256 amount) external;
    function requestBurn(uint256 amount) external;
}

/**
 * @title OrionTreasuryVault
 * @dev A multi-signature treasury vault that allows for transaction submissions, approvals, and executions.
 */
contract OrionTreasuryVault is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    // Upgrade-safe reentrancy guard (storage-slot, no constructor dependency)
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    struct Transaction {
        address to;
        uint256 amount;
        address token;
        uint256 approvals;
        bool executed;
    }

    struct PauseRequest {
        bool pause;
        uint256 approvals;
        bool executed;
    }

    address public vaultAdmin;
    address public orionToken;
    address public stableCoin;
    address[] public signers;
    uint256 public requiredApprovals;
    address public distributionContract;

    mapping(address => bool) public isSigner;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(address => bool) public hasApprovedPause;
    Transaction[] public transactions;

    PauseRequest public pauseRequest;

    event TransactionSubmitted(uint256 indexed txId, address indexed to, uint256 amount, address indexed token);
    event TransactionApproved(uint256 indexed txId, address indexed approver);
    event TransactionExecuted(uint256 indexed txId);
    event DistributionContractUpdated(address indexed newDistributionContract);
    event VaultAdminUpdated(address indexed newVaultAdmin);
    event OrionTokenUpdated(address indexed newOrionToken);
    event StableCoinUpdated(address newStableCoin);
    event PauseRequested(bool indexed pause);
    event PauseApproved(address indexed approver);
    event PauseRevoked(address indexed revoker);
    event PauseExecuted(bool indexed paused);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    modifier onlySigner() {
        require(isSigner[msg.sender], "Not a signer");
        _;
    }

    modifier onlySubmitter() {
        require(isSigner[msg.sender] || msg.sender == vaultAdmin, "Not a submitter");
        _;
    }

    modifier txExists(uint256 txId) {
        require(txId < transactions.length, "Transaction does not exist");
        _;
    }

    modifier notApproved(uint256 txId) {
        require(!hasApproved[txId][msg.sender], "Transaction already approved");
        _;
    }

    modifier notExecuted(uint256 txId) {
        require(!transactions[txId].executed, "Transaction already executed");
        _;
    }

    modifier pauseRequestNotExecuted() {
        require(!pauseRequest.executed, "Pause request already executed");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract with signers, required approvals, and admin address.
     * @param _signers Array of signer addresses.
     * @param _requiredApprovals Number of approvals required for a transaction.
     * @param _vaultAdmin Address of the vault admin.
     */
    function initialize(
        address[] memory _signers,
        uint256 _requiredApprovals,
        address _vaultAdmin
    ) public initializer {
        require(_signers.length > 0, "Signers required");
        require(
            _requiredApprovals > 0 && _requiredApprovals <= _signers.length,
            "Invalid approval count"
        );
        __AccessControl_init();
        __Pausable_init();
        _reentrancyStatus = _NOT_ENTERED;
        _grantRole(UPGRADER_ROLE, msg.sender);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            require(signer != address(0), "Invalid signer");
            isSigner[signer] = true;
        }

        signers = _signers;
        requiredApprovals = _requiredApprovals;
        vaultAdmin = _vaultAdmin;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @dev Updates the distribution contract address.
     */
    function setDistributionContract(address newDistributionContract) external {
        require(newDistributionContract != address(0), "Invalid address: zero address not allowed");
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        distributionContract = newDistributionContract;
        emit DistributionContractUpdated(newDistributionContract);
    }

    /**
     * @dev Updates the vault admin address.
     */
    function setVaultAdmin(address newVaultAdmin) external {
        require(newVaultAdmin != address(0), "Invalid address: zero address not allowed");
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        vaultAdmin = newVaultAdmin;
        emit VaultAdminUpdated(newVaultAdmin);
    }

    /**
     * @dev Sets the Orion token address.
     */
    function setOrionToken(address newOrionToken) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(newOrionToken != address(0), "Invalid address: zero address not allowed");
        orionToken = newOrionToken;
        emit OrionTokenUpdated(newOrionToken);
    }

    /**
     * @dev Sets the stable coin address.
     */
    function setStableCoin(address newStableCoin) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(newStableCoin != address(0), "Invalid address: zero address not allowed");
        stableCoin = newStableCoin;
        emit StableCoinUpdated(newStableCoin);
    }

    /**
     * @dev Submits a new transaction for approval.
     * @param _amount Amount of tokens to transfer.
     * @param _token Address of the token to transfer.
     */
    function submitTransaction(uint256 _amount, address _token) external onlySubmitter {
        transactions.push(
            Transaction({
                to: distributionContract,
                amount: _amount,
                token: _token,
                approvals: 0,
                executed: false
            })
        );
        emit TransactionSubmitted(transactions.length - 1, distributionContract, _amount, _token);
    }

    /**
     * @dev Approves a pending transaction.
     * @param txId The ID of the transaction to approve.
     */
    function approveTransaction(
        uint256 txId
    ) external onlySigner whenNotPaused txExists(txId) notApproved(txId) notExecuted(txId) nonReentrant {
        Transaction storage transaction = transactions[txId];

        transaction.approvals += 1;
        hasApproved[txId][msg.sender] = true;

        emit TransactionApproved(txId, msg.sender);

        if (transaction.approvals >= requiredApprovals) {
            executeTransaction(txId);
        }
    }

    /**
     * @dev Executes a transaction once it has enough approvals.
     */
    function executeTransaction(
        uint256 txId
    ) internal whenNotPaused txExists(txId) notExecuted(txId) {
        Transaction storage transaction = transactions[txId];

        require(transaction.approvals >= requiredApprovals, "Not enough approvals");

        transaction.executed = true;

        IERC20(transaction.token).transfer(transaction.to, transaction.amount);

        emit TransactionExecuted(txId);
    }

    /**
     * @dev Burns a specified amount of tokens.
     * @param _amount Amount of tokens to burn.
     * @param tokenType Type of token being burned (ORN or OUSD).
     */
    function burnTokens(
        uint256 _amount,
        string memory tokenType
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant whenNotPaused {
        require(_amount > 0, "Amount should be greater than zero");

        if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("ORN"))) {
            IOrionBurnable(address(orionToken)).burn(_amount);
        } else if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("OUSD"))) {
            IOrionBurnable(address(stableCoin)).requestBurn(_amount);
        } else {
            revert("Invalid token type");
        }
    }

    /**
     * @dev Retrieves the vault balance of a specified token.
     */
    function getVaultBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Requests to pause or unpause the contract.
     */
    function requestPauseUnpause(bool _pause) external onlySigner {
        if (_pause) {
            require(!paused(), "Invalid request: already paused");
        } else {
            require(paused(), "Invalid request: already unpaused");
        }

        pauseRequest = PauseRequest({ pause: _pause, approvals: 0, executed: false });

        emit PauseRequested(_pause);
    }

    /**
     * @dev Approves a pending pause/unpause request.
     */
    function approvePauseUnpause() external onlySigner pauseRequestNotExecuted {
        require(!hasApprovedPause[msg.sender], "Already approved");

        pauseRequest.approvals += 1;
        hasApprovedPause[msg.sender] = true;

        emit PauseApproved(msg.sender);

        if (pauseRequest.approvals >= requiredApprovals) {
            executePauseUnpause();
        }
    }

    /**
     * @dev Revokes approval for a pending pause/unpause request.
     */
    function revokeApproval() external onlySigner pauseRequestNotExecuted {
        require(hasApprovedPause[msg.sender], "No approval to revoke");

        hasApprovedPause[msg.sender] = false;
        pauseRequest.approvals -= 1;

        emit PauseRevoked(msg.sender);
    }

    /**
     * @dev Executes a pause or unpause request.
     */
    function executePauseUnpause() internal {
        pauseRequest.executed = true;

        if (pauseRequest.pause) {
            _pause();
        } else {
            _unpause();
        }

        for (uint256 i = 0; i < signers.length; i++) {
            hasApprovedPause[signers[i]] = false;
        }

        emit PauseExecuted(pauseRequest.pause);
    }

    /**
     * @dev Adds a new signer to the contract.
     */
    function addSigner(address newSigner) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(newSigner != address(0), "Invalid address: zero address not allowed");
        require(!isSigner[newSigner], "Address is already a signer");

        isSigner[newSigner] = true;
        signers.push(newSigner);

        emit SignerAdded(newSigner);
    }

    /**
     * @dev Removes a signer from the contract.
     */
    function removeSigner(address signerToRemove) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(isSigner[signerToRemove], "Address is not a signer");

        isSigner[signerToRemove] = false;

        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signerToRemove) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }

        emit SignerRemoved(signerToRemove);
    }
}
