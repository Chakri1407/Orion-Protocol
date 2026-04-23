/**
 * checkPriceFeed.js
 * Reads live data from the Chainlink USDC/USD feed on Polygon Amoy.
 *
 * Run:
 *   DEPLOYER_PRIVKEY=<key> npx hardhat run scripts/checkPriceFeed.js --network amoy
 */

const USDC_USD_FEED = "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16";

// Minimal ABI — only what we need
const FEED_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
  "function description() external view returns (string memory)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Checking feed from account:", signer.address);

  const feed = new ethers.Contract(USDC_USD_FEED, FEED_ABI, signer);

  const description = await feed.description();
  const decimals    = await feed.decimals();
  const [roundId, answer, startedAt, updatedAt] = await feed.latestRoundData();

  const price = Number(answer) / 10 ** Number(decimals);
  const age   = Math.floor(Date.now() / 1000) - Number(updatedAt);

  console.log("\n── Chainlink Feed ──────────────────────────────");
  console.log("Address    :", USDC_USD_FEED);
  console.log("Description:", description);
  console.log("Decimals   :", decimals.toString());
  console.log("Round ID   :", roundId.toString());
  console.log("Raw answer :", answer.toString(), `(${decimals} decimals)`);
  console.log("Price      : $" + price.toFixed(8));
  console.log("Updated    :", new Date(Number(updatedAt) * 1000).toISOString());
  console.log("Age        :", age, "seconds ago");
  console.log("────────────────────────────────────────────────\n");

  // Peg check: within 0.5% of $1.00
  const PEG         = 1e8;
  const TOLERANCE   = 50; // 50 bps = 0.5%
  const lower       = PEG * (10000 - TOLERANCE) / 10000;
  const upper       = PEG * (10000 + TOLERANCE) / 10000;
  const rawAnswer   = Number(answer);
  const pegHealthy  = rawAnswer >= lower && rawAnswer <= upper;

  console.log("Peg bounds : $" + (lower / 1e8).toFixed(4), "— $" + (upper / 1e8).toFixed(4));
  console.log("Peg status :", pegHealthy ? "✅  HEALTHY" : "❌  BROKEN");
}

main().catch((err) => { console.error(err); process.exit(1); });
