import { useState } from "react";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import StablecoinPanel from "./components/StablecoinPanel";
import TokenPanel from "./components/TokenPanel";
import DistributionPanel from "./components/DistributionPanel";
import VaultPanel from "./components/VaultPanel";

const TABS = [
  { id: "dashboard",     label: "Dashboard" },
  { id: "stablecoin",    label: "OUSD" },
  { id: "token",         label: "ORN Token" },
  { id: "distribution",  label: "Distribution" },
  { id: "vault",         label: "Treasury Vault" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <nav className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === t.id
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {activeTab === "dashboard"    && <Dashboard />}
        {activeTab === "stablecoin"   && <StablecoinPanel />}
        {activeTab === "token"        && <TokenPanel />}
        {activeTab === "distribution" && <DistributionPanel />}
        {activeTab === "vault"        && <VaultPanel />}
      </main>
      <footer className="border-t border-gray-800 py-4 text-center text-xs text-gray-600">
        Orion Protocol — Polygon Amoy Testnet
      </footer>
    </div>
  );
}
