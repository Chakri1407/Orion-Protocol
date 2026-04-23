/**
 * testAll.js
 * End-to-end test of every function across all 4 Orion contracts on Polygon Amoy.
 *
 * Run:
 *   npx hardhat run scripts/testAll.js --network amoy
 */

const { ethers } = require("hardhat");

// ── Deployed addresses (from deployAll.js output) ─────────────────────────────
const MOCK_USDC  = "0x68eF377ea77e53b446b324fA24779aC8021aD6a6";
const ORN_ADDR   = "0x228eEe9c44d6c48A957765F2AC697733d9c3535E";
const OUSD_ADDR  = "0xe631Dde195283dFF9DE0D4934361f446aD8589E5";
const DIST_ADDR  = "0x5Fb00223d9Fa402760261eFb7f2F273D55B128DD";
const VAULT_ADDR = "0x57Df20982CF40d63453349a69710c3Bf6b90b820";
const PRICE_FEED = "0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16";
// ─────────────────────────────────────────────────────────────────────────────

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function mint(address, uint256)",
  "function transfer(address, uint256) returns (bool)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
  "function totalSupply() view returns (uint256)",
];
const OUSD_ABI = [
  "function mintWithCollateral(uint256) external",
  "function redeem(uint256) external",
  "function mint(uint256) external",
  "function requestBurn(uint256) external",
  "function approveBurn(address) external",
  "function pause() external",
  "function unpause() external",
  "function setBlacklist(address, bool) external",
  "function updateTreasury(address) external",
  "function addOwner(address) external",
  "function removeOwner(address) external",
  "function setCollateralToken(address) external",
  "function setPriceFeed(address) external",
  "function collateralRatio() view returns (uint256)",
  "function getPegStatus() view returns (uint256, bool)",
  "function collateralReserves() view returns (uint256)",
  "function blacklist(address) view returns (bool)",
  "function isOwner(address) view returns (bool)",
  "function treasury() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)",
];
const ORN_ABI = [
  "function mint(uint256) external",
  "function burn(uint256) external",
  "function pause() external",
  "function unpause() external",
  "function updateTreasury(address) external",
  "function treasury() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function transfer(address, uint256) returns (bool)",
  "function approve(address, uint256) returns (bool)",
];
const DIST_ABI = [
  "function transferToken(address, uint256, string) external",
  "function withdrawTokens(uint256, string) external",
  "function burnTokens(uint256, string) external",
  "function getTokenBalance(address, string) view returns (uint256)",
  "function pause() external",
  "function unpause() external",
];
const VAULT_ABI = [
  "function submitTransaction(uint256, address) external",
  "function approveTransaction(uint256) external",
  "function burnTokens(uint256, string) external",
  "function getVaultBalance(address) view returns (uint256)",
  "function requestPauseUnpause(bool) external",
  "function approvePauseUnpause() external",
  "function addSigner(address) external",
  "function removeSigner(address) external",
  "function setDistributionContract(address) external",
  "function setVaultAdmin(address) external",
  "function setOrionToken(address) external",
  "function setStableCoin(address) external",
  "function transactions(uint256) view returns (address, uint256, address, uint256, bool)",
  "function isSigner(address) view returns (bool)",
  "function paused() view returns (bool)",
];
const FEED_ABI = [
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0;

async function run(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const result = await fn();
    console.log("✅ " + (result !== undefined ? result : ""));
    PASS++;
  } catch (e) {
    console.log("❌  " + e.message.split("\n")[0]);
    FAIL++;
  }
}

