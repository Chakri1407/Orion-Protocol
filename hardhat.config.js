require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-gas-reporter");
require("solidity-coverage");

const MAINNET_RPC_URL      = process.env.MAINNET_RPC_URL      || "";
const AMOY_RPC_URL         = process.env.AMOY_RPC_URL         || "https://rpc-amoy.polygon.technology/";
const DEPLOYER_PRIVKEY     = process.env.DEPLOYER_PRIVKEY     || "";
const POLYGONSCAN_API_KEY  = process.env.POLYGONSCAN_API_KEY  || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      ...(MAINNET_RPC_URL
        ? { forking: { url: MAINNET_RPC_URL, blockNumber: 21_900_000 } }
        : {}),
    },
    localhost: { url: "http://127.0.0.1:8545" },
    amoy: {
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts: DEPLOYER_PRIVKEY ? [DEPLOYER_PRIVKEY] : [],
    },
    polygonAmoy: {
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts: DEPLOYER_PRIVKEY ? [DEPLOYER_PRIVKEY] : [],
    },
  },
  etherscan: {
    // Single key string = Etherscan V2 format (works for all chains including Polygon)
    apiKey: POLYGONSCAN_API_KEY,
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          // V2 endpoint — chainid embedded in URL so hardhat-verify appends params correctly
          apiURL: "https://api.etherscan.io/v2/api?chainid=80002",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
  gasReporter: { enabled: false },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
