/**
 * deployAmoy.js
 * Deploys MockUSDC + OrionStablecoin (UUPS proxy) to Polygon Amoy.
 *
 * Strategy:
 *   - Collateral token  = MockUSDC  (deployed here — you can mint freely)
 *   - Price feed        = Real Chainlink USDC/USD on Amoy (live oracle data)
 *
 * This lets you test the full peg mechanism with real price feed data
 * without needing actual Circle USDC on a testnet.
 *
 * Run:
 *   DEPLOYER_PRIVKEY=<key> npx hardhat run scripts/deployAmoy.js --network amoy
 *
 * After deploy, copy the printed addresses into scripts/interactAmoy.js
 */

const { upgrades, ethers } = require("hardhat");

// Real Chainlink USDC/USD feed on Polygon Amoy
const CHAINLINK_USDC_USD_AMOY = "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16";

// Initial OUSD admin-minted to treasury on deploy (set to 0 — users mint via collateral)
const INITIAL_SUPPLY = 0n;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance       :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MATIC\n");

  // ── 1. Deploy MockUSDC ───────────────────────────────────────────────────────
  console.log("1/2  Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddr = await mockUSDC.getAddress();
  console.log("     MockUSDC  :", mockUSDCAddr);

  // Mint 10,000 test USDC (6 decimals) to the deployer
  const mintAmount = 10_000n * 10n ** 6n;
  await (await mockUSDC.mint(deployer.address, mintAmount)).wait();
  console.log("     Minted    : 10,000 MockUSDC to deployer\n");

  // ── 2. Deploy OrionStablecoin via UUPS proxy ─────────────────────────────────
  console.log("2/2  Deploying OrionStablecoin (UUPS proxy)...");
  const OrionStablecoin = await ethers.getContractFactory("OrionStablecoin");
  const ousd = await upgrades.deployProxy(
    OrionStablecoin,
    [
      "Orion USD",               // name
      "OUSD",                    // symbol
      deployer.address,          // initialAdmin
      deployer.address,          // initialTreasury
      INITIAL_SUPPLY,            // initialSupply (0 = all minted via collateral)
      [deployer.address],        // initialOwners (can approve burn requests)
      mockUSDCAddr,              // collateralToken = MockUSDC
      CHAINLINK_USDC_USD_AMOY,   // priceFeed = real Chainlink on Amoy
    ],
    { kind: "uups" }
  );
  await ousd.waitForDeployment();
  const ousdAddr = await ousd.getAddress();
  console.log("     OUSD proxy:", ousdAddr);

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log("\n────────────────────────────────────────────────────");
  console.log("DEPLOYMENT COMPLETE — save these addresses:");
  console.log("────────────────────────────────────────────────────");
  console.log(`MOCK_USDC_ADDRESS=${mockUSDCAddr}`);
  console.log(`OUSD_ADDRESS=${ousdAddr}`);
  console.log(`PRICE_FEED_ADDRESS=${CHAINLINK_USDC_USD_AMOY}`);
  console.log("────────────────────────────────────────────────────\n");
  console.log("Next: run  scripts/interactAmoy.js  to test mint/redeem");
}

main().catch((err) => { console.error(err); process.exit(1); });
