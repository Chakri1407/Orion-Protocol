// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
/**
 * @title OrionToken
 * @dev Governance and utility token (ORN) with minting, burning, and pausing capabilities.
 */
contract OrionToken is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable
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

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    address public treasury;

    event TreasuryUpdated(address newTreasury);
    event Minted(address indexed to, uint256 amount);
    event Burned(address indexed from, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract.
     * @param initialTreasury Address of the treasury.
     * @param _initialSupply Initial supply of tokens to mint to treasury.
     * @param admin Address granted all roles.
     */
    function initialize(
        address initialTreasury,
        uint256 _initialSupply,
        address admin
    ) public initializer {
        __ERC20_init("Orion Token", "ORN");
        __ERC20Permit_init("Orion Token");
        __ERC20Pausable_init();
        __AccessControl_init();

        _reentrancyStatus = _NOT_ENTERED;
        treasury = initialTreasury;

        _mint(treasury, _initialSupply);
        emit Minted(treasury, _initialSupply);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @dev Burns tokens from caller's balance.
     */
    function burn(uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount should be greater than zero");
        _burn(msg.sender, amount);
        emit Burned(msg.sender, amount);
    }

    /**
     * @dev Mints tokens to the treasury. Restricted to MINTER_ROLE.
     */
    function mint(uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused nonReentrant {
        require(amount > 0, "Amount should be greater than zero");
        _mint(treasury, amount);
        emit Minted(treasury, amount);
    }

    /**
     * @dev Updates the treasury address. Restricted to DEFAULT_ADMIN_ROLE.
     */
    function updateTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid address: zero address not allowed");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @dev Pauses all token transfers. Restricted to PAUSER_ROLE.
     */
    function pause() public {
        require(hasRole(PAUSER_ROLE, msg.sender), "Caller cannot pause");
        _pause();
    }

    /**
     * @dev Unpauses all token transfers. Restricted to PAUSER_ROLE.
     */
    function unpause() public {
        require(hasRole(PAUSER_ROLE, msg.sender), "Caller cannot unpause");
        _unpause();
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._update(from, to, value);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
