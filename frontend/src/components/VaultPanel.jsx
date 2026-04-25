import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { ADDRESSES } from "../config/contracts";

function TxRow({ tx, idx, onApprove, busy }) {
  const tokenLabel =
    tx.token?.toLowerCase() === ADDRESSES.ORN_PROXY.toLowerCase()  ? "ORN"  :
    tx.token?.toLowerCase() === ADDRESSES.OUSD_PROXY.toLowerCase() ? "OUSD" : tx.token;

  return (
    <div className="card flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-1 space-y-1 font-mono text-xs">
        <div className="text-gray-400">
          Tx #{idx} — Token: <span className="text-indigo-400">{tokenLabel}</span>
        </div>
        <div className="text-gray-400">To: <span className="text-white">{tx.to}</span></div>
        <div className="text-gray-300">
          Amount: {ethers.formatEther(tx.amount ?? 0n)} — Approvals: {String(tx.approvals ?? 0)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {tx.executed
          ? <span className="badge-green">Executed</span>
          : (
            <button onClick={() => onApprove(idx)} disabled={busy} className="btn-success text-xs py-1 px-3">
              Approve
            </button>
          )
        }
      </div>
    </div>
  );
}

export default function VaultPanel() {
  const { contracts, account } = useWeb3();
  const [info, setInfo] = useState(null);
  const [txs, setTxs]   = useState([]);
  const [txMsg, setTxMsg] = useState(null);
  const [busy, setBusy]   = useState(false);

  const [submitAmt, setSubmitAmt]   = useState("");
  const [submitToken, setSubmitToken] = useState("ORN");

  const [newSigner, setNewSigner] = useState("");
  const [rmSigner, setRmSigner]   = useState("");

  async function loadInfo() {
    if (!contracts) return;
    try {
      const [orn, ousd, admin, required, paused, pauseReq, isSigner] = await Promise.all([
        contracts.vault.getVaultBalance(ADDRESSES.ORN_PROXY),
        contracts.vault.getVaultBalance(ADDRESSES.OUSD_PROXY),
        contracts.vault.vaultAdmin(),
        contracts.vault.requiredApprovals(),
        contracts.vault.paused(),
        contracts.vault.pauseRequest(),
        account ? contracts.vault.isSigner(account) : Promise.resolve(false),
      ]);
      setInfo({
        orn: ethers.formatEther(orn),
        ousd: ethers.formatEther(ousd),
        admin,
        required: required.toString(),
        paused,
        pauseReq: {
          pause:     pauseReq[0],
          approvals: pauseReq[1],
          executed:  pauseReq[2],
        },
        isSigner,
      });

      const txList = [];
      for (let i = 0; i < 50; i++) {
        try {
          const tx = await contracts.vault.transactions(i);
          txList.push({
            to:        tx[0],
            amount:    tx[1],
            token:     tx[2],
            approvals: tx[3],
            executed:  tx[4],
          });
        } catch { break; }
      }
      setTxs(txList);
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    loadInfo();
    const id = setInterval(loadInfo, 15000);
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

  const tokenAddr = submitToken === "ORN" ? ADDRESSES.ORN_PROXY : ADDRESSES.OUSD_PROXY;

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
        <h2 className="section-title">OrionTreasuryVault — Multi-Sig Vault</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="text-xs text-gray-500">ORN Balance</div>
            <div className="text-lg font-semibold text-white">
              {info ? `${Number(info.orn).toLocaleString(undefined, { maximumFractionDigits: 2 })} ORN` : "…"}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">OUSD Balance</div>
            <div className="text-lg font-semibold text-white">
              {info ? `${Number(info.ousd).toLocaleString(undefined, { maximumFractionDigits: 2 })} OUSD` : "…"}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">Required Approvals</div>
            <div className="text-lg font-semibold text-white">{info?.required ?? "…"}</div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-gray-500">Your Role</div>
            <div className="mt-1">
              {info ? (
                info.isSigner
                  ? <span className="badge-green">Signer</span>
                  : <span className="badge-yellow">Non-Signer</span>
              ) : "…"}
            </div>
          </div>
        </div>
        <div className="mt-3 stat-card">
          <div className="text-xs text-gray-500">Vault Admin</div>
          <div className="text-xs text-indigo-400 font-mono mt-0.5 break-all">{info?.admin ?? "…"}</div>
        </div>
      </div>

      <div className="divider" />

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-white">Submit Transaction</h3>
          <p className="text-xs text-gray-500">Propose a token transfer from the vault to the distribution contract. Auto-executes once approvals are met.</p>
          <div>
            <label className="label">Amount</label>
            <input type="number" min="0" step="any" placeholder="e.g. 1000" value={submitAmt} onChange={(e) => setSubmitAmt(e.target.value)} />
          </div>
          <div>
            <label className="label">Token</label>
            <select value={submitToken} onChange={(e) => setSubmitToken(e.target.value)}>
              <option value="ORN">ORN</option>
              <option value="OUSD">OUSD</option>
            </select>
          </div>
          <button
            onClick={() => {
              exec("Submit Transaction", () => contracts.vault.submitTransaction(ethers.parseEther(submitAmt), tokenAddr));
              setSubmitAmt("");
            }}
            disabled={busy || !submitAmt}
            className="btn-primary w-full"
          >
            Submit
          </button>
        </div>

        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-white">Pause / Unpause via Multi-Sig</h3>
          <p className="text-xs text-gray-500">
            Step 1: Request. Step 2: Each signer approves. Once approvals reach threshold, pause/unpause executes.
          </p>
          {info?.pauseReq && (
            <div className="text-xs text-gray-400">
              Pending: <strong className="text-white">{info.pauseReq.pause ? "Pause" : "Unpause"}</strong> — Approvals: {String(info.pauseReq.approvals ?? 0)} — {info.pauseReq.executed ? <span className="text-emerald-400">Executed</span> : <span className="text-yellow-400">Pending</span>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exec("Request Pause", () => contracts.vault.requestPauseUnpause(true))} disabled={busy} className="btn-danger text-xs py-1 px-3">
              Request Pause
            </button>
            <button onClick={() => exec("Request Unpause", () => contracts.vault.requestPauseUnpause(false))} disabled={busy} className="btn-success text-xs py-1 px-3">
              Request Unpause
            </button>
            <button onClick={() => exec("Approve Pause/Unpause", () => contracts.vault.approvePauseUnpause())} disabled={busy} className="btn-primary text-xs py-1 px-3">
              Approve
            </button>
            <button onClick={() => exec("Revoke Approval", () => contracts.vault.revokeApproval())} disabled={busy} className="btn-outline text-xs py-1 px-3">
              Revoke
            </button>
          </div>
        </div>
      </div>

      {txs.length > 0 && (
        <>
          <div className="divider" />
          <div>
            <h2 className="section-title">Pending / Past Transactions</h2>
            <div className="space-y-2">
              {txs.map((tx, i) => (
                <TxRow
                  key={i}
                  tx={tx}
                  idx={i}
                  account={account}
                  busy={busy}
                  onApprove={(idx) => exec(`Approve Tx #${idx}`, () => contracts.vault.approveTransaction(idx))}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="divider" />

      <div>
        <h2 className="section-title">Admin — Manage Signers</h2>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-white">Add Signer</h3>
            <div>
              <label className="label">Address</label>
              <input type="text" placeholder="0x…" value={newSigner} onChange={(e) => setNewSigner(e.target.value)} />
            </div>
            <button
              onClick={() => { exec("Add Signer", () => contracts.vault.addSigner(newSigner)); setNewSigner(""); }}
              disabled={busy || !newSigner}
              className="btn-primary w-full"
            >
              Add Signer
            </button>
          </div>
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-white">Remove Signer</h3>
            <div>
              <label className="label">Address</label>
              <input type="text" placeholder="0x…" value={rmSigner} onChange={(e) => setRmSigner(e.target.value)} />
            </div>
            <button
              onClick={() => { exec("Remove Signer", () => contracts.vault.removeSigner(rmSigner)); setRmSigner(""); }}
              disabled={busy || !rmSigner}
              className="btn-danger w-full"
            >
              Remove Signer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
