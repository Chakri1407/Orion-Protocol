const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const E6  = 10n ** 6n;   // 1 USDC  (6 decimals)
const E18 = 10n ** 18n;  // 1 OUSD  (18 decimals)

// Chainlink 8-decimal prices
const PRICE_1_00  = 100_000_000n; // $1.000 — healthy peg
const PRICE_0_99  = 99_000_000n;  // $0.990 — within 0.5% tolerance (99.0%)
const PRICE_0_994 = 99_400_000n;  // $0.994 — inside tolerance boundary
const PRICE_0_994_bad = 99_450_001n; // just inside lower bound (99.5%)
const PRICE_0_993 = 99_300_000n;  // $0.993 — outside 0.5% tolerance → breaks peg

describe("OrionStablecoin — USD peg", function () {
  let ousd, usdc, priceFeed;
  let admin, treasury, user, owner1;

  beforeEach(async function () {
    [admin, treasury, user, owner1] = await ethers.getSigners();

    // Deploy mocks
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const MockFeed = await ethers.getContractFactory("MockAggregatorV3");
    priceFeed = await MockFeed.deploy(PRICE_1_00);

    // Deploy OUSD via UUPS proxy
    const OUSD = await ethers.getContractFactory("OrionStablecoin");
    ousd = await upgrades.deployProxy(OUSD, [
      "Orion USD",
      "OUSD",
      admin.address,
      treasury.address,
      0n,                      // no admin supply on deploy
      [owner1.address],
      await usdc.getAddress(),
      await priceFeed.getAddress()
    ], { kind: "uups" });

    // Give user 1000 USDC
    await usdc.mint(user.address, 1000n * E6);
    await usdc.connect(user).approve(await ousd.getAddress(), ethers.MaxUint256);
  });

  // ── mintWithCollateral ───────────────────────────────────────────────────────

  describe("mintWithCollateral", function () {
    it("mints 1 OUSD (18 dec) for 1 USDC (6 dec) at healthy peg", async function () {
      await ousd.connect(user).mintWithCollateral(1n * E6);

      expect(await ousd.balanceOf(user.address)).to.equal(1n * E18);
      expect(await ousd.collateralReserves()).to.equal(1n * E6);
    });

    it("mints correct amount for 100 USDC", async function () {
      await ousd.connect(user).mintWithCollateral(100n * E6);

      expect(await ousd.balanceOf(user.address)).to.equal(100n * E18);
      expect(await ousd.collateralReserves()).to.equal(100n * E6);
    });

    it("pulls USDC from user wallet", async function () {
      const before = await usdc.balanceOf(user.address);
      await ousd.connect(user).mintWithCollateral(50n * E6);
      expect(await usdc.balanceOf(user.address)).to.equal(before - 50n * E6);
    });

    it("collateral ratio is 100% after mint", async function () {
      await ousd.connect(user).mintWithCollateral(100n * E6);
      expect(await ousd.collateralRatio()).to.equal(10_000n);
    });

    it("reverts when price is outside 0.5% tolerance", async function () {
      await priceFeed.setPrice(PRICE_0_993); // $0.993 — too far below $1
      await expect(
        ousd.connect(user).mintWithCollateral(1n * E6)
      ).to.be.revertedWithCustomError(ousd, "PegBroken");
    });

    it("allows mint when price is at edge of tolerance ($0.9950)", async function () {
      await priceFeed.setPrice(99_500_000n); // exactly 0.5% below $1
      await expect(
        ousd.connect(user).mintWithCollateral(1n * E6)
      ).to.not.be.reverted;
    });

    it("reverts if collateral token is not set", async function () {
      const OUSD2 = await ethers.getContractFactory("OrionStablecoin");
      const ousd2 = await upgrades.deployProxy(OUSD2, [
        "Orion USD", "OUSD",
        admin.address, treasury.address, 0n, [],
        ethers.ZeroAddress,  // no collateral
        await priceFeed.getAddress()
      ], { kind: "uups" });
      await expect(
        ousd2.connect(user).mintWithCollateral(1n * E6)
      ).to.be.revertedWithCustomError(ousd2, "CollateralNotSet");
    });
  });

  // ── redeem ───────────────────────────────────────────────────────────────────

  describe("redeem", function () {
    beforeEach(async function () {
      // Give user some OUSD to redeem
      await ousd.connect(user).mintWithCollateral(100n * E6);
    });

    it("burns 1 OUSD and returns 1 USDC", async function () {
      const usdcBefore = await usdc.balanceOf(user.address);
      await ousd.connect(user).redeem(1n * E18);

      expect(await ousd.balanceOf(user.address)).to.equal(99n * E18);
      expect(await usdc.balanceOf(user.address)).to.equal(usdcBefore + 1n * E6);
    });

    it("updates collateralReserves correctly", async function () {
      await ousd.connect(user).redeem(50n * E18);
      expect(await ousd.collateralReserves()).to.equal(50n * E6);
    });

    it("collateral ratio stays 100% after partial redeem", async function () {
      await ousd.connect(user).redeem(40n * E18);
      expect(await ousd.collateralRatio()).to.equal(10_000n);
    });

    it("reverts when user has insufficient OUSD", async function () {
      await expect(
        ousd.connect(user).redeem(101n * E18)
      ).to.be.revertedWith("Insufficient OUSD balance");
    });

    it("reverts when reserves are below redemption amount", async function () {
      // Admin-mint extra unbacked OUSD to treasury, then treasury tries to redeem
      await ousd.connect(admin).mint(200n * E18);
      // Transfer to user so user holds more OUSD than reserves back
      await ousd.connect(treasury).transfer(user.address, 200n * E18);
      // Now user has 300 OUSD but reserves only hold 100 USDC (100 OUSD worth)
      await expect(
        ousd.connect(user).redeem(200n * E18)
      ).to.be.revertedWithCustomError(ousd, "InsufficientCollateralReserves");
    });
  });

  // ── getPegStatus ─────────────────────────────────────────────────────────────

  describe("getPegStatus", function () {
    it("returns healthy at $1.00", async function () {
      const [price, healthy] = await ousd.getPegStatus();
      expect(price).to.equal(PRICE_1_00);
      expect(healthy).to.be.true;
    });

    it("returns healthy at $0.9950 (edge of tolerance)", async function () {
      await priceFeed.setPrice(99_500_000n);
      const [, healthy] = await ousd.getPegStatus();
      expect(healthy).to.be.true;
    });

    it("returns unhealthy below tolerance", async function () {
      await priceFeed.setPrice(PRICE_0_993);
      const [, healthy] = await ousd.getPegStatus();
      expect(healthy).to.be.false;
    });
  });

  // ── collateralRatio ───────────────────────────────────────────────────────────

  describe("collateralRatio", function () {
    it("returns 0 when supply is zero", async function () {
      expect(await ousd.collateralRatio()).to.equal(0n);
    });

    it("returns < 10000 bps when admin-minted supply exists without collateral", async function () {
      await ousd.connect(admin).mint(100n * E18);
      expect(await ousd.collateralRatio()).to.equal(0n); // 0% — no reserves
    });

    it("returns 10000 bps (100%) when fully collateral-backed", async function () {
      await ousd.connect(user).mintWithCollateral(100n * E6);
      expect(await ousd.collateralRatio()).to.equal(10_000n);
    });

    it("blended ratio when mix of admin-mint and collateral-mint exists", async function () {
      await ousd.connect(admin).mint(100n * E18);       // 100 unbacked
      await ousd.connect(user).mintWithCollateral(100n * E6); // 100 backed
      // total supply = 200, reserves normalized = 100e18
      // ratio = 100/200 * 10000 = 5000 bps = 50%
      expect(await ousd.collateralRatio()).to.equal(5_000n);
    });
  });

  // ── admin setters ─────────────────────────────────────────────────────────────

  describe("setCollateralToken / setPriceFeed", function () {
    it("admin can update collateral token", async function () {
      const MockUSDC2 = await ethers.getContractFactory("MockUSDC");
      const usdc2 = await MockUSDC2.deploy();
      await ousd.connect(admin).setCollateralToken(await usdc2.getAddress());
      expect(await ousd.collateralToken()).to.equal(await usdc2.getAddress());
    });

    it("admin can update price feed", async function () {
      const MockFeed2 = await ethers.getContractFactory("MockAggregatorV3");
      const feed2 = await MockFeed2.deploy(PRICE_1_00);
      await ousd.connect(admin).setPriceFeed(await feed2.getAddress());
      expect(await ousd.priceFeed()).to.equal(await feed2.getAddress());
    });

    it("non-admin cannot update collateral token", async function () {
      await expect(
        ousd.connect(user).setCollateralToken(await usdc.getAddress())
      ).to.be.reverted;
    });
  });
});
