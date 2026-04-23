/**
 * verify.js
 * Verifies all deployed Orion contracts on Polygon Amoy.
 *
 * Run:
 *   npx hardhat run scripts/verify.js --network polygonAmoy
 */

const { run } = require("hardhat");

// ── Proxy addresses ───────────────────────────────────────────────────────────
const MOCK_USDC  = "0x68eF377ea77e53b446b324fA24779aC8021aD6a6";
const ORN_PROXY  = "0x228eEe9c44d6c48A957765F2AC697733d9c3535E";
const OUSD_PROXY = "0xe631Dde195283dFF9DE0D4934361f446aD8589E5";
const DIST_PROXY = "0x5Fb00223d9Fa402760261eFb7f2F273D55B128DD";
const VAULT_PROXY= "0x57Df20982CF40d63453349a69710c3Bf6b90b820";

// ── Implementation addresses (discovered from previous deploy logs) ────────────
// These are the actual logic contracts behind each UUPS proxy.
const ORN_IMPL   = "0x8292a63c036bC8D038dCcA26Babc239BAFf95Ed0";
const OUSD_IMPL  = "0xBBC9848b14e80228958BB2b4a2c5267f6Fd683db";
const DIST_IMPL  = "0x308A4c8ecDb95280ED05629211ff1BF5C5762029";
const VAULT_IMPL = "0x51645d677BfD44D93420F599fD529c4c1625ECbe";

async function verify(label, address, contractPath, constructorArgs = []) {
  process.stdout.write(`\n[${label}]\n  ${address}\n  ... `);
  try {
    await run("verify:verify", {
      address,
      contract: contractPath,
      constructorArguments: constructorArgs,
    });
    console.log("✅  Verified");
  } catch (e) {
    if (e.message.toLowerCase().includes("already verified")) {
      console.log("✅  Already verified");
    } else {
      console.log("❌  " + e.message.split("\n")[0]);
    }
  }
}

async function main() {
  if (!process.env.POLYGONSCAN_API_KEY) {
    console.error("❌  POLYGONSCAN_API_KEY not set in .env");
    process.exit(1);
  }

  console.log("══════════════════════════════════════════════════════");
  console.log("   Orion Protocol — Verification (Polygon Amoy)");
  console.log("══════════════════════════════════════════════════════");

  // ── 1. MockUSDC ─────────────────────────────────────────────────────────────
  await verify(
    "MockUSDC",
    MOCK_USDC,
    "contracts/mocks/MockUSDC.sol:MockUSDC"
  );

  // ── 2. OrionToken implementation ─────────────────────────────────────────────
  await verify(
    "OrionToken (implementation)",
    ORN_IMPL,
    "contracts/OrionToken.sol:OrionToken"
  );

  // ── 3. OrionStablecoin implementation ────────────────────────────────────────
  await verify(
    "OrionStablecoin (implementation)",
    OUSD_IMPL,
    "contracts/OrionStablecoin.sol:OrionStablecoin"
  );

  // ── 4. OrionDistribution implementation ──────────────────────────────────────
  await verify(
    "OrionDistribution (implementation)",
    DIST_IMPL,
    "contracts/OrionDistribution.sol:OrionDistribution"
  );

  // ── 5. OrionTreasuryVault implementation ──────────────────────────────────────
  await verify(
    "OrionTreasuryVault (implementation)",
    VAULT_IMPL,
    "contracts/OrionTreasuryVault.sol:OrionTreasuryVault"
  );

  console.log("\n══════════════════════════════════════════════════════");
  console.log("   Proxy addresses (interact via 'Write as Proxy'):");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  MockUSDC    : https://amoy.polygonscan.com/address/${MOCK_USDC}#writeContract`);
  console.log(`  ORN         : https://amoy.polygonscan.com/address/${ORN_PROXY}#writeProxyContract`);
  console.log(`  OUSD        : https://amoy.polygonscan.com/address/${OUSD_PROXY}#writeProxyContract`);
  console.log(`  Distribution: https://amoy.polygonscan.com/address/${DIST_PROXY}#writeProxyContract`);
  console.log(`  Vault       : https://amoy.polygonscan.com/address/${VAULT_PROXY}#writeProxyContract`);
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
