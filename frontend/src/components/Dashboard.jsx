import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { ADDRESSES } from "../config/contracts";

function StatCard({ label, value, sub, badge }) {
  return (
    <div className="stat-card">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-white">{value ?? "—"}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      {badge && <div className="mt-1">{badge}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { contracts, account } = useWeb3();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contracts) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [
          ousdSupply, ousdReserves, ousdRatio, pegStatus,
          ornSupply,
          usdcBal, ousdBal, ornBal,
          ousdPaused, ornPaused,
        ] = await Promise.all([
          contracts.ousd.totalSupply(),
          contracts.ousd.collateralReserves(),
          contracts.ousd.collateralRatio(),
          contracts.ousd.getPegStatus(),
          contracts.orn.totalSupply(),
          account ? contracts.mockUSDC.balanceOf(account) : Promise.resolve(0n),
          account ? contracts.ousd.balanceOf(account) : Promise.resolve(0n),
          account ? contracts.orn.balanceOf(account) : Promise.resolve(0n),
          contracts.ousd.paused(),
          contracts.orn.paused(),
        ]);

        if (!cancelled) {
          setData({
            ousdSupply:   ethers.formatEther(ousdSupply),
            ousdReserves: ethers.formatUnits(ousdReserves, 6),
            ousdRatio:    Number(ousdRatio) / 100,
            pegPrice:     (Number(pegStatus.price) / 1e8).toFixed(6),
            pegHealthy:   pegStatus.healthy,
            ornSupply:    ethers.formatEther(ornSupply),
            usdcBal:      ethers.formatUnits(usdcBal, 6),
            ousdBal:      ethers.formatEther(ousdBal),
            ornBal:       ethers.formatEther(ornBal),
            ousdPaused,
            ornPaused,
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [contracts, account]);

  if (!contracts) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="text-4xl">🔭</div>
        <p className="text-gray-400">Connect your wallet to view the Orion Protocol dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title">Protocol Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="OUSD Total Supply"
            value={data ? `${Number(data.ousdSupply).toLocaleString(undefined, { maximumFractionDigits: 2 })} OUSD` : "…"}
          />
          <StatCard
            label="USDC Reserves"
            value={data ? `${Number(data.ousdReserves).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC` : "…"}
          />
          <StatCard
            label="Collateral Ratio"
            value={data ? `${data.ousdRatio.toFixed(2)}%` : "…"}
            badge={data && (
              data.ousdRatio >= 100
                ? <span className="badge-green">Fully Backed</span>
                : <span className="badge-red">Under-Collateralised</span>
            )}
          />
          <StatCard
            label="Peg Status"
            value={data ? `$${data.pegPrice}` : "…"}
            sub="USDC / USD (Chainlink)"
            badge={data && (
              data.pegHealthy
                ? <span className="badge-green">On Peg</span>
                : <span className="badge-red">Peg Broken</span>
            )}
          />
        </div>
      </div>

      <div>
        <h2 className="section-title">Token Supply</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="ORN Total Supply"
            value={data ? `${Number(data.ornSupply).toLocaleString()} ORN` : "…"}
            badge={data && (
              data.ornPaused
                ? <span className="badge-red">Paused</span>
                : <span className="badge-green">Active</span>
            )}
          />
          <StatCard
            label="OUSD Contract"
            value={data ? (data.ousdPaused ? "Paused" : "Active") : "…"}
            badge={data && (
              data.ousdPaused
                ? <span className="badge-red">Paused</span>
                : <span className="badge-green">Active</span>
            )}
          />
        </div>
      </div>

      {account && (
        <div>
          <h2 className="section-title">Your Balances</h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="MockUSDC Balance"
              value={data ? `${Number(data.usdcBal).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC` : "…"}
            />
            <StatCard
              label="OUSD Balance"
              value={data ? `${Number(data.ousdBal).toLocaleString(undefined, { maximumFractionDigits: 4 })} OUSD` : "…"}
            />
            <StatCard
              label="ORN Balance"
              value={data ? `${Number(data.ornBal).toLocaleString(undefined, { maximumFractionDigits: 4 })} ORN` : "…"}
            />
          </div>
        </div>
      )}

      <div>
        <h2 className="section-title">Contract Addresses</h2>
        <div className="card space-y-2 font-mono text-xs text-gray-400">
          {Object.entries(ADDRESSES).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 flex-wrap">
              <span className="text-gray-500">{k}</span>
              <a
                href={`https://amoy.polygonscan.com/address/${v}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 break-all"
              >
                {v}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
