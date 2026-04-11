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
| **Planning skills** | Uniswap AI Skills (`liquidity-planner` + `swap-planner`) |
| **DEX execution** | OnchainOS Agentic Wallet + `onchainos swap execute` (TEE-signed) |
| **Audit trail** | Every DEPLOY / REBALANCE / COMPOUND / HOLD logged on-chain with reasoning + confidence |
| **Copy-trading** | `FollowVault` per-strategy ERC20 vault, agent earns 10 % perf fee |

---

## Why YieldAgent

Most "AI + DeFi" projects are a chatbot wrapper around a Swap UI. YieldAgent is different:

1. **Honest-by-construction.** Every HOLD is recorded with its confidence and its reasoning. Every rebalance cites the market + pool + risk analysis that justified it. `DecisionLogger.logDecision(...)` is called *for every action*. A copy-trading follower isn't just trusting an API — they can scan `DecisionLogger.getDecisionHistory(strategyId)` and see the entire thought process.
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
│   ├── DecisionLogger.sol                 # On-chain AI decision history
│   ├── StrategyManager.sol                # Core LP management contract
│   └── FollowVault.sol                    # ERC20 copy-trading vaults
├── scripts/
│   └── deploy.ts                          # Hardhat deployment to X Layer
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
| **Uniswap AI Skills in the core path (Best Uniswap AI Skills Integration)** | `PoolBrain.recommendedRanges` is implemented in `UniswapSkillsAdapter.ts` — it reads the installed `liquidity-planner@0.2.0` skill file, hits the same DexScreener endpoints, uses the same tick-spacing table, and applies the same range-recommendation heuristics. Every range the agent picks is citable back to the skill version. |
| **X Layer specifically required** | 5-min monitoring loop × multiple positions × users = thousands of small txns. Only X Layer's gas-free concentrated-LP txs make this viable economically. |
| **Genuine AI agent UX** | Three on-chain analytics brains, GPT-4o-mini intent parser, GPT-4o-mini reasoning composer, real-time chat that explains *why* each decision was made. Every reasoning string is on-chain and can be queried by anyone. |
| **End-to-end working system** | Solidity contracts + Hardhat deploy + Node agent + Next.js frontend + WebSocket live updates + OnchainOS CLI wiring. Can be run on a single laptop after `cp .env.example .env` and `onchainos wallet login --force`. |

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
