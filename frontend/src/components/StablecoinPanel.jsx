import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { ADDRESSES } from "../config/contracts";

function Field({ label, value }) {
  return (
    <div className="stat-card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-white mt-0.5 break-all">{value ?? "—"}</div>
    </div>
  );
}

export default function StablecoinPanel() {
  const { contracts, account } = useWeb3();
  const [info, setInfo]             = useState(null);
  const [mintAmt, setMintAmt]       = useState("");
  const [redeemAmt, setRedeemAmt]   = useState("");
  const [adminMintAmt, setAdminMintAmt] = useState("");
  const [burnAmt, setBurnAmt]       = useState("");
  const [txMsg, setTxMsg]           = useState(null);
  const [busy, setBusy]             = useState(false);

  async function loadInfo() {
    if (!contracts) return;
    try {
      const [supply, reserves, ratio, peg, bal, usdcBal, usdcAllowance, paused, treasury] = await Promise.all([
        contracts.ousd.totalSupply(),
        contracts.ousd.collateralReserves(),
        contracts.ousd.collateralRatio(),
        contracts.ousd.getPegStatus(),
        account ? contracts.ousd.balanceOf(account) : Promise.resolve(0n),
        account ? contracts.mockUSDC.balanceOf(account) : Promise.resolve(0n),
        account ? contracts.mockUSDC.allowance(account, ADDRESSES.OUSD_PROXY) : Promise.resolve(0n),
        contracts.ousd.paused(),
        contracts.ousd.treasury(),
      ]);
      setInfo({
        supply:       ethers.formatEther(supply),
        reserves:     ethers.formatUnits(reserves, 6),
        ratio:        (Number(ratio) / 100).toFixed(2),
        price:        (Number(peg.price) / 1e8).toFixed(6),
        healthy:      peg.healthy,
        bal:          ethers.formatEther(bal),
        usdcBal:      ethers.formatUnits(usdcBal, 6),
        usdcAllow:    ethers.formatUnits(usdcAllowance, 6),
        paused,
        treasury,
      });
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    loadInfo();
    const id = setInterval(loadInfo, 12000);
    return () => clearInterval(id);
  }, [contracts, account]);

  async function exec(label, fn) {
    setBusy(true);
    setTxMsg({ type: "info", text: `${label}: sending…` });
    try {
      const tx = await fn();
      setTxMsg({ type: "info", text: `${label}: waiting for confirmation…` });
      await tx.wait();
      setTxMsg({ type: "success", text: `${label}: confirmed!` });
      await loadInfo();
    } catch (e) {
      const msg = e?.reason ?? e?.message ?? String(e);
      setTxMsg({ type: "error", text: `${label}: ${msg}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleMintWithCollateral() {
    const usdc = parseFloat(mintAmt);
    if (!usdc || usdc <= 0) return;
    const usdcWei = ethers.parseUnits(mintAmt, 6);
    const currentAllow = await contracts.mockUSDC.allowance(account, ADDRESSES.OUSD_PROXY);
    if (currentAllow < usdcWei) {
      await exec("Approve USDC", () => contracts.mockUSDC.approve(ADDRESSES.OUSD_PROXY, usdcWei));
    }
    await exec("Mint OUSD", () => contracts.ousd.mintWithCollateral(usdcWei));
    setMintAmt("");
  }

  async function handleRedeem() {
    if (!redeemAmt || parseFloat(redeemAmt) <= 0) return;
    const ousdWei = ethers.parseEther(redeemAmt);
    await exec("Redeem OUSD", () => contracts.ousd.redeem(ousdWei));
    setRedeemAmt("");
  }

  async function handleAdminMint() {
    if (!adminMintAmt || parseFloat(adminMintAmt) <= 0) return;
    await exec("Admin Mint OUSD", () => contracts.ousd.mint(ethers.parseEther(adminMintAmt)));
    setAdminMintAmt("");
  }

  async function handleBurn() {
    if (!burnAmt || parseFloat(burnAmt) <= 0) return;
    await exec("Burn OUSD", () => contracts.ousd.burn(ethers.parseEther(burnAmt)));
    setBurnAmt("");
  }

  if (!contracts) return <p className="text-gray-400 py-12 text-center">Connect wallet to interact.</p>;

  return (
    <div className="space-y-5">
      {txMsg && (
        <div className={`text-sm px-4 py-2 rounded-lg ${
          txMsg.type === "success" ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700" :
          txMsg.type === "error"   ? "bg-red-900/40 text-red-300 border border-red-700" :
          "bg-indigo-900/40 text-indigo-300 border border-indigo-700"
        }`}>
          {txMsg.text}
        </div>
      )}

      <div>
        <h2 className="section-title">OUSD — Orion USD Stablecoin</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Total Supply"        value={info ? `${Number(info.supply).toLocaleString()} OUSD` : "…"} />
          <Field label="USDC Reserves"       value={info ? `${Number(info.reserves).toLocaleString()} USDC` : "…"} />
          <Field label="Collateral Ratio"    value={info ? `${info.ratio}%` : "…"} />
          <Field label="Peg Price (Chainlink)" value={info ? `$${info.price}` : "…"} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <Field label="Your OUSD Balance"   value={info ? `${info.bal} OUSD` : "…"} />
          <Field label="Your MockUSDC"       value={info ? `${info.usdcBal} USDC` : "…"} />
          <Field label="Status"              value={
            info ? (
              info.paused
                ? <span className="badge-red">Paused</span>
                : info.healthy
                  ? <span className="badge-green">On Peg</span>
                  : <span className="badge-yellow">Peg Broken</span>
            ) : "…"
          } />
        </div>
      </div>

      <div className="divider" />

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Mint OUSD (Collateral-Backed)</h3>
          <p className="text-xs text-gray-500">Deposit MockUSDC 1:1 to receive OUSD. Approves USDC automatically.</p>
          <div>
            <label className="label">USDC Amount</label>
            <input
              type="number" min="0" step="any"
              placeholder="e.g. 100"
              value={mintAmt}
              onChange={(e) => setMintAmt(e.target.value)}
            />
          </div>
          <button onClick={handleMintWithCollateral} disabled={busy || !mintAmt} className="btn-primary w-full">
            Approve &amp; Mint OUSD
          </button>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Redeem OUSD</h3>
          <p className="text-xs text-gray-500">Burn OUSD to receive USDC back from reserves.</p>
          <div>
            <label className="label">OUSD Amount</label>
            <input
              type="number" min="0" step="any"
              placeholder="e.g. 100"
              value={redeemAmt}
              onChange={(e) => setRedeemAmt(e.target.value)}
            />
          </div>
          <button onClick={handleRedeem} disabled={busy || !redeemAmt} className="btn-danger w-full">
            Redeem OUSD
          </button>
        </div>
      </div>

      <div className="divider" />

      <div>
        <h2 className="section-title">Admin Functions</h2>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-white">Admin Mint (to Treasury)</h3>
            <p className="text-xs text-gray-500">Requires MINTER_ROLE. Mints OUSD directly to treasury without collateral.</p>
            <div>
              <label className="label">OUSD Amount</label>
              <input
                type="number" min="0" step="any"
                placeholder="e.g. 1000"
                value={adminMintAmt}
                onChange={(e) => setAdminMintAmt(e.target.value)}
              />
            </div>
            <button onClick={handleAdminMint} disabled={busy || !adminMintAmt} className="btn-primary w-full">
              Admin Mint
            </button>
          </div>

          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-white">Burn OUSD</h3>
            <p className="text-xs text-gray-500">Burns OUSD from your balance.</p>
            <div>
              <label className="label">OUSD Amount</label>
              <input
                type="number" min="0" step="any"
                placeholder="e.g. 50"
                value={burnAmt}
                onChange={(e) => setBurnAmt(e.target.value)}
              />
            </div>
            <button onClick={handleBurn} disabled={busy || !burnAmt} className="btn-danger w-full">
              Burn OUSD
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => exec("Pause OUSD", () => contracts.ousd.pause())}
            disabled={busy || info?.paused}
            className="btn-danger"
          >
            Pause OUSD
          </button>
          <button
            onClick={() => exec("Unpause OUSD", () => contracts.ousd.unpause())}
            disabled={busy || !info?.paused}
            className="btn-success"
          >
            Unpause OUSD
          </button>
        </div>
      </div>
    </div>
  );
}
