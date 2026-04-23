# Orion Protocol

A collateral-backed stablecoin system deployed on **Polygon Amoy** testnet.

---

## Contracts on Polygon Amoy

| Contract               | Proxy Address                                |
|------------------------|----------------------------------------------|
| MockUSDC               | `0x68eF377ea77e53b446b324fA24779aC8021aD6a6` |
| OrionToken (ORN)       | `0x228eEe9c44d6c48A957765F2AC697733d9c3535E` |
| OrionStablecoin (OUSD) | `0xe631Dde195283dFF9DE0D4934361f446aD8589E5` |
| OrionDistribution      | `0x5Fb00223d9Fa402760261eFb7f2F273D55B128DD` |
| OrionTreasuryVault     | `0x57Df20982CF40d63453349a69710c3Bf6b90b820` |

Chainlink USDC/USD feed (Amoy): `0x1b8739bB4CdF0089d07097A9Ae5Bd274b29C6F16`

PolygonScan Explorer: https://amoy.polygonscan.com

---

## Architecture

```
OrionTreasuryVault (multi-sig)
        │ submitTransaction / approveTransaction
        ▼
OrionDistribution (token vault)
    ├─ holds ORN (OrionToken)
    └─ holds OUSD (OrionStablecoin)

OrionStablecoin (OUSD)
    ├─ collateral: MockUSDC (6 dec)
    ├─ price feed: Chainlink USDC/USD (8 dec)
    ├─ mintWithCollateral(usdcAmt)  → mints OUSD 1:1
    └─ redeem(ousdAmt)             → returns USDC from reserves

OrionToken (ORN)
    └─ governance / utility token, ERC20 + pausable + UUPS
```

All four contracts use **UUPS upgradeable proxies** (OpenZeppelin v5).

---

## Key Concepts

### USD Peg
OUSD is pegged to **$1.00** via full USDC collateral backing.
- Chainlink returns prices with **8 decimals** → `99991650 / 1e8 = $0.9999`
- Peg tolerance: ±0.5% → valid range **$0.9950 – $1.0050**
- `mintWithCollateral()` reverts if peg is broken

### Collateral Ratio
`(reservesIn18 * 10000) / totalSupply` expressed in **basis points**  
100% = 10000 bps = fully backed

---

## Project Structure

```
StableCoin/
├── contracts/
│   ├── OrionStablecoin.sol      # OUSD – collateral-backed stablecoin
│   ├── OrionToken.sol           # ORN – governance token
│   ├── OrionDistribution.sol    # Distribution vault
│   ├── OrionTreasuryVault.sol   # Multi-sig treasury
│   └── mocks/
│       ├── MockUSDC.sol         # Freely mintable test USDC (6 dec)
│       └── MockAggregatorV3.sol # Configurable Chainlink feed for tests
├── scripts/
│   ├── deployAll.js             # Deploy all 5 contracts
│   ├── verify.js                # Verify on PolygonScan
│   ├── checkPriceFeed.js        # Read live Chainlink price
│   ├── testAll.js               # 37-step end-to-end test
│   └── interactAmoy.js          # Manual interaction helpers
├── frontend/                    # React + Vite + Tailwind UI
│   └── src/
│       ├── config/contracts.js  # Addresses + ABIs
│       ├── context/Web3Context.jsx
│       ├── App.jsx
│       └── components/
│           ├── Header.jsx
│           ├── Dashboard.jsx
│           ├── StablecoinPanel.jsx
│           ├── TokenPanel.jsx
│           ├── DistributionPanel.jsx
│           └── VaultPanel.jsx
├── hardhat.config.js
└── .env                         # DEPLOYER_PRIVKEY, POLYGONSCAN_API_KEY
```

---

## Setup

### Prerequisites
- Node.js ≥ 18
- MetaMask with Polygon Amoy network

### Smart Contract Development

```bash
npm install
npx hardhat compile
npx hardhat test                                      # run local tests
npx hardhat run scripts/deployAll.js --network amoy   # deploy
npx hardhat run scripts/verify.js --network polygonAmoy
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
```

---

## Testing on Polygon Amoy

### 1. Get Test MATIC
Visit the [Polygon Amoy Faucet](https://faucet.polygon.technology/) and request MATIC for your wallet.

### 2. Get MockUSDC
Call `mint(yourAddress, 1000000000)` on MockUSDC via PolygonScan or the frontend.  
This gives you **1,000 USDC** (6 decimals).

### 3. Mint OUSD
1. Open **OUSD** tab in the frontend
2. Enter an amount (e.g. `100`) and click **Approve & Mint OUSD**
3. MetaMask will first approve USDC spending, then call `mintWithCollateral()`
4. You receive 100 OUSD backed by 100 USDC

### 4. Redeem OUSD
1. In the **OUSD** tab, enter an amount to redeem
2. Click **Redeem OUSD** — OUSD is burned and USDC is returned

### 5. ORN Token
- Admin (deployer) can mint ORN to treasury via the **ORN Token** tab
- ORN can be transferred to any address

### 6. Distribution Vault
- Transfer ORN or OUSD from the distribution contract to any address
- Withdraw tokens to your own address (admin)
- Burn tokens from the vault

### 7. Treasury Vault (Multi-Sig)
- **Submit Transaction**: Propose a token transfer from the vault to the distribution contract
- **Approve**: Each signer approves the transaction; auto-executes at threshold
- **Pause/Unpause via Multi-Sig**: Request then approve; executes when approvals ≥ threshold

---

## Environment Variables

```
DEPLOYER_PRIVKEY=<your_private_key>
POLYGONSCAN_API_KEY=<polygonscan_api_key>
```

---

## Roles

| Role              | Contract        | Capability                           |
|-------------------|-----------------|--------------------------------------|
| `DEFAULT_ADMIN_ROLE` | All          | Grant/revoke roles, update addresses |
| `MINTER_ROLE`     | ORN + OUSD      | Mint tokens to treasury              |
| `PAUSER_ROLE`     | ORN + OUSD      | Pause/unpause transfers              |
| `UPGRADER_ROLE`   | All (UUPS)      | Upgrade contract logic               |
| Signer            | TreasuryVault   | Approve multi-sig transactions       |
| VaultAdmin        | TreasuryVault   | Manage signers, set contracts        |

---

## Tech Stack

- **Solidity 0.8.28** / EVM Cancun
- **OpenZeppelin v5** — UUPS upgradeable, AccessControl, ERC20Permit, Pausable
- **Chainlink** AggregatorV3Interface — 8-decimal price feeds
- **Hardhat 2** — compile, test, deploy, verify
- **React 18** + **Vite** + **ethers v6** + **Tailwind CSS v3**
