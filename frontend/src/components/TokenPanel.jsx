import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";

export default function TokenPanel() {
  const { contracts, account } = useWeb3();
  const [info, setInfo]       = useState(null);
  const [mintAmt, setMintAmt] = useState("");
  const [burnAmt, setBurnAmt] = useState("");
  const [txTo, setTxTo]       = useState("");
  const [txAmt, setTxAmt]     = useState("");
  const [newTreasury, setNewTreasury] = useState("");
  const [txMsg, setTxMsg]     = useState(null);
  const [busy, setBusy]       = useState(false);

  async function loadInfo() {
    if (!contracts) return;
    try {
      const [supply, bal, treasury, paused] = await Promise.all([
        contracts.orn.totalSupply(),
        account ? contracts.orn.balanceOf(account) : Promise.resolve(0n),
        contracts.orn.treasury(),
        contracts.orn.paused(),
      ]);
      setInfo({
        supply:   ethers.formatEther(supply),
        bal:      ethers.formatEther(bal),
        treasury,
        paused,
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
      setTxMsg({ type: "info", text: `${label}: waiting…` });
      await tx.wait();
      setTxMsg({ type: "success", text: `${label}: confirmed!` });
      await loadInfo();
    } catch (e) {
      setTxMsg({ type: "error", text: `${label}: ${e?.reason ?? e?.message ?? String(e)}` });
    } finally {
      setBusy(false);
    }
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
        <h2 className="section-title">ORN — Orion Governance Token</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="text-xs text-gray-500">Total Supply</div>
            <div className="text-lg font-semibold text-white">
              {info ? `${Number(info.supply).toLocaleString()} ORN` : "…"}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">Your Balance</div>
            <div className="text-lg font-semibold text-white">
              {info ? `${Number(info.bal).toLocaleString(undefined, { maximumFractionDigits: 4 })} ORN` : "…"}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">Treasury</div>
            <div className="text-xs text-indigo-400 mt-0.5 break-all">{info?.treasury ?? "…"}</div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">Status</div>
            <div className="mt-1">
              {info ? (
                info.paused
                  ? <span className="badge-red">Paused</span>
                  : <span className="badge-green">Active</span>
              ) : "…"}
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Mint ORN (to Treasury)</h3>
          <p className="text-xs text-gray-500">Requires MINTER_ROLE. Mints ORN tokens to the treasury address.</p>
          <div>
            <label className="label">ORN Amount</label>
            <input
              type="number" min="0" step="any"
              placeholder="e.g. 1000"
              value={mintAmt}
              onChange={(e) => setMintAmt(e.target.value)}
            />
          </div>
          <button
            onClick={() => { exec("Mint ORN", () => contracts.orn.mint(ethers.parseEther(mintAmt))); setMintAmt(""); }}
            disabled={busy || !mintAmt}
            className="btn-primary w-full"
          >
            Mint ORN
          </button>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Burn ORN</h3>
          <p className="text-xs text-gray-500">Burns ORN from your own balance.</p>
          <div>
            <label className="label">ORN Amount</label>
            <input
              type="number" min="0" step="any"
              placeholder="e.g. 100"
              value={burnAmt}
              onChange={(e) => setBurnAmt(e.target.value)}
            />
          </div>
          <button
            onClick={() => { exec("Burn ORN", () => contracts.orn.burn(ethers.parseEther(burnAmt))); setBurnAmt(""); }}
            disabled={busy || !burnAmt}
            className="btn-danger w-full"
          >
            Burn ORN
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-white">Transfer ORN</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label">Recipient Address</label>
            <input
              type="text"
              placeholder="0x…"
              value={txTo}
              onChange={(e) => setTxTo(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Amount (ORN)</label>
            <input
              type="number" min="0" step="any"
              placeholder="e.g. 100"
              value={txAmt}
              onChange={(e) => setTxAmt(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={() => {
            exec("Transfer ORN", () => contracts.orn.transfer(txTo, ethers.parseEther(txAmt)));
            setTxTo(""); setTxAmt("");
          }}
          disabled={busy || !txTo || !txAmt}
          className="btn-primary"
        >
          Transfer
        </button>
      </div>

      <div className="divider" />

      <div>
        <h2 className="section-title">Admin Functions</h2>
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Update Treasury Address</h3>
          <p className="text-xs text-gray-500">Requires DEFAULT_ADMIN_ROLE.</p>
          <div>
            <label className="label">New Treasury Address</label>
            <input
              type="text"
              placeholder="0x…"
              value={newTreasury}
              onChange={(e) => setNewTreasury(e.target.value)}
            />
          </div>
          <button
            onClick={() => { exec("Update Treasury", () => contracts.orn.updateTreasury(newTreasury)); setNewTreasury(""); }}
            disabled={busy || !newTreasury}
            className="btn-primary"
          >
            Update Treasury
          </button>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={() => exec("Pause ORN", () => contracts.orn.pause())} disabled={busy || info?.paused} className="btn-danger">
            Pause ORN
          </button>
          <button onClick={() => exec("Unpause ORN", () => contracts.orn.unpause())} disabled={busy || !info?.paused} className="btn-success">
            Unpause ORN
          </button>
        </div>
      </div>
    </div>
  );
}