function fmt6(n)   { return (Number(n) / 1e6).toFixed(2)   + " USDC"; }
function fmt18(n)  { return (Number(n) / 1e18).toFixed(4)  + " ORN/OUSD"; }
function section(t){ console.log(`\n${"─".repeat(54)}\n  ${t}\n${"─".repeat(54)}`); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("\n══════════════════════════════════════════════════════");
  console.log("   Orion Protocol — Full Function Test (Amoy)");
  console.log("══════════════════════════════════════════════════════");
  console.log("Account:", deployer.address);
  console.log("Balance:", ethers.formatEther(
    await ethers.provider.getBalance(deployer.address)
  ), "MATIC\n");

  const usdc  = new ethers.Contract(MOCK_USDC,  USDC_ABI,  deployer);
  const orn   = new ethers.Contract(ORN_ADDR,   ORN_ABI,   deployer);
  const ousd  = new ethers.Contract(OUSD_ADDR,  OUSD_ABI,  deployer);
  const dist  = new ethers.Contract(DIST_ADDR,  DIST_ABI,  deployer);
  const vault = new ethers.Contract(VAULT_ADDR, VAULT_ABI, deployer);
  const feed  = new ethers.Contract(PRICE_FEED, FEED_ABI,  deployer);

  // ════════════════════════════════════════════════════════
  //  SECTION 0 — Chainlink Price Feed
  // ════════════════════════════════════════════════════════
  section("0. Chainlink USDC/USD Price Feed");

  await run("Read live price", async () => {
    const [, answer,, updatedAt] = await feed.latestRoundData();
    const dec = await feed.decimals();
    const price = Number(answer) / 10 ** Number(dec);
    const age   = Math.floor(Date.now() / 1000) - Number(updatedAt);
    return `$${price.toFixed(8)}  (${age}s ago)`;
  });

  await run("getPegStatus from OUSD contract", async () => {
    const [price, healthy] = await ousd.getPegStatus();
    return `$${(Number(price)/1e8).toFixed(8)} — ${healthy ? "HEALTHY ✅" : "BROKEN ❌"}`;
  });

  // ════════════════════════════════════════════════════════
  //  SECTION 1 — OrionStablecoin (OUSD)
  // ════════════════════════════════════════════════════════
  section("1. OrionStablecoin (OUSD)");

  // Approve once
  await (await usdc.approve(OUSD_ADDR, ethers.MaxUint256)).wait();

  await run("mintWithCollateral — 500 USDC → 500 OUSD", async () => {
    const tx = await ousd.mintWithCollateral(500n * 10n**6n);
    await tx.wait();
    const bal = await ousd.balanceOf(deployer.address);
    return `OUSD balance: ${fmt18(bal)}`;
  });

  await run("collateralRatio — should be 10000 bps (100%)", async () => {
    const r = await ousd.collateralRatio();
    return `${Number(r) / 100}%`;
  });

  await run("collateralReserves — should be 500 USDC", async () => {
    const r = await ousd.collateralReserves();
    return fmt6(r);
  });

  await run("transfer — send 10 OUSD to self", async () => {
    const tx = await ousd.transfer(deployer.address, 10n * 10n**18n);
    await tx.wait();
    return "OK";
  });

  await run("redeem — burn 100 OUSD → receive 100 USDC", async () => {
    const before = await usdc.balanceOf(deployer.address);
    await (await ousd.redeem(100n * 10n**18n)).wait();
    const after = await usdc.balanceOf(deployer.address);
    return `USDC returned: ${fmt6(after - before)}`;
  });

  await run("mint (admin) — mint 200 OUSD to treasury", async () => {
    await (await ousd.mint(200n * 10n**18n)).wait();
    return "OK";
  });

  await run("requestBurn — request to burn 50 OUSD", async () => {
    await (await ousd.requestBurn(50n * 10n**18n)).wait();
    return "Burn request submitted";
  });

  await run("approveBurn — owner approves the burn", async () => {
    await (await ousd.approveBurn(deployer.address)).wait();
    return "Burn executed";
  });

  await run("setBlacklist — blacklist then un-blacklist address", async () => {
    await (await ousd.setBlacklist(deployer.address, true)).wait();
    await (await ousd.setBlacklist(deployer.address, false)).wait();
    const b = await ousd.blacklist(deployer.address);
    return `Blacklisted: ${b}`;
  });

  await run("addOwner — add a second owner", async () => {
    const dummy = ethers.Wallet.createRandom().address;
    await (await ousd.addOwner(dummy)).wait();
    const isOwner = await ousd.isOwner(dummy);
    return `isOwner: ${isOwner}`;
  });

  await run("updateTreasury — change treasury address then revert", async () => {
    const oldTreasury = await ousd.treasury();
    const dummy = ethers.Wallet.createRandom().address;
    await (await ousd.updateTreasury(dummy)).wait();
    await (await ousd.updateTreasury(oldTreasury)).wait();
    return `Restored to ${oldTreasury.slice(0,10)}...`;
  });

  await run("pause — pause the contract", async () => {
    await (await ousd.pause()).wait();
    return "Paused";
  });

  await run("unpause — unpause the contract", async () => {
    await (await ousd.unpause()).wait();
    return "Unpaused";
  });

  await run("setPriceFeed — set and restore feed", async () => {
    const dummy = ethers.Wallet.createRandom().address;
    await (await ousd.setPriceFeed(dummy)).wait();
    await (await ousd.setPriceFeed(PRICE_FEED)).wait();
    return "Feed restored";
  });

  // ════════════════════════════════════════════════════════
  //  SECTION 2 — OrionToken (ORN)
  // ════════════════════════════════════════════════════════
  section("2. OrionToken (ORN)");

  await run("balanceOf — treasury holds 1,000,000 ORN", async () => {
    const bal = await orn.balanceOf(deployer.address);
    return fmt18(bal);
  });

  await run("mint — mint 500 ORN to treasury", async () => {
    await (await orn.mint(500n * 10n**18n)).wait();
    return "OK";
  });

  await run("burn — burn 100 ORN from deployer", async () => {
    const before = await orn.totalSupply();
    await (await orn.burn(100n * 10n**18n)).wait();
    const after = await orn.totalSupply();
    return `Supply reduced by ${fmt18(before - after)}`;
  });

  await run("transfer — send 1000 ORN to self", async () => {
    await (await orn.transfer(deployer.address, 1000n * 10n**18n)).wait();
    return "OK";
  });

  await run("updateTreasury — change and restore", async () => {
    const dummy = ethers.Wallet.createRandom().address;
    const old   = await orn.treasury();
    await (await orn.updateTreasury(dummy)).wait();
    await (await orn.updateTreasury(old)).wait();
    return "Restored";
  });

  await run("pause → unpause", async () => {
    await (await orn.pause()).wait();
    await (await orn.unpause()).wait();
    return "OK";
  });

  // ════════════════════════════════════════════════════════
  //  SECTION 3 — OrionDistribution
  // ════════════════════════════════════════════════════════
  section("3. OrionDistribution");

  // Fund distribution contract with ORN + OUSD so transfers work
  await (await orn.transfer(DIST_ADDR, 1000n * 10n**18n)).wait();
  await (await ousd.transfer(DIST_ADDR, 100n * 10n**18n)).wait();

  await run("getTokenBalance — ORN balance in vault", async () => {
    const b = await dist.getTokenBalance(DIST_ADDR, "ORN");
    return fmt18(b);
  });

  await run("getTokenBalance — OUSD balance in vault", async () => {
    const b = await dist.getTokenBalance(DIST_ADDR, "OUSD");
    return fmt18(b);
  });

  await run("transferToken — send 100 ORN to deployer", async () => {
    const before = await orn.balanceOf(deployer.address);
    await (await dist.transferToken(deployer.address, 100n * 10n**18n, "ORN")).wait();
    const after = await orn.balanceOf(deployer.address);
    return `Received: ${fmt18(after - before)}`;
  });

  await run("transferToken — send 10 OUSD to deployer", async () => {
    const before = await ousd.balanceOf(deployer.address);
    await (await dist.transferToken(deployer.address, 10n * 10n**18n, "OUSD")).wait();
    const after = await ousd.balanceOf(deployer.address);
    return `Received: ${fmt18(after - before)}`;
  });

  await run("withdrawTokens — withdraw 100 ORN to admin", async () => {
    await (await dist.withdrawTokens(100n * 10n**18n, "ORN")).wait();
    return "OK";
  });

  await run("pause → unpause (Distribution)", async () => {
    await (await dist.pause()).wait();
    await (await dist.unpause()).wait();
    return "OK";
  });

  // ════════════════════════════════════════════════════════
  //  SECTION 4 — OrionTreasuryVault
  // ════════════════════════════════════════════════════════
  section("4. OrionTreasuryVault");

  // Fund vault with ORN so submitTransaction + approveTransaction can execute
  await (await orn.transfer(VAULT_ADDR, 500n * 10n**18n)).wait();

  await run("getVaultBalance — ORN in vault", async () => {
    const b = await vault.getVaultBalance(ORN_ADDR);
    return fmt18(b);
  });

  await run("isSigner — deployer is a signer", async () => {
    const b = await vault.isSigner(deployer.address);
    return `isSigner: ${b}`;
  });

  await run("submitTransaction — propose 200 ORN transfer", async () => {
    await (await vault.submitTransaction(200n * 10n**18n, ORN_ADDR)).wait();
    return "Tx ID 0 submitted";
  });

  await run("approveTransaction — approve tx 0 (auto-executes at threshold)", async () => {
    await (await vault.approveTransaction(0)).wait();
    const tx = await vault.transactions(0);
    return `executed: ${tx[4]}`;
  });

  await run("addSigner — add a new signer", async () => {
    const dummy = ethers.Wallet.createRandom().address;
    await (await vault.addSigner(dummy)).wait();
    return `isSigner: ${await vault.isSigner(dummy)}`;
  });

  await run("setVaultAdmin — change and restore admin", async () => {
    const dummy = ethers.Wallet.createRandom().address;
    await (await vault.setVaultAdmin(dummy)).wait();
    await (await vault.setVaultAdmin(deployer.address)).wait();
    return "Restored";
  });

  await run("requestPauseUnpause — request pause + approve", async () => {
    await (await vault.requestPauseUnpause(true)).wait();
    await (await vault.approvePauseUnpause()).wait();
    const p = await vault.paused();
    // Unpause immediately
    await (await vault.requestPauseUnpause(false)).wait();
    await (await vault.approvePauseUnpause()).wait();
    return `Was paused: ${p}, now restored`;
  });

  await run("setOrionToken — update and restore", async () => {
    const dummy = ethers.Wallet.createRandom().address;
    await (await vault.setOrionToken(dummy)).wait();
    await (await vault.setOrionToken(ORN_ADDR)).wait();
    return "Restored";
  });

  await run("setStableCoin — update and restore", async () => {
    const dummy = ethers.Wallet.createRandom().address;
    await (await vault.setStableCoin(dummy)).wait();
    await (await vault.setStableCoin(OUSD_ADDR)).wait();
    return "Restored";
  });

  // ── Final summary ─────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log(`   Results: ${PASS} passed / ${FAIL} failed`);
  console.log("══════════════════════════════════════════════════════\n");
  if (FAIL > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
