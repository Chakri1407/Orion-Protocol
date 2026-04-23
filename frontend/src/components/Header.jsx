import { useWeb3 } from "../context/Web3Context";
import { CHAIN_ID } from "../config/contracts";

function shortAddr(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export default function Header() {
  const { account, chainId, connect, disconnect, error } = useWeb3();
  const wrongChain = account && chainId !== CHAIN_ID;

  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white tracking-tight">Orion Protocol</span>
          <span className="text-xs text-gray-500">Polygon Amoy</span>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-red-400 max-w-xs truncate" title={error}>
              {error}
            </span>
          )}
          {wrongChain && (
            <span className="badge-red">Wrong Network</span>
          )}
          {account ? (
            <div className="flex items-center gap-2">
              <span className="badge-green">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {shortAddr(account)}
              </span>
              <button onClick={disconnect} className="btn-outline py-1 px-3 text-xs">
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={connect} className="btn-primary">
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
