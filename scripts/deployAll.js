/**
 * deployAll.js
 * Deploys all 4 Orion contracts to Polygon Amoy in the correct dependency order.
 *
 * Order:
 *   1. MockUSDC          — test collateral (freely mintable)
 *   2. OrionToken (ORN)  — governance/utility token (UUPS proxy)
 *   3. OrionStablecoin (OUSD) — USD-pegged stablecoin (UUPS proxy)
 *   4. OrionDistribution — vault that distributes ORN + OUSD
 *   5. OrionTreasuryVault — multi-sig vault that feeds the distribution contract
 *
 * Run:
 *   npx hardhat run scripts/deployAll.js --network amoy
 */

const { upgrades, ethers } = require("hardhat");

// ── Config ────────────────────────────────────────────────────────────────────
// Real Chainlink USDC/USD feed on Polygon Amoy
const CHAINLINK_USDC_USD_AMOY = "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16";

// Deployer is the sole signer + admin for simplicity on testnet.
// On mainnet you would pass multiple signer addresses here.
const REQUIRED_APPROVALS = 1;

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("══════════════════════════════════════════════════════");
  console.log("   Orion Protocol — Full Deploy on Polygon Amoy");
  console.log("══════════════════════════════════════════════════════");
  console.log("Deployer :", deployer.address);
  console.log("Balance  :", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  ), "MATIC\n");

  // ── 1. MockUSDC ─────────────────────────────────────────────────────────────
  console.log("[1/5] Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddr = await mockUSDC.getAddress();

  // Give deployer 100,000 test USDC
  const faucetAmount = 100_000n * 10n ** 6n;
  await (await mockUSDC.mint(deployer.address, faucetAmount)).wait();
  console.log("      Address :", mockUSDCAddr);
  console.log("      Minted  : 100,000 MockUSDC → deployer\n");

  // ── 2. OrionToken (ORN) ──────────────────────────────────────────────────────
  console.log("[2/5] Deploying OrionToken (ORN)...");
  const OrionToken = await ethers.getContractFactory("OrionToken");
  const orn = await upgrades.deployProxy(
    OrionToken,
    [
      deployer.address,            // initialTreasury
      ethers.parseEther("1000000"), // 1,000,000 ORN initial supply to treasury
      deployer.address,            // admin
    ],
    { kind: "uups" }
  );
  await orn.waitForDeployment();
  const ornAddr = await orn.getAddress();
  console.log("      Address :", ornAddr);
  console.log("      Treasury:", deployer.address, "(1,000,000 ORN minted)\n");

  // ── 3. OrionStablecoin (OUSD) ────────────────────────────────────────────────
  console.log("[3/5] Deploying OrionStablecoin (OUSD)...");
  const OrionStablecoin = await ethers.getContractFactory("OrionStablecoin");
  const ousd = await upgrades.deployProxy(
    OrionStablecoin,
    [
      "Orion USD",               // name
      "OUSD",                    // symbol
      deployer.address,          // initialAdmin
      deployer.address,          // initialTreasury
      0n,                        // initialSupply — 0, users mint via collateral
      [deployer.address],        // initialOwners — can approve burn requests
      mockUSDCAddr,              // collateralToken = MockUSDC
      CHAINLINK_USDC_USD_AMOY,   // priceFeed = real Chainlink USDC/USD on Amoy
    ],
    { kind: "uups" }
  );
  await ousd.waitForDeployment();
  const ousdAddr = await ousd.getAddress();
  console.log("      Address :", ousdAddr);
  console.log("      Collateral token :", mockUSDCAddr);
  console.log("      Price feed       :", CHAINLINK_USDC_USD_AMOY, "\n");

  // ── 4. OrionDistribution ────────────────────────────────────────────────────
  console.log("[4/5] Deploying OrionDistribution...");
  const OrionDistribution = await ethers.getContractFactory("OrionDistribution");
  const dist = await upgrades.deployProxy(
    OrionDistribution,
    [
      ornAddr,   // orionToken (ORN)
      ousdAddr,  // orionCoin  (OUSD)
    ],
    { kind: "uups" }
  );
  await dist.waitForDeployment();
  const distAddr = await dist.getAddress();
  console.log("      Address :", distAddr, "\n");

  // ── 5. OrionTreasuryVault ────────────────────────────────────────────────────
  console.log("[5/5] Deploying OrionTreasuryVault...");
  const OrionTreasuryVault = await ethers.getContractFactory("OrionTreasuryVault");
  const vault = await upgrades.deployProxy(
    OrionTreasuryVault,
    [
      [deployer.address],   // signers (add more addresses on mainnet)
      REQUIRED_APPROVALS,   // requiredApprovals
      deployer.address,     // vaultAdmin
    ],
    { kind: "uups" }
  );
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  // Wire vault → distribution contract + token addresses
  await (await vault.setDistributionContract(distAddr)).wait();
  await (await vault.setOrionToken(ornAddr)).wait();
  await (await vault.setStableCoin(ousdAddr)).wait();
  console.log("      Address :", vaultAddr);
  console.log("      Wired to distribution contract ✅\n");

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════════════════");
  console.log("   DEPLOYMENT COMPLETE — Copy into testAll.js");
  console.log("══════════════════════════════════════════════════════");
  console.log(`const MOCK_USDC = "${mockUSDCAddr}";`);
  console.log(`const ORN_ADDR  = "${ornAddr}";`);
  console.log(`const OUSD_ADDR = "${ousdAddr}";`);
  console.log(`const DIST_ADDR = "${distAddr}";`);
  console.log(`const VAULT_ADDR= "${vaultAddr}";`);
  console.log("══════════════════════════════════════════════════════\n");
  console.log("Verify on PolygonScan:");
  console.log(`  MockUSDC    : https://amoy.polygonscan.com/address/${mockUSDCAddr}`);
  console.log(`  ORN (proxy) : https://amoy.polygonscan.com/address/${ornAddr}`);
  console.log(`  OUSD (proxy): https://amoy.polygonscan.com/address/${ousdAddr}`);
  console.log(`  Distribution: https://amoy.polygonscan.com/address/${distAddr}`);
  console.log(`  Vault       : https://amoy.polygonscan.com/address/${vaultAddr}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
