import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { ADDRESSES, ABIS, CHAIN_ID } from "../config/contracts";

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [provider, setProvider]   = useState(null);
  const [signer, setSigner]       = useState(null);
  const [account, setAccount]     = useState(null);
  const [chainId, setChainId]     = useState(null);
  const [contracts, setContracts] = useState(null);
  const [error, setError]         = useState(null);

  const buildContracts = useCallback((signerOrProvider) => ({
    mockUSDC: new ethers.Contract(ADDRESSES.MOCK_USDC,  ABIS.MOCK_USDC,  signerOrProvider),
    ousd:     new ethers.Contract(ADDRESSES.OUSD_PROXY, ABIS.OUSD,       signerOrProvider),
    orn:      new ethers.Contract(ADDRESSES.ORN_PROXY,  ABIS.ORN,        signerOrProvider),
    dist:     new ethers.Contract(ADDRESSES.DIST_PROXY, ABIS.DIST,       signerOrProvider),
    vault:    new ethers.Contract(ADDRESSES.VAULT_PROXY,ABIS.VAULT,      signerOrProvider),
  }), []);

  const connect = useCallback(async () => {
    setError(null);
    try {
      if (!window.ethereum) throw new Error("MetaMask not found. Please install it.");
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      await web3Provider.send("eth_requestAccounts", []);
      const web3Signer  = await web3Provider.getSigner();
      const network     = await web3Provider.getNetwork();
      const addr        = await web3Signer.getAddress();

      if (Number(network.chainId) !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x13882" }],
          });
        } catch (switchErr) {
          if (switchErr.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: "0x13882",
                chainName: "Polygon Amoy Testnet",
                nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
                rpcUrls: ["https://rpc-amoy.polygon.technology/"],
                blockExplorerUrls: ["https://amoy.polygonscan.com/"],
              }],
            });
          } else {
            throw switchErr;
          }
        }
      }

      setProvider(web3Provider);
      setSigner(web3Signer);
      setAccount(addr);
      setChainId(Number(network.chainId));
      setContracts(buildContracts(web3Signer));
    } catch (e) {
      setError(e.message ?? String(e));
    }
  }, [buildContracts]);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setContracts(null);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) disconnect();
      else connect();
    };
    const onChainChanged = () => connect();
    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [connect, disconnect]);

  return (
    <Web3Context.Provider value={{ provider, signer, account, chainId, contracts, error, connect, disconnect }}>
      {children}
    </Web3Context.Provider>
  );
}

export const useWeb3 = () => useContext(Web3Context);
