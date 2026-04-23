// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title OrionStablecoin
 * @dev USD-pegged stablecoin (OUSD). 1 OUSD = 1 USD, enforced by full collateral backing.
 *
 *  Peg mechanism:
 *   - mintWithCollateral: user deposits collateralToken (e.g. USDC) → receives OUSD 1:1 (decimal-adjusted)
 *   - redeem: user burns OUSD → receives collateralToken back 1:1 (decimal-adjusted)
 *   - Chainlink collateral/USD feed checked before every mint to ensure collateral hasn't
 *     depegged beyond PEG_TOLERANCE_BPS (default 50 bps = 0.5%)
 *
 *  Admin mint() still exists for treasury pre-funding but does NOT add collateral reserves.
 *  collateralRatio() always reflects the true backing percentage.
 */
contract OrionStablecoin is
    Initializable,
    ERC20Upgradeable,
    ERC20PermitUpgradeable,
    ERC20PausableUpgradeable,
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    using SafeERC20 for IERC20;

    // ─── Reentrancy guard (storage-slot, upgrade-safe) ───────────────────────────
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ─── Structs ────────────────────────────────────────────────────────────────

    struct BurnRequest {
        uint256 amount;
        bool executed;
    }

    // ─── State ──────────────────────────────────────────────────────────────────

    mapping(address => bool) public blacklist;
    mapping(address => bool) public isOwner;
    mapping(address => BurnRequest) public burnRequests;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    address public admin;
    address public treasury;
    address[] public owners;

    // ── Peg state ────────────────────────────────────────────────────────────────
    IERC20 public collateralToken;          // e.g. USDC
    uint8   public collateralDecimals;      // cached from collateralToken.decimals()
    AggregatorV3Interface public priceFeed; // Chainlink collateral/USD (8-decimal)
    uint256 public collateralReserves;      // collateral units held for minted OUSD

    // Peg target: $1.00 in Chainlink 8-decimal format
    uint256 public constant PEG_PRICE         = 1e8;
    // Allowed deviation: 50 bps = 0.50%
    uint256 public constant PEG_TOLERANCE_BPS = 50;

    // ─── Events ─────────────────────────────────────────────────────────────────

    event TransactionLogged(address indexed sender, address indexed recipient, uint256 amount);
    event Minted(address indexed to, uint256 amount);
    event BurnRequested(address indexed from, uint256 amount);
    event BurnApproved(address indexed owner, address indexed from, uint256 amount);
    event TreasuryUpdated(address newTreasury);
    event OwnerAdded(address indexed newOwner);
    event OwnerRemoved(address indexed removedOwner);
    event CollateralDeposited(address indexed user, uint256 collateralAmount, uint256 mintedOUSD);
    event Redeemed(address indexed user, uint256 burnedOUSD, uint256 collateralReturned);
    event CollateralTokenUpdated(address indexed newCollateralToken, uint8 decimals);
    event PriceFeedUpdated(address indexed newPriceFeed);

    // ─── Errors ─────────────────────────────────────────────────────────────────

    error PegBroken(uint256 currentPrice, uint256 lowerBound, uint256 upperBound);
    error CollateralNotSet();
    error PriceFeedNotSet();
    error InsufficientCollateralReserves(uint256 available, uint256 required);
    error StalePrice();

    // ─── Constructor ────────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─── Initializer ────────────────────────────────────────────────────────────

    /**
     * @dev Initializes the contract.
     * @param name             Token name.
     * @param symbol           Token symbol.
     * @param initialAdmin     Address granted all roles.
     * @param initialTreasury  Treasury that receives admin-minted supply.
     * @param initialSupply    Tokens minted to treasury on deploy (not collateral-backed).
     * @param initialOwners    Addresses that can approve burn requests.
     * @param _collateralToken Collateral ERC20 (e.g. USDC). Pass address(0) to configure later.
     * @param _priceFeed       Chainlink feed for collateral/USD. Pass address(0) to configure later.
     */
    function initialize(
        string memory name,
        string memory symbol,
        address initialAdmin,
        address initialTreasury,
        uint256 initialSupply,
        address[] memory initialOwners,
        address _collateralToken,
        address _priceFeed
    ) public initializer {
        __ERC20_init(name, symbol);
        __ERC20Permit_init(name);
        __ERC20Pausable_init();
        __AccessControl_init();

        _reentrancyStatus = _NOT_ENTERED;

        admin    = initialAdmin;
        treasury = initialTreasury;

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(MINTER_ROLE,        initialAdmin);
        _grantRole(PAUSER_ROLE,        initialAdmin);
        _grantRole(UPGRADER_ROLE,      initialAdmin);

        for (uint256 i = 0; i < initialOwners.length; i++) {
            address owner = initialOwners[i];
            require(owner != address(0), "Invalid owner");
            isOwner[owner] = true;
            emit OwnerAdded(owner);
        }

        if (_collateralToken != address(0)) {
            _setCollateralToken(_collateralToken);
        }
        if (_priceFeed != address(0)) {
            priceFeed = AggregatorV3Interface(_priceFeed);
            emit PriceFeedUpdated(_priceFeed);
        }

        if (initialSupply > 0) {
            _mint(treasury, initialSupply);
            emit Minted(treasury, initialSupply);
        }
    }

    // ─── Modifiers ──────────────────────────────────────────────────────────────

    modifier notBlacklisted() {
        require(!blacklist[msg.sender], "Blacklisted address");
        _;
    }

    // ─── Core ERC20 ─────────────────────────────────────────────────────────────

    function transfer(
        address to,
        uint256 amount
    ) public override whenNotPaused nonReentrant notBlacklisted returns (bool) {
        _transfer(msg.sender, to, amount);
        emit TransactionLogged(msg.sender, to, amount);
        return true;
    }

    // ─── Peg: Mint with Collateral ───────────────────────────────────────────────

    /**
     * @dev Deposit collateral to mint OUSD at 1:1 USD value.
     *      Chainlink feed verified before accepting collateral.
     *
     * Example (USDC = 6 dec): deposit 1_000_000 → receive 1e18 OUSD
     *
     * @param collateralAmount Amount of collateral to deposit (in collateral's decimals).
     */
    function mintWithCollateral(
        uint256 collateralAmount
    ) external whenNotPaused nonReentrant notBlacklisted {
        if (address(collateralToken) == address(0)) revert CollateralNotSet();
        if (address(priceFeed) == address(0))       revert PriceFeedNotSet();
        require(collateralAmount > 0, "Amount must be greater than zero");

        _verifyPeg();

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);
        collateralReserves += collateralAmount;

        uint256 mintAmount = _toOUSD(collateralAmount);
        _mint(msg.sender, mintAmount);

        emit CollateralDeposited(msg.sender, collateralAmount, mintAmount);
    }

    // ─── Peg: Redeem ────────────────────────────────────────────────────────────

    /**
     * @dev Burn OUSD to redeem equivalent collateral at 1:1 USD value.
     *
     * Example (USDC = 6 dec): burn 1e18 OUSD → receive 1_000_000 USDC
     *
     * @param ousdAmount Amount of OUSD to burn (18 decimals).
     */
    function redeem(
        uint256 ousdAmount
    ) external whenNotPaused nonReentrant notBlacklisted {
        if (address(collateralToken) == address(0)) revert CollateralNotSet();
        require(ousdAmount > 0, "Amount must be greater than zero");
        require(balanceOf(msg.sender) >= ousdAmount, "Insufficient OUSD balance");

        uint256 collateralOut = _toCollateral(ousdAmount);

        if (collateralReserves < collateralOut)
            revert InsufficientCollateralReserves(collateralReserves, collateralOut);

        collateralReserves -= collateralOut;
        _burn(msg.sender, ousdAmount);
        collateralToken.safeTransfer(msg.sender, collateralOut);

        emit Redeemed(msg.sender, ousdAmount, collateralOut);
    }

    // ─── Admin: Mint to treasury ─────────────────────────────────────────────────

    /**
     * @dev Mint OUSD to the treasury without adding collateral reserves.
     *      Only use when equivalent off-chain USD backing exists.
     */
    function mint(uint256 amount) public whenNotPaused nonReentrant {
        require(hasRole(MINTER_ROLE, msg.sender), "Caller is not a minter");
        require(amount > 0, "Amount should be greater than zero");
        _mint(treasury, amount);
        emit Minted(treasury, amount);
    }

    // ─── Burn flow ───────────────────────────────────────────────────────────────

    function requestBurn(uint256 amount) external notBlacklisted {
        require(amount > 0, "Amount should be greater than zero");
        require(amount <= balanceOf(msg.sender), "Amount should not exceed user balance");
        burnRequests[msg.sender] = BurnRequest(amount, false);
        emit BurnRequested(msg.sender, amount);
    }

    function approveBurn(address account) external nonReentrant {
        require(isOwner[msg.sender], "Caller is not an owner");

        BurnRequest storage request = burnRequests[account];
        require(request.amount > 0, "No burn request found");
        require(!request.executed, "Burn request already executed");
        require(request.amount <= balanceOf(account), "Requested amount exceeds user balance");

        request.executed = true;
        _burn(account, request.amount);

        emit BurnApproved(msg.sender, account, request.amount);
    }

    // ─── Pause ──────────────────────────────────────────────────────────────────

    function pause() public {
        require(hasRole(PAUSER_ROLE, msg.sender), "Caller cannot pause");
        _pause();
    }

    function unpause() public {
        require(hasRole(PAUSER_ROLE, msg.sender), "Caller cannot unpause");
        _unpause();
    }

    // ─── Admin setters ───────────────────────────────────────────────────────────

    function setBlacklist(address account, bool isBlacklisted) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        blacklist[account] = isBlacklisted;
    }

    function updateTreasury(address newTreasury) public {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(newTreasury != address(0), "Invalid address: zero address not allowed");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @dev Set the collateral token (e.g. USDC) and cache its decimals.
     */
    function setCollateralToken(address _collateralToken) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(_collateralToken != address(0), "Invalid address: zero address not allowed");
        _setCollateralToken(_collateralToken);
    }

    /**
     * @dev Set the Chainlink price feed for the collateral token.
     */
    function setPriceFeed(address _priceFeed) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(_priceFeed != address(0), "Invalid address: zero address not allowed");
        priceFeed = AggregatorV3Interface(_priceFeed);
        emit PriceFeedUpdated(_priceFeed);
    }

    function addOwner(address newOwner) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(newOwner != address(0), "Invalid address: zero address not allowed");
        require(!isOwner[newOwner], "Address is already an owner");
        isOwner[newOwner] = true;
        owners.push(newOwner);
        emit OwnerAdded(newOwner);
    }

    function removeOwner(address ownerToRemove) external {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not admin");
        require(isOwner[ownerToRemove], "Address is not an owner");
        isOwner[ownerToRemove] = false;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == ownerToRemove) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }
        emit OwnerRemoved(ownerToRemove);
    }

    // ─── Views ───────────────────────────────────────────────────────────────────

    /**
     * @dev Returns the collateral backing ratio in basis points.
     *      10000 = 100% fully backed. < 10000 = partially unbacked (admin-minted).
     */
    function collateralRatio() external view returns (uint256 ratioBps) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        uint256 reservesIn18 = _toOUSD(collateralReserves);
        ratioBps = (reservesIn18 * 10_000) / supply;
    }

    /**
     * @dev Returns the current Chainlink price and whether the peg is intact.
     * @return price      Current price with 8 decimals (100000000 = $1.00).
     * @return pegHealthy True if price is within PEG_TOLERANCE_BPS of $1.
     */
    function getPegStatus() external view returns (uint256 price, bool pegHealthy) {
        if (address(priceFeed) == address(0)) return (0, false);
        (, int256 rawPrice,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (rawPrice <= 0 || updatedAt == 0) return (0, false);
        price = uint256(rawPrice);
        uint256 lower = PEG_PRICE * (10_000 - PEG_TOLERANCE_BPS) / 10_000;
        uint256 upper = PEG_PRICE * (10_000 + PEG_TOLERANCE_BPS) / 10_000;
        pegHealthy = price >= lower && price <= upper;
    }

    // ─── Internal helpers ────────────────────────────────────────────────────────

    function _verifyPeg() internal view {
        (, int256 rawPrice,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (rawPrice <= 0 || updatedAt == 0) revert StalePrice();

        uint256 price = uint256(rawPrice);
        uint256 lower = PEG_PRICE * (10_000 - PEG_TOLERANCE_BPS) / 10_000;
        uint256 upper = PEG_PRICE * (10_000 + PEG_TOLERANCE_BPS) / 10_000;

        if (price < lower || price > upper) revert PegBroken(price, lower, upper);
    }

    function _toOUSD(uint256 collateralAmount) internal view returns (uint256) {
        if (collateralDecimals < 18) {
            return collateralAmount * (10 ** (18 - collateralDecimals));
        } else if (collateralDecimals > 18) {
            return collateralAmount / (10 ** (collateralDecimals - 18));
        }
        return collateralAmount;
    }

    function _toCollateral(uint256 ousdAmount) internal view returns (uint256) {
        if (collateralDecimals < 18) {
            return ousdAmount / (10 ** (18 - collateralDecimals));
        } else if (collateralDecimals > 18) {
            return ousdAmount * (10 ** (collateralDecimals - 18));
        }
        return ousdAmount;
    }

    function _setCollateralToken(address _token) internal {
        collateralToken    = IERC20(_token);
        collateralDecimals = IERC20Metadata(_token).decimals();
        emit CollateralTokenUpdated(_token, collateralDecimals);
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
