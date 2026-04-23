import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { ADDRESSES } from "../config/contracts";

export default function DistributionPanel() {
  const { contracts, account } = useWeb3();
  const [info, setInfo] = useState(null);
  const [txMsg, setTxMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [transferAmt, setTransferAmt] = useState("");
  const [transferType, setTransferType] = useState("ORN");

  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawType, setWithdrawType] = useState("ORN");

  const [burnAmt, setBurnAmt] = useState("");
  const [burnType, setBurnType] = useState("ORN");

  async function loadInfo() {
    if (!contracts || !account) return;
    try {
      const [ornBal, ousdBal, contractOrnBal, contractOusdBal, paused] = await Promise.all([
        contracts.dist.getTokenBalance(account, "ORN"),
        contracts.dist.getTokenBalance(account, "OUSD"),
        contracts.orn.balanceOf(ADDRESSES.DIST_PROXY),
        contracts.ousd.balanceOf(ADDRESSES.DIST_PROXY),
        contracts.dist.paused(),
      ]);
      setInfo({
        yourOrnBal:  ethers.formatEther(ornBal),
        yourOusdBal: ethers.formatEther(ousdBal),
        contractOrn:  ethers.formatEther(contractOrnBal),
        contractOusd: ethers.formatEther(contractOusdBal),
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
        <h2 className="section-title">OrionDistribution Contract</h2>
        <p className="text-xs text-gray-500 mb-3">
          Holds ORN and OUSD for distribution. Admin-controlled transfers, withdrawals, and burns.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="text-xs text-gray-500">Contract ORN Balance</div>
            <div className="text-lg font-semibold text-white">
              {info ? `${Number(info.contractOrn).toLocaleString(undefined, { maximumFractionDigits: 2 })} ORN` : "…"}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">Contract OUSD Balance</div>
            <div className="text-lg font-semibold text-white">
              {info ? `${Number(info.contractOusd).toLocaleString(undefined, { maximumFractionDigits: 2 })} OUSD` : "…"}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">Your Tracked ORN</div>
            <div className="text-lg font-semibold text-white">
              {info ? `${Number(info.yourOrnBal).toLocaleString(undefined, { maximumFractionDigits: 4 })} ORN` : "…"}
            </div>
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

      <div className="grid md:grid-cols-3 gap-5">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Transfer Token</h3>
          <p className="text-xs text-gray-500">Send tokens from the distribution contract to a recipient. Requires admin role.</p>
          <div>
            <label className="label">Recipient</label>
            <input type="text" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0" step="any" placeholder="e.g. 100" value={transferAmt} onChange={(e) => setTransferAmt(e.target.value)} />
          </div>
          <div>
            <label className="label">Token Type</label>
            <select value={transferType} onChange={(e) => setTransferType(e.target.value)}>
              <option value="ORN">ORN</option>
              <option value="OUSD">OUSD</option>
            </select>
          </div>
          <button
            onClick={() => {
              exec("Transfer Token", () =>
                contracts.dist.transferToken(recipient, ethers.parseEther(transferAmt), transferType)
              );
              setRecipient(""); setTransferAmt("");
            }}
            disabled={busy || !recipient || !transferAmt}
            className="btn-primary w-full"
          >
            Transfer
          </button>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Withdraw Tokens</h3>
          <p className="text-xs text-gray-500">Withdraws tokens from the distribution vault to the caller. Requires admin role.</p>
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0" step="any" placeholder="e.g. 100" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
          </div>
          <div>
            <label className="label">Token Type</label>
            <select value={withdrawType} onChange={(e) => setWithdrawType(e.target.value)}>
              <option value="ORN">ORN</option>
              <option value="OUSD">OUSD</option>
            </select>
          </div>
          <button
            onClick={() => {
              exec("Withdraw Tokens", () =>
                contracts.dist.withdrawTokens(ethers.parseEther(withdrawAmt), withdrawType)
              );
              setWithdrawAmt("");
            }}
            disabled={busy || !withdrawAmt}
            className="btn-success w-full"
          >
            Withdraw
          </button>
        </div>

        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Burn Tokens</h3>
          <p className="text-xs text-gray-500">Burns tokens held in the distribution contract. Requires admin role.</p>
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0" step="any" placeholder="e.g. 100" value={burnAmt} onChange={(e) => setBurnAmt(e.target.value)} />
          </div>
          <div>
            <label className="label">Token Type</label>
            <select value={burnType} onChange={(e) => setBurnType(e.target.value)}>
              <option value="ORN">ORN</option>
              <option value="OUSD">OUSD</option>
            </select>
          </div>
          <button
            onClick={() => {
              exec("Burn Tokens", () =>
                contracts.dist.burnTokens(ethers.parseEther(burnAmt), burnType)
              );
              setBurnAmt("");
            }}
            disabled={busy || !burnAmt}
            className="btn-danger w-full"
          >
            Burn
          </button>
        </div>
      </div>

      <div className="divider" />

      <div>
        <h2 className="section-title">Admin Controls</h2>
        <div className="flex gap-3">
          <button onClick={() => exec("Pause Distribution", () => contracts.dist.pause())} disabled={busy || info?.paused} className="btn-danger">
            Pause
          </button>
          <button onClick={() => exec("Unpause Distribution", () => contracts.dist.unpause())} disabled={busy || !info?.paused} className="btn-success">
            Unpause
          </button>
        </div>
      </div>
    </div>
  );
}
