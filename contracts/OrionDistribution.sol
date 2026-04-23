// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IOrionBurnable {
    function burn(uint256 amount) external;
    function requestBurn(uint256 amount) external;
}

/**
 * @title OrionDistribution
 * @dev Distributes and manages ORN (token) and OUSD (stablecoin) held in this vault.
 */
contract OrionDistribution is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

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

    IERC20 public orionToken;  // ORN utility token
    IERC20 public orionCoin;   // OUSD stablecoin

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    event TokensTransferred(
        address indexed owner,
        address indexed recipient,
        uint256 amount,
        string tokenType
    );

    event TokensWithdrawn(
        address indexed owner,
        uint256 amount,
        string tokenType
    );

    error NotEnoughTokensInVault();
    error InvalidTokenType();
    error InsufficientTokenBalance();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract.
     * @param _orionToken Address of the ORN token.
     * @param _orionCoin Address of the OUSD stablecoin.
     */
    function initialize(
        address _orionToken,
        address _orionCoin
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();

        _reentrancyStatus = _NOT_ENTERED;
        orionToken = IERC20(_orionToken);
        orionCoin = IERC20(_orionCoin);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPGRADER_ROLE, msg.sender);
    }

    /**
     * @dev Transfers tokens from the vault to a recipient.
     * @param _recipient Recipient address.
     * @param _tokenAmount Amount to transfer.
     * @param tokenType "ORN" or "OUSD".
     */
    function transferToken(
        address _recipient,
        uint256 _tokenAmount,
        string memory tokenType
    ) external whenNotPaused nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("ORN"))) {
            if (orionToken.balanceOf(address(this)) < _tokenAmount) revert NotEnoughTokensInVault();
            orionToken.safeTransfer(_recipient, _tokenAmount);
        } else if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("OUSD"))) {
            if (orionCoin.balanceOf(address(this)) < _tokenAmount) revert NotEnoughTokensInVault();
            orionCoin.safeTransfer(_recipient, _tokenAmount);
        } else {
            revert InvalidTokenType();
        }

        emit TokensTransferred(msg.sender, _recipient, _tokenAmount, tokenType);
    }

    /**
     * @dev Burns tokens held in the vault.
     * @param _amount Amount to burn.
     * @param tokenType "ORN" (direct burn) or "OUSD" (request burn).
     */
    function burnTokens(
        uint256 _amount,
        string memory tokenType
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant whenNotPaused {
        require(_amount > 0, "Amount should be greater than zero");

        if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("ORN"))) {
            if (orionToken.balanceOf(address(this)) < _amount) revert NotEnoughTokensInVault();
            IOrionBurnable(address(orionToken)).burn(_amount);
        } else if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("OUSD"))) {
            if (orionCoin.balanceOf(address(this)) < _amount) revert NotEnoughTokensInVault();
            IOrionBurnable(address(orionCoin)).requestBurn(_amount);
        } else {
            revert InvalidTokenType();
        }
    }

    /**
     * @dev Returns the token balance of any wallet.
     * @param _walletAddress Wallet to query.
     * @param tokenType "ORN" or "OUSD".
     */
    function getTokenBalance(
        address _walletAddress,
        string memory tokenType
    ) external view returns (uint256) {
        if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("ORN"))) {
            return orionToken.balanceOf(_walletAddress);
        } else if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("OUSD"))) {
            return orionCoin.balanceOf(_walletAddress);
        } else {
            revert InvalidTokenType();
        }
    }

    /**
     * @dev Withdraws tokens from the vault to the caller (admin).
     * @param _amount Amount to withdraw.
     * @param tokenType "ORN" or "OUSD".
     */
    function withdrawTokens(
        uint256 _amount,
        string memory tokenType
    ) external whenNotPaused nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("ORN"))) {
            if (orionToken.balanceOf(address(this)) < _amount) revert InsufficientTokenBalance();
            orionToken.safeTransfer(msg.sender, _amount);
        } else if (keccak256(abi.encodePacked(tokenType)) == keccak256(abi.encodePacked("OUSD"))) {
            if (orionCoin.balanceOf(address(this)) < _amount) revert InsufficientTokenBalance();
            orionCoin.safeTransfer(msg.sender, _amount);
        } else {
            revert InvalidTokenType();
        }

        emit TokensWithdrawn(msg.sender, _amount, tokenType);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}
}
