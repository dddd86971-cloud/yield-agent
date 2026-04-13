# YieldAgent

**An autonomous AI liquidity strategist on X Layer — real Uniswap V3 LP positions minted through OnchainOS TEE, every decision anchored on-chain.**

YieldAgent is a three-brain AI agent that plans, deploys, monitors, rebalances, and compounds **real Uniswap V3 concentrated-liquidity NFT positions** on X Layer. A user says one sentence; the AI parses intent, runs three parallel analysis brains (Market · Pool · Risk), mints a V3 LP NFT via the `NonfungiblePositionManager`, monitors every 5 minutes, auto-collects fees, and rebalances when needed — all signed through the **OnchainOS Agentic Wallet TEE** via `wallet contract-call`. Every decision — *including the decision to do nothing* — is recorded on-chain through `DecisionLogger`, so users and judges can audit the AI's reasoning forever.

Built for **OKX Build X AI Hackathon — Season 2**, X Layer Arena track.

> **Live demo**: [frontend-nine-theta-22.vercel.app](https://frontend-nine-theta-22.vercel.app) &nbsp;|&nbsp; **Backend API**: `http://localhost:3001/api/health`

---

## Judging-Aligned Evidence Map

YieldAgent is designed around the four scoring dimensions of the X Layer Arena track (25% each). Every claim below links to verifiable code or on-chain proof.

| Dimension (25% each) | Score Target | Key Evidence |
|---|---|---|
| **1. OnchainOS / Uniswap Integration** | Deep, load-bearing integration of both | Two Uniswap AI Skills (`liquidity-planner` + `swap-planner`) on the critical path · V3 LP mint/collect/rebalance via `onchainos wallet contract-call` (TEE-signed) · Real NFT #962 owned by Agentic Wallet |
| **2. X Layer Ecosystem Fit** | Purpose-built for X Layer | Gas-free 5-min monitoring loop · Uniswap V3 official deployment on X Layer (`0x315e413a…`) · 3 audit contracts live on mainnet 196 · Two-signer anti-gaming architecture |
| **3. AI Interaction Experience** | Natural, smart, transparent | One-sentence intent → full LP deploy · SSE streaming with brain-progress · Bilingual (CN/EN) · Every AI reasoning on-chain and auditable |
| **4. Product Completeness** | End-to-end runnable | Real V3 NFT positions on mainnet · 68 hardhat tests · 17 E2E Playwright tests · Vercel deployment · Monitor loop producing live decisions |

---

## 1. OnchainOS / Uniswap Integration & Innovation (25%)

### 1a. OnchainOS Agentic Wallet — TEE-Signed V3 LP Operations

YieldAgent is the **first project to route Uniswap V3 NonfungiblePositionManager calls through OnchainOS `wallet contract-call`**. Not just swaps — real `approve`, `mint`, `collect`, `decreaseLiquidity` operations, all signed inside the Agentic Wallet's TEE.

**Verified on-chain proof (X Layer mainnet 196):**

| Operation | Tx Hash | Signed By |
|---|---|---|
| USDT `approve` → NPM | [`0x6cf923cb…`](https://www.oklink.com/xlayer/tx/0x6cf923cb06b11282bfd75eb94840493b974b45b08911797e4a34ed494b5c9842) | OnchainOS TEE |
| WOKB `approve` → NPM | [`0xbcf17ede…`](https://www.oklink.com/xlayer/tx/0xbcf17ede11efeed316feaa3e335b59d31a422385c2d76307ff64f35c1f27f12d) | OnchainOS TEE |
| **NPM.mint() → NFT #962** | [`0x0856912b…`](https://www.oklink.com/xlayer/tx/0x0856912b51a4c36d3316dc3860cae28f20627a8bea9ce49e9c30b4d7a3704bb7) | OnchainOS TEE |
| Swap deploy (Strategy #1) | [`0x8204ad49…`](https://www.oklink.com/xlayer/tx/0x8204ad49a1f27ae3412644c2b62a2f20fd7d79d9445d9dd8a99343eb85e512f3) | OnchainOS TEE |

**NFT #962** is a real Uniswap V3 LP position (USDT/WOKB 0.3%) owned by the OnchainOS Agentic Wallet `0x6ab27b82890bc85cd996f518173487ece9811d61`. Judges can verify:

```bash
# Verify NFT owner
cast call 0x315e413a11ab0df498ef83873012430ca36638ae \
  "ownerOf(uint256)(address)" 962 --rpc-url https://rpc.xlayer.tech
# → 0x6ab27b82890bc85cd996f518173487ece9811d61  (Agentic Wallet)
```

**Three-tier execution priority** (code: [`AgentCoordinator.ts`](agent/src/services/AgentCoordinator.ts)):

```
Priority 1: OnchainOS TEE → wallet contract-call → NPM.mint()    ← anti-gaming ✅
Priority 2: Direct PRIVATE_KEY → NPM.mint()                       ← fallback
Priority 3: OnchainOS swap execute                                 ← legacy path
```

**Implementation**: [`V3PositionManager.ts`](agent/src/services/V3PositionManager.ts) — `mintViaTEE()`, `collectViaTEE()`, `decreaseLiquidityViaTEE()`, `deployLPViaTEE()` all encode calldata locally and route through `OnchainOSAdapter.contractCall()`.

### 1b. Two Uniswap AI Skills on the Load-Bearing Path

Both skills are ported 1:1 into [`UniswapSkillsAdapter.ts`](agent/src/adapters/UniswapSkillsAdapter.ts), surfaced at runtime via `GET /api/health → uniswapSkills[]`, and invoked on every deploy/rebalance:

| Skill | Version | Where It's Called | What It Does |
|---|---|---|---|
| `liquidity-planner` | `0.2.0` | `PoolBrain.analyze()` → `UniswapSkillsAdapter.computeRangeCandidates()` | Pair classification (stable/correlated/major/volatile), tick-spacing table, range-recommendation heuristics, DexScreener data |
| `swap-planner` | `0.1.0` | `AgentCoordinator.rebalanceViaOnchainOS()` → `UniswapSkillsAdapter.planRebalanceSwap()` | Per-pair slippage ladder, price-impact k-factor (deep 1.0 / moderate 1.5 / thin 2.5 / very_thin 4.0), 1.5×-impact boost, optional split-swap for >0.5% TVL trades |

### 1c. Real V3 LP Lifecycle (Not Just Swaps)

| V3 Operation | Method | Code |
|---|---|---|
| **Mint LP position** | `NPM.mint()` via TEE | `V3PositionManager.mintViaTEE()` |
| **Collect trading fees** | `NPM.collect()` via TEE | `V3PositionManager.collectViaTEE()` |
| **Remove liquidity** | `NPM.decreaseLiquidity()` via TEE | `V3PositionManager.decreaseLiquidityViaTEE()` |
| **Full rebalance** | remove → collect → re-mint | `V3PositionManager.rebalance()` |
| **Optimal token split** | sqrtPrice-based ratio calculation | `V3PositionManager.calculateOptimalAmounts()` |

---

## 2. X Layer Ecosystem Fit (25%)

### 2a. X Layer-Native Uniswap V3 Deployment

YieldAgent discovered and integrated the **official Uniswap V3 deployment on X Layer** (confirmed via `@uniswap/sdk-core` v7.13.0 and Governance Proposal #67):

| Contract | Address | Verified |
|---|---|---|
| **UniswapV3Factory** | `0x4B2ab38DBF28D31D467aA8993f6c2585981D6804` | `getPool(USDT,WOKB,3000)` ✅ |
| **NonfungiblePositionManager** | `0x315e413a11ab0df498ef83873012430ca36638ae` | `factory()` ✅, `name()` = "Uniswap V3 Positions NFT-V1" |
| **SwapRouter02** | `0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca` | bytecode verified |
| **Quoter** | `0x976183ac3d09840d243a88c0268badb3b3e3259f` | bytecode verified |
| **TickLens** | `0x661e93cca42afacb172121ef892830ca3b70f08d` | bytecode verified |

Config: [`agent/src/config/index.ts`](agent/src/config/index.ts) lines 31-37.

### 2b. Three Audit Contracts on X Layer Mainnet

| Contract | Address | Explorer |
|---|---|---|
| `DecisionLogger` | `0x5989f764bC20072e6554860547CfEC474877892C` | [OKLink](https://www.oklink.com/xlayer/address/0x5989f764bC20072e6554860547CfEC474877892C) |
| `StrategyManager` v2 | `0x2180fA2e3F89E314941b23B7acC0e60513766712` | [OKLink](https://www.oklink.com/xlayer/address/0x2180fA2e3F89E314941b23B7acC0e60513766712) |
| `FollowVaultFactory` | `0x9203C9d95115652b5799ab9e9A640DDEB0879F85` | [OKLink](https://www.oklink.com/xlayer/address/0x9203C9d95115652b5799ab9e9A640DDEB0879F85) |

Same addresses on testnet (1952) — deterministic CREATE deploy.

### 2c. Two-Signer Anti-Gaming Architecture

| Agent | Address | Signs | Cannot Do |
|---|---|---|---|
| **OnchainOS Agentic Wallet** (TEE) | [`0x6ab27b82…`](https://www.oklink.com/xlayer/address/0x6ab27b82890bc85cd996f518173487ece9811d61) | All DEX txs — V3 mint, swap, approve, rebalance | Cannot write to StrategyManager / DecisionLogger |
| **Audit EOA** | [`0x2E2FC9d6…`](https://www.oklink.com/xlayer/address/0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838) | Audit records — deployStrategy, recordExecution, logHold | Cannot call OnchainOS, cannot sign DEX txs |

**Why this matters**: A judge can cross-reference `StrategyManager.getExecutions(strategyId)[i].txHash` against the Agentic Wallet's on-chain activity — the hashes must match 1:1, because the audit signer physically cannot fabricate one.

### 2d. Why X Layer Specifically

1. **Gas-free monitoring loop.** 5-min tick × multiple positions × HOLD logs = thousands of txns/month. Only X Layer makes this economically free.
2. **Native OnchainOS integration.** TEE signing, ERC-4337, OKX DEX aggregator — all natively on X Layer.
3. **On-chain AI audit trail.** Every decision (including HOLD) logged on-chain. On any L2 with calldata cost, you'd have to drop HOLD logs, breaking the audit invariant.

---

## 3. AI Interaction Experience (25%)

### 3a. One-Sentence Intent → Full V3 LP Deploy

```
User: "帮我用100 USDT在OKB池子里做LP，保守一点"
  ↓
IntentParser (GPT-4o-mini): { principal: 100, riskProfile: "conservative", preferredPairs: ["USDT/OKB"] }
  ↓
Three-Brain parallel analysis: Market + Pool + Risk
  ↓
V3PositionManager.deployLPViaTEE(): approve → NPM.mint() → NFT minted
  ↓
StrategyManager.recordExecution(): tx hash anchored on-chain
  ↓
DecisionLogger.logDecision(): AI reasoning stored forever
  ↓
Monitor loop starts: 5-min checks, auto-rebalance, fee collection
```

### 3b. SSE Streaming with Brain Progress

The chat endpoint (`POST /api/chat/stream`) returns Server-Sent Events with real-time brain status:

```
data: {"type":"status","content":"Parsing your intent..."}
data: {"type":"brain","data":{"brain":"market","status":"analyzing"}}
data: {"type":"brain","data":{"brain":"pool","status":"analyzing"}}
data: {"type":"brain","data":{"brain":"market","status":"done","summary":"OKB ranging, vol 2.3%"}}
data: {"type":"brain","data":{"brain":"pool","status":"done","summary":"Fee APR: 12.5%"}}
data: {"type":"status","content":"Minting V3 LP via OnchainOS TEE..."}
data: {"type":"done","action":"deploy","data":{"strategyId":3,"executionMode":"live"}}
```

Frontend renders each brain's status in real-time with analyzing→done transitions. Code: [`AgentChat.tsx`](frontend/src/components/AgentChat.tsx).

### 3c. Bilingual Detection (Chinese / English)

Both the system prompts in `handleChat` and `handleChatStream` detect the user's language and respond accordingly. Chinese users get Chinese; English users get English.

### 3d. Chat-as-Action — Not Just a Chatbot

The chat isn't a wrapper around a separate UI. Saying "deploy 50 USDT moderate" **directly triggers** the deploy pipeline:

| Chat Command | Action Triggered |
|---|---|
| "deploy 100 USDT conservative" | Full three-brain analysis + V3 LP mint |
| "分析一下池子" | Pool analysis with market data |
| "为什么" / "why" | Explains the last decision with data |
| "保守一点" / "aggressive" | Adjusts risk profile for next rebalance |
| "status" / "状态" | Returns full agent status including V3 NFT info |
| "start monitor" / "stop monitor" | Controls the 5-min evaluation loop |

### 3e. AI-Driven Price Alerts

When the monitoring loop detects a ≥3% price move between evaluations, the agent proactively pushes a WebSocket alert to the frontend with severity classification (warn at 3%, critical at 5%). Code: `AgentCoordinator.runFullEvaluation()` → `this.onAlert?.(...)`.

### 3f. AI Reasoning On-Chain

Every decision's reasoning is generated by GPT-4o-mini and stored on-chain via `DecisionLogger.logDecision(...)` — not just "HOLD" or "REBALANCE", but the *why*:

> "HOLD: OKB ranging at $82.6, volatility 2.3%, position healthy at 87%. No rebalance trigger. Confidence: 85%"

Anyone can reconstruct the agent's thinking at every block height by scanning a single contract address.

---

## 4. Product Completeness (25%)

### 4a. Real On-Chain Positions (Not Mocks)

| Position | Owner | Tx | Status |
|---|---|---|---|
| **NFT #959** (direct mint) | Agent EOA `0x2E2FC9d6…` | [`0x7acba022…`](https://www.oklink.com/xlayer/tx/0x7acba0224fb464f2aebe94ae9554eb2a5dbd74c68f1741fad92c1bd8c4c9eac5) | ✅ Live, USDT/WOKB 0.3% |
| **NFT #962** (TEE mint) | Agentic Wallet `0x6ab27b82…` | [`0x0856912b…`](https://www.oklink.com/xlayer/tx/0x0856912b51a4c36d3316dc3860cae28f20627a8bea9ce49e9c30b4d7a3704bb7) | ✅ Live, USDT/WOKB 0.3% |
| **Strategy #1** audit trail | 50+ on-chain decisions | [`StrategyManager.getExecutions(1)`](https://www.oklink.com/xlayer/address/0x2180fA2e3F89E314941b23B7acC0e60513766712) | ✅ Monitoring active |

### 4b. Full Test Coverage

| Suite | Count | What It Covers |
|---|---|---|
| **Hardhat unit tests** | 68 passing | DecisionLogger (23) + StrategyManager (25) + FollowVault (20) — every write path |
| **Playwright E2E tests** | 17 passing | Landing page (5) + Dashboard (5) + Decisions (3) + Follow (4) |
| **Total** | **85 tests** | Smart contracts + frontend UI |

```bash
npm test              # 68 hardhat tests in ~1s
cd frontend && npm run test:e2e   # 17 Playwright tests in ~13s
```

### 4c. Working Frontend

| Page | Features |
|---|---|
| **Landing** (`/`) | Hero + three-brain features + try-agent chat widget + FAQ |
| **Dashboard** (`/app`) | Intent input + pool selector + deploy controls + **V3 Positions panel** (real-time NFT display with range visualization) + three-brain panel + LP range chart + agent chat with SSE streaming + decision log |
| **Decisions** (`/app/decisions`) | Full decision history with stat cards |
| **Follow** (`/app/follow`) | FollowVault leaderboard + copy-trading guide |

**Live**: [frontend-nine-theta-22.vercel.app](https://frontend-nine-theta-22.vercel.app)

### 4d. Backend API (14 endpoints)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Full health probe: OnchainOS status, Uniswap Skills, chain info |
| `GET` | `/api/state` | Current agent state |
| `GET` | `/api/history` | All evaluation history |
| `GET` | `/api/latest` | Latest evaluation |
| `POST` | `/api/intent` | Natural language → UserIntent |
| `POST` | `/api/analyze` | Three-brain analysis |
| `POST` | `/api/deploy` | Deploy strategy + V3 LP mint |
| `POST` | `/api/monitor/start` | Start 5-min monitoring loop |
| `POST` | `/api/monitor/stop` | Stop monitoring |
| `POST` | `/api/chat` | Structured chat response |
| `POST` | `/api/chat/stream` | SSE streaming chat with brain progress |
| `GET` | `/api/v3/positions` | Real V3 NFT positions owned by agent |
| `GET` | `/api/v3/pool/:address` | Real-time pool state (tick, liquidity, price) |
| `WS` | `/ws` | Real-time state + evaluation + alert push |

### 4e. Monitor Loop (Running Now)

```
Every 5 min:   Quick edge-proximity check → trigger full eval if urgent
Every 30 min:  Full three-brain re-analysis → HOLD / REBALANCE / EMERGENCY_EXIT
Every 6 hours: Fee collection heartbeat → collect V3 fees if position exists
```

All decisions (including HOLD) logged on-chain with reasoning + confidence.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 14)                          │
│  Intent Input · V3 Positions · Three-Brain · LP Chart · Agent Chat  │
│  SSE Streaming · AlertBanner · Decision Log · Follow Leaderboard    │
└──────────────────────┬──────────────────────┬───────────────────────┘
                       │ HTTP + SSE + WS      │ wagmi v2 + RainbowKit
                       ▼                      ▼
┌─────────────────────────────────────────┐  ┌────────────────────────┐
│       Agent Backend (Node + TS)         │  │    X Layer (196)       │
│ ┌─────────────────────────────────────┐ │  │ ┌────────────────────┐ │
│ │ IntentParser    (GPT-4o-mini)       │ │  │ │ StrategyManager v2 │ │
│ │ MarketBrain     (on-chain TWAP)     │ │  │ │ DecisionLogger     │ │
│ │ PoolBrain ← UniswapSkillsAdapter   │ │  │ │ FollowVaultFactory │ │
│ │   (liquidity-planner + swap-planner)│ │  │ └────────────────────┘ │
│ │ RiskBrain       (IL math)           │ │  │          ▲             │
│ │ V3PositionManager ──────────────────┼─┼──┼──► NPM.mint()        │
│ │   mintViaTEE / collectViaTEE /      │ │  │    NPM.collect()      │
│ │   decreaseLiquidityViaTEE           │ │  │    (TEE-signed via     │
│ │ OnchainOSAdapter (CLI spawn) ───────┼─┼──┼──► wallet contract-   │
│ │ ExecutionEngine (audit-only writes) │ │  │    call)               │
│ │ AgentCoordinator (5-min loop)       │ │  │                        │
│ └─────────────────────────────────────┘ │  │ ┌────────────────────┐ │
│                                         │  │ │ Uniswap V3 (X Layer│ │
│                                         │  │ │  Factory: 0x4B2a…  │ │
│                                         │  │ │  NPM:     0x315e…  │ │
│                                         │  │ │  Router:  0x4f0c…  │ │
│                                         │  │ └────────────────────┘ │
└─────────────────────────────────────────┘  └────────────────────────┘
```

**Key invariant**: `V3PositionManager.mintViaTEE()` encodes calldata locally and routes it through `OnchainOSAdapter.contractCall()` → `onchainos wallet contract-call`. The resulting tx is signed by the Agentic Wallet's TEE signer, not the agent's local private key. This is the construct-level anti-gaming guarantee.

---

## The Three Brains

| Brain | Inputs | Output | Key Computation |
|---|---|---|---|
| **Market Brain** | On-chain TWAP, price history (2016 snapshots ≈ 7d) | Volatility, market state, 1h price change | Realised volatility (ATR-style), trend classification |
| **Pool Brain** | `slot0`, liquidity, tick samples, oracle observations | Recommended LP ranges (wide/narrow/ultra-narrow), APR, IL est. | Uses `liquidity-planner` methodology — pair classification, tick-spacing snapping, DexScreener data |
| **Risk Brain** | Current tick vs entry tick vs range | IL%, health 0-100, in-range bool, rebalance urgency | Concentrated-liquidity IL formula, edge proximity vs risk profile threshold |

`AgentCoordinator` runs all three in parallel, then uses GPT-4o-mini to compose a ≤200-char reasoning string that gets pushed to `DecisionLogger.logDecision(...)`.

---

## Repo Layout

```
yield-agent/
├── contracts/
│   ├── DecisionLogger.sol             # On-chain AI decision history
│   ├── StrategyManager.sol            # Core LP management + audit
│   └── FollowVault.sol                # ERC20 copy-trading vaults
├── test/                              # 68 hardhat tests
├── agent/
│   └── src/
│       ├── config/index.ts            # X Layer V3 contract addresses
│       ├── adapters/
│       │   ├── OnchainOSAdapter.ts    # CLI spawn: swap + contract-call
│       │   └── UniswapSkillsAdapter.ts # liquidity-planner + swap-planner
│       ├── engines/
│       │   ├── IntentParser.ts        # NL → structured intent
│       │   ├── MarketBrain.ts         # Market analysis
│       │   ├── PoolBrain.ts           # Pool/range analysis
│       │   ├── RiskBrain.ts           # IL + risk math
│       │   └── ExecutionEngine.ts     # Audit-only writes
│       ├── services/
│       │   ├── AgentCoordinator.ts    # 5-min loop + chat + deploy
│       │   └── V3PositionManager.ts   # Real V3 LP: mint/collect/rebalance
│       ├── scripts/
│       │   └── mintTestLP.ts          # Standalone V3 mint script
│       └── index.ts                   # Express + WS + SSE server
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── AgentChat.tsx          # SSE streaming chat
│       │   ├── V3Positions.tsx        # Real-time V3 NFT display
│       │   ├── AlertBanner.tsx        # Price alerts
│       │   ├── ThreeBrainPanel.tsx    # Brain status visualization
│       │   └── ...
│       ├── lib/
│       │   ├── api.ts                 # Backend client + WS + V3 types
│       │   └── hooks.ts              # useAgentState + alerts
│       └── e2e/                       # 17 Playwright tests
├── hardhat.config.ts
└── README.md
```

---

## Quickstart

### 0. Prerequisites

- Node 20+, OKB-funded wallet on X Layer, OpenAI API key
- **OnchainOS CLI** installed: `curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`
- OnchainOS API keys from https://web3.okx.com/onchainos/dev-portal

### 1. Install

```bash
npm install                          # Root (contracts)
cd agent && npm install && cd ..     # Agent backend
cd frontend && npm install && cd ..  # Frontend
```

### 2. Configure

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
# Edit .env: PRIVATE_KEY, OPENAI_API_KEY, OKX_ACCESS_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE
```

### 3. Log in to OnchainOS

```bash
onchainos wallet login --force
onchainos wallet status              # Should show loggedIn: true
```

### 4. Deploy contracts

```bash
npm run compile && npm run deploy:xlayer
# Copy addresses into .env
```

### 5. Run

```bash
cd agent && npm start                # Backend: http://localhost:3001
cd frontend && npm run dev           # Frontend: http://localhost:3000
```

### 6. Verify

```bash
curl http://localhost:3001/api/health | jq          # OnchainOS + Skills status
curl http://localhost:3001/api/v3/positions | jq    # Real V3 NFT positions
curl http://localhost:3001/api/v3/pool/0x63d62734847E55A266FCa4219A9aD0a02D5F6e02 | jq
npm test                                            # 68 hardhat tests
cd frontend && npm run test:e2e                     # 17 Playwright tests
```

---

## Strategy Lifecycle (End-to-End)

1. **User intent**: "帮我用100 USDT做LP，稳健一点" or "Deploy 100 USDT moderate"
2. **IntentParser** → `{ principal: 100, riskProfile: "moderate" }`
3. **MarketBrain + PoolBrain + RiskBrain** run in parallel
4. **PoolBrain** uses `liquidity-planner` methodology for range recommendations
5. **V3PositionManager.deployLPViaTEE()** → `wallet contract-call` → `NPM.mint()` → real V3 NFT
6. **ExecutionEngine.recordExecution()** anchors the TEE-signed tx hash on-chain
7. **DecisionLogger.logDecision(DEPLOY, reasoning, confidence)** stores AI thinking
8. **Monitor loop** starts: 5min quick / 30min full / 6h compound
9. **Each evaluation** → HOLD / REBALANCE / COMPOUND / EMERGENCY_EXIT
10. **Rebalance** → `decreaseLiquidity` → `collect` → re-`mint` at new range (all via TEE)
11. **Fee collection** → `NPM.collect()` via TEE, anchored as COMPOUND audit row
12. **Followers** can copy via `FollowVaultFactory.createVault()` → ERC20 share tokens

---

## Smart Contracts

### `DecisionLogger.sol`
- `logDecision(strategyId, agent, action, ticks, confidence, reasoning)` — every AI decision on-chain
- `getDecisionHistory(strategyId)` / `getRecentDecisions(strategyId, count)`
- Per-agent stats: `agentStats(agent)` returns deploy/rebalance/compound/exit/hold counts

### `StrategyManager.sol`
- `deployStrategy(pool, positions[], riskProfile, thesis)` — registers strategy
- `recordExecution(strategyId, action, ticks, txHash, externalId)` — anchors OnchainOS tx hash
- `rebalance` / `compoundFees` / `emergencyExit` / `logHold` — full lifecycle
- 10% default performance fee

### `FollowVault.sol` + `FollowVaultFactory.sol`
- ERC20 vault per strategy, `follow(amount)` mints shares, `unfollow(shares)` redeems
- High-water-mark fee, share-math dilution bug found and fixed (test-first)

---

## Team

**Solo developer** — end-to-end: Solidity contracts, TypeScript agent, Next.js frontend, OnchainOS CLI integration, Uniswap AI Skills porting, V3 NonfungiblePositionManager discovery and integration, mainnet deployment, on-chain activity.

---

## License

MIT. Built for OKX Build X AI Hackathon — Season 2, X Layer Arena track.
