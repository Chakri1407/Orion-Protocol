/**
 * interactAmoy.js
 * Tests the full peg flow on Polygon Amoy using real Chainlink data.
 *
 * Fill in the addresses printed by deployAmoy.js before running.
 *
 * Run:
 *   DEPLOYER_PRIVKEY=<key> npx hardhat run scripts/interactAmoy.js --network amoy
 */

const { ethers } = require("hardhat");

// ── Paste addresses from deployAmoy.js output ────────────────────────────────
const MOCK_USDC_ADDRESS  = "";   // e.g. "0xAbC..."
const OUSD_ADDRESS       = "";   // e.g. "0xDef..."
const PRICE_FEED_ADDRESS = "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16";
// ─────────────────────────────────────────────────────────────────────────────

const FEED_ABI = [
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() external view returns (uint8)",
  "function description() external view returns (string memory)",
];

const ERC20_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function decimals() external view returns (uint8)",
  "function mint(address to, uint256 amount) external",
];

const OUSD_ABI = [
  "function mintWithCollateral(uint256 collateralAmount) external",
  "function redeem(uint256 ousdAmount) external",
  "function balanceOf(address) external view returns (uint256)",
  "function collateralReserves() external view returns (uint256)",
  "function collateralRatio() external view returns (uint256)",
  "function getPegStatus() external view returns (uint256 price, bool pegHealthy)",
  "function totalSupply() external view returns (uint256)",
];

function fmt6(n)  { return (Number(n) / 1e6).toFixed(6)  + " USDC"; }
function fmt18(n) { return (Number(n) / 1e18).toFixed(6) + " OUSD"; }

async function printState(label, usdc, ousd, signer) {
  const [price, healthy] = await ousd.getPegStatus();
  const ratio            = await ousd.collateralRatio();
  console.log(`\n── ${label} ──`);
  console.log("  MockUSDC balance :", fmt6(await usdc.balanceOf(signer.address)));
  console.log("  OUSD balance     :", fmt18(await ousd.balanceOf(signer.address)));
  console.log("  Collateral rsrvs :", fmt6(await ousd.collateralReserves()));
  console.log("  Total supply     :", fmt18(await ousd.totalSupply()));
  console.log("  Collateral ratio :", Number(ratio) / 100 + "%");
  console.log("  Chainlink price  : $" + (Number(price) / 1e8).toFixed(8));
  console.log("  Peg status       :", healthy ? "✅  HEALTHY" : "❌  BROKEN");
}

async function main() {
  if (!MOCK_USDC_ADDRESS || !OUSD_ADDRESS) {
    console.error("❌  Fill in MOCK_USDC_ADDRESS and OUSD_ADDRESS from deployAmoy.js output.");
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  console.log("Account :", signer.address);
  console.log("Balance :", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "MATIC");

  const usdc = new ethers.Contract(MOCK_USDC_ADDRESS,  ERC20_ABI,  signer);
  const ousd = new ethers.Contract(OUSD_ADDRESS,       OUSD_ABI,   signer);
  const feed = new ethers.Contract(PRICE_FEED_ADDRESS, FEED_ABI,   signer);

  // ── Read live Chainlink data ─────────────────────────────────────────────────
  const desc = await feed.description();
  const [, rawPrice,, updatedAt] = await feed.latestRoundData();
  const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
  console.log("\n── Live Chainlink Feed ──────────────────────────");
  console.log("  Feed       :", desc, "@", PRICE_FEED_ADDRESS);
  console.log("  Price      : $" + (Number(rawPrice) / 1e8).toFixed(8));
  console.log("  Last update:", age + "s ago");
  console.log("─────────────────────────────────────────────────");

  // ── Initial state ────────────────────────────────────────────────────────────
  await printState("Initial state", usdc, ousd, signer);

  // ── Step 1: Approve OUSD contract to spend MockUSDC ─────────────────────────
  console.log("\n[1] Approving OUSD to spend MockUSDC...");
  const approveTx = await usdc.approve(OUSD_ADDRESS, ethers.MaxUint256);
  await approveTx.wait();
  console.log("    ✅  Approved");

  // ── Step 2: Mint 100 OUSD by depositing 100 MockUSDC (100 * 1e6) ────────────
  const depositAmount = 100n * 10n ** 6n; // 100 USDC (6 decimals)
  console.log("\n[2] Depositing 100 MockUSDC → minting 100 OUSD...");
  const mintTx = await ousd.mintWithCollateral(depositAmount);
  const mintReceipt = await mintTx.wait();
  console.log("    ✅  Tx:", mintReceipt.hash);
  await printState("After mint", usdc, ousd, signer);

  // ── Step 3: Redeem 50 OUSD → receive 50 MockUSDC back ───────────────────────
  const redeemAmount = 50n * 10n ** 18n; // 50 OUSD (18 decimals)
  console.log("\n[3] Redeeming 50 OUSD → receiving 50 MockUSDC back...");
  const redeemTx = await ousd.redeem(redeemAmount);
  const redeemReceipt = await redeemTx.wait();
  console.log("    ✅  Tx:", redeemReceipt.hash);
  await printState("After redeem", usdc, ousd, signer);

  console.log("\n✅  All interactions completed successfully.");
  console.log("    Verify txs on: https://amoy.polygonscan.com");
}

main().catch((err) => { console.error(err); process.exit(1); });
