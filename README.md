# YieldAgent

**An autonomous AI liquidity strategist on X Layer — every trade signed through OnchainOS, every decision anchored on-chain.**

YieldAgent is a three-brain AI agent that plans, deploys, monitors, rebalances, and compounds concentrated-liquidity positions on X Layer. Planning is built on the **Uniswap AI Skills** library (`liquidity-planner`, `swap-planner`). Execution flows through the **OnchainOS Agentic Wallet** and the `defi` module — every single DEX tx is signed and rate-tracked through OnchainOS, which is exactly how the *Most Active On-Chain Agent* prize is judged. Every decision the agent makes — *including the decision to do nothing* — is recorded on-chain through the `DecisionLogger` contract, so users (and judges) can audit the AI's reasoning forever.

Built for **OKX Build X AI Hackathon — Season 2**, X Layer Arena track.

---

## TL;DR

| | |
|---|---|
| **Chain** | X Layer mainnet (`196`) / testnet (`1952`) |
| **Core audit contracts** | `StrategyManager` v2 + `DecisionLogger` + `FollowVaultFactory` |
| **AI engine** | Three-brain decision system (Market · Pool · Risk) |
| **Planning skills** | Uniswap AI Skills — [`liquidity-planner@0.2.0`](https://github.com/Uniswap/uniswap-ai/tree/main/liquidity-planner) (pair classification + range widths + fee tier map, ported verbatim in `UniswapSkillsAdapter`) + [`swap-planner@0.1.0`](https://github.com/Uniswap/uniswap-ai/tree/main/swap-planner) (slippage ladder + price impact + minOut + optional split-swap, invoked on every rebalance via `planRebalanceSwap()`) |
| **DEX execution** | OnchainOS Agentic Wallet + `onchainos swap execute` (TEE-signed) |
| **Audit trail** | Every DEPLOY / REBALANCE / COMPOUND / HOLD logged on-chain with reasoning + confidence |
| **Copy-trading** | `FollowVault` per-strategy ERC20 vault, agent earns 10 % perf fee |
| **Test coverage** | 68 passing [hardhat unit tests](test/) across `DecisionLogger`, `StrategyManager`, `FollowVault` — every write path of the audit layer + FollowVault share math is mechanically enforced. Run `npm test`. |
| **Mainnet proof** | 6 verified `onchainos swap execute` txs on chain 196, signed by the Agentic Wallet TEE (`0x6ab27b82…`). Full table in [`SUBMISSION.md`](SUBMISSION.md) § "Mainnet on-chain activity". |

---

## Team

- **Solo developer — X Layer Builder.** End-to-end design, Solidity contracts, TypeScript agent backend, Next.js frontend, OnchainOS CLI integration, Uniswap AI Skills porting, mainnet deployment and on-chain activity.
- Built independently for OKX Build X Hackathon Season 2, X Layer Arena track.

---

## Deployments

All three audit / registry contracts are **deployed and live on both X Layer mainnet (chain 196) and X Layer testnet (chain 1952)**. Because the audit signer's nonce sequence matches on both chains (same deployer key, same `CREATE` order, nonces 0/1/2), the testnet and mainnet contract addresses are bit-identical — a nice side effect of a fully deterministic deploy.

### X Layer Mainnet (chain 196)

| Contract | Address | Deploy nonce | Explorer |
|---|---|---|---|
| `DecisionLogger` | `0x5989f764bC20072e6554860547CfEC474877892C` | 0 | [OKLink](https://www.oklink.com/xlayer/address/0x5989f764bC20072e6554860547CfEC474877892C) |
| `StrategyManager` v2 | `0x2180fA2e3F89E314941b23B7acC0e60513766712` | 1 | [OKLink](https://www.oklink.com/xlayer/address/0x2180fA2e3F89E314941b23B7acC0e60513766712) |
| `FollowVaultFactory` | `0x9203C9d95115652b5799ab9e9A640DDEB0879F85` | 2 | [OKLink](https://www.oklink.com/xlayer/address/0x9203C9d95115652b5799ab9e9A640DDEB0879F85) |

Full mainnet deployment artifact: `deployments/196.json`.

### X Layer Testnet (chain 1952)

| Contract | Address | Explorer |
|---|---|---|
| `DecisionLogger` | `0x5989f764bC20072e6554860547CfEC474877892C` | [OKLink Testnet](https://www.oklink.com/xlayer-test/address/0x5989f764bC20072e6554860547CfEC474877892C) |
| `StrategyManager` v2 | `0x2180fA2e3F89E314941b23B7acC0e60513766712` | [OKLink Testnet](https://www.oklink.com/xlayer-test/address/0x2180fA2e3F89E314941b23B7acC0e60513766712) |
| `FollowVaultFactory` | `0x9203C9d95115652b5799ab9e9A640DDEB0879F85` | [OKLink Testnet](https://www.oklink.com/xlayer-test/address/0x9203C9d95115652b5799ab9e9A640DDEB0879F85) |

### Live strategy on mainnet

| | |
|---|---|
| **Strategy ID** | `0` |
| **Pool** | USDT / OKB 0.3 % — `0x63d62734847E55A266FCa4219A9aD0a02D5F6e02` |
| **Risk profile** | MODERATE |
| **Initial deploy tx** | [`0xfd5e948d…f3b57ec`](https://www.oklink.com/xlayer/tx/0xfd5e948d77e4b76eb00cdf5c33d13ae404f3d423d57e06c288da152b4f3b57ec) |
| **OnchainOS swap anchor** | [`0xf7df266e…2de`](https://www.oklink.com/xlayer/tx/0xf7df266e9586cbfc62a122e5fad69ca111bb267083762ca14e28abc1f6d612de) wrapping swap [`0x63a2d242…861`](https://www.oklink.com/xlayer/tx/0x63a2d242da000a2544d9f6f18628a046826efc7b9f5e932928cf15125666a861) |

Full Proof-of-Work tx table — including all six verified OnchainOS-signed swaps — is in `SUBMISSION.md` § "Mainnet on-chain activity".

---

## Agents & Roles

YieldAgent is architected as **two cooperating on-chain identities**, physically separated by construction so that no single key can both reason *and* sign DEX transactions. Any one-agent "AI trader" where the same key does planning and execution cannot give this guarantee.

| Agent | On-chain address | What it signs | What it CAN'T do | Role |
|---|---|---|---|---|
| **OnchainOS Agentic Wallet** (TEE signer) | `0x6ab27b82890bc85cd996f518173487ece9811d61` ([OKLink](https://www.oklink.com/xlayer/address/0x6ab27b82890bc85cd996f518173487ece9811d61)) | Every DEX tx on X Layer — `onchainos swap execute`, token approvals, all rebalance / deploy / emergency-exit swaps | Cannot write to `StrategyManager` / `DecisionLogger` — it has no agent authorization on those contracts | **Execution identity.** Assigned by OnchainOS on first `wallet login`, account id `04c9d299-9e85-4c20-98c5-8f1f2a4bba36`. ERC-4337 smart account, EntryPoint v0.7 `0x000000007172…`. This is the wallet the Most Active On-Chain Agent prize judges should point their activity tracking at. |
| **Audit / Registry signer** | `0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838` ([OKLink](https://www.oklink.com/xlayer/address/0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838)) | `StrategyManager.deployStrategy`, `recordExecution`, `logHold`, `DecisionLogger.logDecision` — anchors AI reasoning + OnchainOS tx hashes on-chain | Cannot call OnchainOS CLI, cannot sign any DEX tx — `ExecutionEngine.ts` contains zero DEX-calling code. Physically prevented from faking OnchainOS activity: it can only anchor a tx hash that already exists in OnchainOS's own signed history, because `recordExecution` is only called after an OnchainOS broadcast returns a real hash. | **Audit identity.** Plain EVM EOA held by the agent process. Registered as an authorized agent on `StrategyManager.setAgent(0x2E2FC9d6…, true)` and `DecisionLogger.setAuthorized(StrategyManager, true)`. |

**Why this matters for the judging rubric.** The two-agent split is the *construct-level* anti-gaming guarantee for the Most Active On-Chain Agent prize: a judge can cross-reference `StrategyManager.getExecutions(strategyId)[i].txHash` against the OnchainOS Agentic Wallet's own on-chain activity — the hashes must match 1:1, because the audit signer has no way to fabricate one. See `agent/src/adapters/OnchainOSAdapter.ts` (the only file in the repo that spawns `onchainos`) and `agent/src/engines/ExecutionEngine.ts` (the only file that writes to `StrategyManager`) — neither imports the other's signing capability.

---

## X Layer Ecosystem Positioning

**YieldAgent is the reference implementation of an on-chain AI liquidity strategist for X Layer**, and is purpose-built around three X Layer-native capabilities:

1. **Gas-free high-frequency monitoring loop.** Concentrated-liquidity management is gas-intensive by design — `slot0` reads, IL math, tick re-anchoring, rebalance swaps, compound harvests, HOLD heartbeats. On Ethereum L1 a 5-minute monitoring tick × multiple positions would cost hundreds of dollars per agent per month. On X Layer, the same loop is *economically free*, so YieldAgent can run `evaluationIntervalMs = 5 min` / `fullEvalIntervalMs = 30 min` / `compoundIntervalMs = 6 h` without the cadence being a cost problem. The monitor loop cadence is the product — and it is viable *only* on X Layer.

2. **Deep integration with OKX's OnchainOS on X Layer.** OnchainOS's Agentic Wallet is the **only** DEX-signing path in the entire codebase. The agent does not hold a hot key that can bypass OnchainOS; `ExecutionEngine` is constructed without DEX capabilities. Every `swap execute` goes through OnchainOS's TEE, is quoted via the OKX DEX aggregator, and is bundled through EntryPoint v0.7 ERC-4337 on X Layer. This is also the anti-gaming rule for the Most Active On-Chain Agent prize — but here it is enforced *structurally*, not by policy.

3. **On-chain AI audit trail anchored on X Layer.** Every decision the agent makes — DEPLOY / REBALANCE / COMPOUND / HOLD / EMERGENCY_EXIT — is recorded on X Layer with its reasoning chain and confidence score via `DecisionLogger.logDecision(...)`, and every off-chain OnchainOS execution is anchored back to X Layer via `StrategyManager.recordExecution(...)`. Judges and copy-trading followers can reconstruct the agent's thinking at every X Layer block height by scanning a single contract address. This is the first AI agent on X Layer where the HOLD decisions — "the agent looked at the market and chose *not* to trade" — are also provable on-chain, not just the trades.

**Role in the X Layer ecosystem.** YieldAgent is designed to be the foundation layer for an **AI-alpha leaderboard on X Layer**: `FollowVaultFactory` can spawn an unlimited number of per-strategy copy-trading vaults, each one ERC20-based, each one pegged to one `StrategyManager` strategy, each one paying 10 % performance fee to the agent on profit. Successful agents become economically self-sustaining, losing agents naturally bleed followers, and the `DecisionLogger` history is the verifiable track record. The same `StrategyManager` + `DecisionLogger` contracts can host any AI-managed concentrated-LP strategy — YieldAgent is simply the first one deployed.

**Why X Layer specifically, not another L2.** Two hard reasons:
- OnchainOS + Agentic Wallet + TEE signing is natively supported on X Layer (chain 196) via OKX's own infrastructure. Porting this to another L2 would require a different execution layer entirely — the whole anti-gaming story assumes OnchainOS.
- X Layer's gas model makes the decision-logging overhead (one on-chain write per AI decision, including HOLD) free. On an L2 with meaningful calldata cost, you would have to batch or drop HOLD logs — which breaks the audit-trail invariant.

---

## Why YieldAgent

Most "AI + DeFi" projects are a chatbot wrapper around a Swap UI. YieldAgent is different:

1. **Honest-by-construction.** Every HOLD is recorded with its confidence and its reasoning. Every rebalance cites the market + pool + risk analysis that justified it. `DecisionLogger.logDecision(...)` is called *for every action*. A copy-trading follower isn't just trusting an API — they can scan `DecisionLogger.getDecisionHistory(strategyId)` and see the entire thought process. The 68-test hardhat suite (`test/DecisionLogger.test.ts` + `test/StrategyManager.test.ts` + `test/FollowVault.test.ts`) mechanically enforces this: every write path of the audit layer — DEPLOY / REBALANCE / COMPOUND / EMERGENCY_EXIT / HOLD — ships green or `npm test` fails.
2. **100% of DEX execution flows through OnchainOS.** No shortcuts, no direct RPC signing. Every `onchainos swap execute` is signed inside OnchainOS's TEE and rate-tracked by the OnchainOS API — which is exactly the anti-gaming rule for the Most Active On-Chain Agent prize. ([see "Why swap execute, not defi invest"](#why-swap-execute-not-defi-invest).)
3. **Planning is built on Uniswap AI Skills.** Range math, fee-tier selection, and rebalance swap plans all come from `liquidity-planner` and `swap-planner` (Uniswap's official AI skill library). Instead of reinventing tick math, YieldAgent cites the skill version and applies its methodology.
4. **It has to live on X Layer.** Concentrated-LP management is gas-intensive: rebalancing, compounding, multi-position deployment. X Layer's gas-free txs are what make a 5-minute monitoring loop economically viable.
5. **Performance is composable.** Successful agents earn followers via `FollowVault`. The same StrategyManager + DecisionLogger powers a permissionless leaderboard of AI alpha.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                      │
│  Intent Input · Three-Brain Panel · LP Chart · Decision Log    │
└─────────────────────┬──────────────────────┬───────────────────┘
                      │ HTTP + WS            │ wagmi/RainbowKit
                      ▼                      ▼
┌────────────────────────────────────┐  ┌───────────────────────┐
│      Agent Backend (Node + TS)     │  │     X Layer (L2)      │
│ ┌──────────────────────────────┐   │  │ ┌───────────────────┐ │
│ │ IntentParser  (GPT-4o-mini)  │   │  │ │ StrategyManager v2│ │
│ │ MarketBrain   (OKX price)    │   │  │ │ DecisionLogger    │ │
│ │ PoolBrain  ← UniswapSkills  │   │  │ │ FollowVaultFactory│ │
│ │   Adapter (liquidity-planner)│───┼─►│ └───────────────────┘ │
│ │ RiskBrain     (IL math)      │   │  │          ▲            │
│ │ OnchainOSAdapter (CLI spawn)  │───┼──┼─► onchainos swap    ─┘│
│ │ ExecutionEngine (audit only) │   │  │   execute             │
│ │ AgentCoordinator (5 m loop)  │   │  │   (signed in the TEE  │
│ └──────────────────────────────┘   │  │    Agentic Wallet)    │
└────────────────────────────────────┘  └───────────────────────┘
```

**Key invariant**: `ExecutionEngine` never signs a transaction itself. It asks `OnchainOSAdapter` to route the action through `onchainos swap execute`, gets the OnchainOS tx hash back, and then records it into `StrategyManager.recordExecution(...)` + `DecisionLogger.logDecision(...)` for the audit trail. This is the anti-gaming guarantee for the *Most Active On-Chain Agent* prize — no path bypasses OnchainOS. See [Why `swap execute`, not `defi invest`](#why-swap-execute-not-defi-invest) for why the swap path was chosen over the `defi invest` calldata path on X Layer mainnet.

### The three brains

| Brain | Inputs | Output | What it actually computes |
|---|---|---|---|
| **Market Brain** | On-chain TWAP via `pool.observe()`, price history buffer (2016 snapshots ≈ 7 days) | volatility, market state (`trending_up/down/ranging/high_vol`), 1 h price change | Realised volatility (ATR-style), trend classification, whale-swap detection |
| **Pool Brain** | `slot0`, `liquidity`, tick samples around current tick, oracle observation | recommended LP ranges (wide / narrow / ultra-narrow), allocation %, est. APR, est. IL | Liquidity-weighted center of mass, tick-spacing snapping, fee APR derived from volume × fee tier |
| **Risk Brain** | Current tick vs entry tick vs range | IL %, position health 0-100, in-range bool, rebalance urgency, suggested action | Standard concentrated-liquidity IL formula `1 - V_LP/V_HOLD`, edge proximity vs profile threshold |

`AgentCoordinator` runs all three in parallel, then asks GPT-4o-mini to compose a ≤200-char reasoning string that gets pushed to `DecisionLogger.logDecision(...)` along with confidence and tick deltas.

---

## Repo layout

```
yield-agent/
├── contracts/
│   ├── interfaces/IYieldProtocol.sol     # Shared types and events
│   ├── libraries/TickMath.sol             # Tick rounding helpers
│   ├── test/MockERC20.sol                 # Test-only mock ERC20 for hardhat
│   ├── DecisionLogger.sol                 # On-chain AI decision history
│   ├── StrategyManager.sol                # Core LP management contract
│   └── FollowVault.sol                    # ERC20 copy-trading vaults
├── scripts/
│   └── deploy.ts                          # Hardhat deployment to X Layer
├── test/
│   ├── DecisionLogger.test.ts             # 23 hardhat tests — access
│   │                                      #   control, validation reverts,
│   │                                      #   agent stats, history views
│   ├── StrategyManager.test.ts            # 25 hardhat tests — deploy/
│   │                                      #   rebalance/hold/compound/exit
│   │                                      #   glue with DecisionLogger
│   └── FollowVault.test.ts                # 20 hardhat tests — factory,
│                                          #   share-math, perf fee, views
├── agent/
│   ├── package.json
│   └── src/
│       ├── config/index.ts                # Chain + contract config
│       ├── adapters/
│       │   ├── OnchainOSAdapter.ts        # Wraps `onchainos swap execute`
│       │   │                              # (+ legacy defi invest/withdraw
│       │   │                              #  helpers for calldata inspection)
│       │   └── UniswapSkillsAdapter.ts    # Ports liquidity-planner + swap-
│       │                                  # planner methodology (DexScreener,
│       │                                  # tick spacing, range heuristics)
│       ├── engines/
│       │   ├── IntentParser.ts            # GPT-4o-mini natural language intent
│       │   ├── MarketBrain.ts             # Market analysis
│       │   ├── PoolBrain.ts               # Pool / range analysis (calls
│       │   │                              # UniswapSkillsAdapter)
│       │   ├── RiskBrain.ts               # Pure-math risk engine
│       │   └── ExecutionEngine.ts         # Audit-only: records the
│       │                                  # OnchainOS tx hash into
│       │                                  # StrategyManager + DecisionLogger
│       ├── services/
│       │   └── AgentCoordinator.ts        # The 5-min monitoring loop
│       └── index.ts                       # Express + WebSocket server
├── frontend/
│   ├── package.json
│   └── src/
│       ├── app/
│       │   ├── page.tsx                   # Main agent dashboard
│       │   ├── decisions/page.tsx         # Decision log explorer
│       │   ├── follow/page.tsx            # Agent leaderboard + vaults
│       │   └── providers.tsx              # wagmi + RainbowKit
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── StatusBar.tsx
│       │   ├── ThreeBrainPanel.tsx
│       │   ├── LPRangeChart.tsx
│       │   ├── IntentInput.tsx
│       │   ├── DeployControls.tsx           # Deploy / Start-Monitor /
│       │   │                                #   Stop-Monitor buttons with
│       │   │                                #   mainnet confirm dialog
│       │   ├── AgentChat.tsx
│       │   └── DecisionLog.tsx
│       └── lib/
│           ├── api.ts                     # Backend client + WS
│           ├── hooks.ts                   # useAgentState hook
│           └── utils.ts
├── hardhat.config.ts
├── package.json
└── README.md
```

---

## Quickstart

### 0. Prerequisites

- Node 20+
- An OKB-funded wallet on X Layer (~0.5 OKB for deployment + gas on the audit signer, plus a few USDT + a little OKB in the OnchainOS Agentic Wallet for swap principal + gas)
- An OpenAI API key (for the intent parser + reasoning composer)
- **OnchainOS CLI** installed (`curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`) — the agent shells out to `onchainos swap execute` for every DEX tx
- An OnchainOS API key pair (Access Key + Secret Key + Passphrase) from https://web3.okx.com/onchainos/dev-portal

### 1. Install

```bash
# Root (contracts + workspaces)
npm install

# Agent backend
cd agent && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
# Edit .env: PRIVATE_KEY, OPENAI_API_KEY, OKX_ACCESS_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE
```

### 2b. Log in to OnchainOS (one-time)

```bash
# AK login — reads OKX_ACCESS_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE from env
onchainos wallet login --force

# Verify
onchainos wallet status
onchainos wallet addresses
```

### 3. Deploy contracts to X Layer

```bash
npm run compile
npm run deploy:xlayer
```

Copy the printed addresses into `.env`:

```
STRATEGY_MANAGER_ADDRESS=0x...
DECISION_LOGGER_ADDRESS=0x...
FOLLOW_VAULT_FACTORY_ADDRESS=0x...
```

And into `frontend/.env.local` as `NEXT_PUBLIC_*`.

### 4. Run the agent backend

```bash
cd agent
npm start
# → http://localhost:3001
# → ws://localhost:3001/ws
```

### 4b. Smoke-test the deployment (recommended before frontend)

Once the backend is running, three read-only curls confirm the audit-layer
wiring is live on X Layer without touching OnchainOS or spending any OKB:

```bash
# 1. Health + chainId
curl -s http://localhost:3001/api/health | jq

# 2. Current agent state (executionMode, strategyId, evaluationCount)
curl -s http://localhost:3001/api/state | jq

# 3. Latest evaluation (null until monitor has run once)
curl -s http://localhost:3001/api/latest | jq
```

All three should return 200 JSON. `executionMode` will be one of `live` /
`simulated` / `audit-only` depending on whether your OnchainOS CLI is
logged in and whether `ONCHAINOS_SIMULATE=true` is set.

If you want to exercise the audit contracts without any OnchainOS
broadcast, run the anchor script in dry-run mode against the mainnet
contracts — it reads `getExecutions(0)` and prints what it *would* write:

```bash
ANCHOR_DRY_RUN=1 \
STRATEGY_MANAGER_ADDRESS=0x2180fA2e3F89E314941b23B7acC0e60513766712 \
npx hardhat run scripts/anchor-swap-evidence.ts --network xlayer
```

A non-dry run of the same script is what produced row 6 of the Proof of
Work table in `SUBMISSION.md`.

### 5. Run the frontend

```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### 6. (Optional but recommended) run the hardhat test suite

```bash
npm test
# → 68 passing in ~1 s
```

The suite lives under `test/` and covers every write path of the three audit
contracts:

- `test/DecisionLogger.test.ts` — 23 cases: access control, validation
  reverts, agent stats accounting, history + latest views.
- `test/StrategyManager.test.ts` — 25 cases: constructor wiring,
  `deployStrategy` validation, `rebalance` / `logHold` / `compoundFees` /
  `emergencyExit` integration with `DecisionLogger`, `recordExecution` glue.
- `test/FollowVault.test.ts` — 20 cases: factory access control, share-math
  dilution invariant, performance fee on profit, `previewFollow` +
  `previewUnfollow` views.

A green `npm test` is the forcing function for every claim in
`SUBMISSION.md` about on-chain audit behavior — if any of those tests
regress, the submission's core invariant is broken.

---

## How a strategy lifecycle works

1. **User intent (text):** "Stable yield on OKB/USDT with $5000, max 5 % IL." (USDT is the dominant stable on X Layer — `defi search` finds 4 V3 pools for USDT vs 0 for USDC.)
2. **`IntentParser`** turns it into structured `UserIntent` (principal, risk profile, target APR, max IL).
3. **User clicks Deploy.** `MarketBrain` + `PoolBrain` analyse the pool in parallel. `PoolBrain` asks `UniswapSkillsAdapter` for the range — the adapter pulls live pool data from DexScreener (same endpoint as `liquidity-planner`), snaps ticks to the fee-tier's spacing, and returns 3 range candidates using the official skill's recommendation heuristics (stable pair: ±0.5–1 %, major pair: ±10–20 %, volatile: ±30–50 %).
4. **`OnchainOSAdapter.swap(...)`** spawns `onchainos swap execute --chain-index 196 --from-token <stable> --to-token <volatile> --amount <principal> --slippage 0.01`. OnchainOS resolves the route through the OKX DEX aggregator, signs inside its TEE, and returns the broadcast tx hash — **every signing operation happens inside OnchainOS's TEE, so the tx is attributable to the Agentic Wallet and counts toward the Most Active On-Chain Agent leaderboard.**
5. **`ExecutionEngine.recordExecution(strategyId, txHash, externalId)`** writes the OnchainOS tx hash into `StrategyManager` on X Layer for the audit trail.
6. **`DecisionLogger.logDecision(DEPLOY, ..., confidence, reasoning)`** records the deploy with its full reasoning chain.
7. **Monitoring loop** (two-tier):
   - every 5 min (`evaluationIntervalMs`): quick edge-proximity check; if past threshold ⇒ run full eval immediately
   - every 30 min (`fullEvalIntervalMs`): full three-brain re-analysis
   - every 6 h (`compoundIntervalMs`): periodic harvest heartbeat — if a real harvest tx broadcasts, it's anchored as a `COMPOUND` audit row + `recordExecution`; if not (the default in swap mode, which holds no V3 position), the heartbeat writes a `HOLD` row via `logHold` so the audit trail stays honest about what actually happened.
8. **Each evaluation** ends with one of `HOLD / REBALANCE / COMPOUND / EMERGENCY_EXIT`. Every non-HOLD action that produces a real DEX tx goes through OnchainOS first, then gets recorded on-chain. HOLD decisions skip OnchainOS (no DEX tx) but are still written to `DecisionLogger.logHold(...)` so the audit trail is continuous.
9. **A successful agent** can have a follower vault created via `FollowVaultFactory.createVault(...)`. Followers deposit USDT; their share of vault assets mirrors the agent's positions. Agent collects 10 % of profit on withdrawal.

### Why `swap execute`, not `defi invest`

OnchainOS actually exposes two completely different DEX primitives, and the adapter chose the swap path deliberately after testing both on X Layer mainnet:

| | `onchainos defi invest` | `onchainos swap execute` |
|---|---|---|
| **Return shape** | `dataList[]` — raw calldata steps the caller must sign + broadcast via `wallet contract-call` | Fully-broadcast tx hash, signed inside the TEE |
| **TEE signer** | Still signs, but multiple sub-txs means multiple chances to diverge from `address` | Single TEE signature per primitive |
| **Status on X Layer mainnet (2026-04)** | Verified reverting against investmentId 42003 (USDT-OKB 0.3%) — OKX DEX's entrance contract expects a specific `msg.sender` that the TEE Agentic Wallet doesn't match | Clean swaps USDT ↔ OKB, attributable to the Agentic Wallet address |
| **Used by** | `OnchainOSAdapter.buildInvestDataList()` kept as a diagnostic helper that dumps the calldata without executing — lets judges verify the agent *can* talk to `defi` and chose not to | `AgentCoordinator.depositViaOnchainOS / rebalanceViaOnchainOS / exitViaOnchainOS` |

So "one swap in = position opened" and "one swap out = position closed" — the LP position itself lives in the Agentic Wallet, not in an LP NFT. That is a simplification relative to a full V3 range mint, but it keeps every single DEX tx attributable to the Agentic Wallet (which is what the *Most Active On-Chain Agent* leaderboard counts) and it lets the three-brain reasoning still drive the swap direction and sizing.

---

## What makes this a Season 2 winner

| Judging axis | How YieldAgent satisfies it |
|---|---|
| **OnchainOS in the core path (Most Active On-Chain Agent)** | 100 % of DEX execution flows through `onchainos swap execute`, signed inside the Agentic Wallet TEE. `ExecutionEngine` is *only* an audit sink — it cannot sign. Grep `agent/src/adapters/OnchainOSAdapter.ts:swap` to verify every tx hash originates from an OnchainOS `spawn()`. |
| **Uniswap AI Skills in the core path (Best Uniswap AI Skills Integration)** | **Two Uniswap AI Skills are live-loaded and cited at runtime:** (1) **`liquidity-planner@0.2.0`** drives `PoolBrain.recommendedRanges` — same DexScreener endpoints, same tick-spacing table, same range-recommendation heuristics as the upstream skill, 1:1 ported in `UniswapSkillsAdapter.computeRangeCandidates()`. (2) **`swap-planner@0.1.0`** is wired into `AgentCoordinator.rebalanceViaOnchainOS` via `UniswapSkillsAdapter.planRebalanceSwap()` — every rebalance broadcast flows through the planner, which applies the per-pair slippage ladder (stable 0.1 % / correlated 0.3 % / major 0.5 % / volatile 1.0 %), the price-impact k-factor table (deep 1.0 / moderate 1.5 / thin 2.5 / very_thin 4.0), the 1.5×-impact slippage boost with a 0.05 % floor, and the optional split-swap plan for trades >0.5 % of pool TVL. Both skills are surfaced at runtime via `/api/health` (`uniswapSkills[]` array) so judges can grep the endpoint and verify both are loaded in the live process. |
| **X Layer specifically required** | 5-min monitoring loop × multiple positions × users = thousands of small txns. Only X Layer's gas-free concentrated-LP txs make this viable economically. |
| **Genuine AI agent UX** | Three on-chain analytics brains, GPT-4o-mini intent parser, GPT-4o-mini reasoning composer, real-time chat that explains *why* each decision was made. Every reasoning string is on-chain and can be queried by anyone. |
| **End-to-end working system** | Solidity contracts + Hardhat deploy + Node agent + Next.js frontend + WebSocket live updates + OnchainOS CLI wiring. Dashboard wires `IntentInput` → `DeployControls` (Deploy Strategy + Start/Stop Monitor buttons with mainnet-confirm dialog) → `ThreeBrainPanel` + `LPRangeChart` + `DecisionLog`, so a judge can reproduce the full intent→deploy→monitor loop from the browser. Can be run on a single laptop after `cp .env.example .env` and `onchainos wallet login --force`. |
| **Mechanical verification** | 68-test hardhat suite (`test/DecisionLogger.test.ts` + `test/StrategyManager.test.ts` + `test/FollowVault.test.ts`) enforces every audit-layer invariant the submission relies on, including the unauthorized-caller revert paths for `StrategyManager` / `DecisionLogger`, the confidence-range validation on every `logDecision`, and the FollowVault share-math dilution fix (no new follower can ever be "taxed" by the current follower set). Run `npm test` to see it in ~1 s — if anything regresses, `SUBMISSION.md`'s honest-by-construction claims are mechanically impossible to hold. |

---

## Smart contracts at a glance

### `DecisionLogger.sol`

- `logDecision(strategyId, agent, action, oldTickLower, oldTickUpper, newTickLower, newTickUpper, confidence, reasoning)`
- `getDecisionHistory(strategyId)` / `getRecentDecisions(strategyId, count)`
- Per-agent stats: `agentStats(agent)` returns deploy/rebalance/compound/exit/hold counts

### `StrategyManager.sol`

- `deployStrategy(pool, positions[], riskProfile, thesis)` → mints multi-range LP positions
- `rebalance(strategyId, newPositions[], reasoning, confidence)` → atomically closes + reopens
- `compoundFees(strategyId)` → collects fees, reinvests into main range
- `emergencyExit(strategyId, reasoning)` → closes everything, returns funds
- `logHold(strategyId, reasoning, confidence)` → records a do-nothing decision on-chain
- User-facing: `deposit(strategyId, amount)` / `withdraw(strategyId, shares)`
- 10 % default performance fee, max 30 %, agent-only writes

### `FollowVault.sol` + `FollowVaultFactory.sol`

- ERC20 vault per strategy
- `follow(amount)` mints shares pro-rata against `totalAssets()`
- `unfollow(shares)` redeems and pays the agent's perf fee on profit
- High-water-mark style fee, never charges twice

---

## Agent backend HTTP API

| Method | Path | Body | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | — | Service + chain info |
| `GET` | `/api/state` | — | Current `AgentState` |
| `GET` | `/api/history` | — | All evaluations |
| `GET` | `/api/latest` | — | Latest evaluation |
| `POST` | `/api/intent` | `{input}` | Parse natural language → `UserIntent` |
| `POST` | `/api/analyze` | `{poolAddress}` | Three-brain analysis without deploy |
| `POST` | `/api/deploy` | `{poolAddress, intent}` | Deploy strategy on-chain |
| `POST` | `/api/monitor/start` | `{strategyId?}` | Start the 5-min loop |
| `POST` | `/api/monitor/stop` | — | Stop monitoring |
| `POST` | `/api/chat` | `{message}` | Conversational interface |

WebSocket at `/ws` pushes `{type: "state" \| "evaluation" \| "history", payload}` events in real time.

---

## License

MIT. Built for OKX X Layer Build X Hackathon — Season 2.
