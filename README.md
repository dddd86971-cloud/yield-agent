# YieldAgent — Autonomous AI Liquidity Manager on X Layer

<p align="center">
  <img src="https://img.shields.io/badge/X%20Layer-Mainnet%20196-00ffa3?style=for-the-badge" />
  <img src="https://img.shields.io/badge/OnchainOS-TEE%20Signed-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Uniswap%20V3-LP%20Positions-ff007a?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Tests-85%20Passing-brightgreen?style=for-the-badge" />
</p>

> **Live Demo**: [frontend-nine-theta-22.vercel.app](https://frontend-nine-theta-22.vercel.app)
> &nbsp;|&nbsp; **GitHub**: [github.com/dddd86971-cloud/yield-agent](https://github.com/dddd86971-cloud/yield-agent)

Built for **OKX Build X AI Hackathon — Season 2**, X Layer Arena Track.

---

## 📖 Project Introduction

YieldAgent is an **autonomous AI liquidity strategist** that manages Uniswap V3 concentrated-liquidity positions on X Layer. A user describes their intent in one sentence; the AI parses it, runs three parallel analysis brains (Market · Pool · Risk), deploys a real V3 LP position via the OnchainOS Agentic Wallet TEE, and continuously monitors/rebalances — all without human intervention.

**Core Value Proposition:**
- **One-sentence deploy**: "Deploy 100 USDT as LP, conservative" → real V3 NFT minted on X Layer
- **Three-Brain AI**: Market + Pool + Risk brains evaluate every 5 minutes
- **TEE-signed execution**: All DEX transactions signed inside OnchainOS Agentic Wallet (ERC-4337)
- **On-chain audit trail**: Every AI decision (including "do nothing") is recorded on-chain via `DecisionLogger`
- **Copy-trading**: FollowVault lets anyone mirror agent strategies with one click

**What makes YieldAgent different:** Unlike chatbot wrappers that only *suggest* trades, YieldAgent is a fully autonomous agent that *plans, executes, monitors, rebalances, and compounds* real on-chain positions — with every reasoning step permanently anchored on-chain for verifiability.

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 14 + Vercel)                    │
│   Intent Input · Agent Chat (SSE) · Three-Brain Panel · V3 Positions     │
│   Deploy Controls · Decision Log · Follow Leaderboard · Price Alerts     │
└────────────────────┬──────────────────────┬──────────────────────────────┘
                     │ HTTP + SSE + WS      │ wagmi v2 (injected connector)
                     ▼                      ▼
┌──────────────────────────────────────┐  ┌─────────────────────────────────┐
│     Agent Backend (Node.js + TS)     │  │       X Layer Mainnet (196)     │
│                                      │  │                                 │
│  ┌──────────────────────────────┐    │  │  ┌───────────────────────────┐  │
│  │ IntentParser (GPT-4o-mini)   │    │  │  │ YieldAgent Contracts      │  │
│  │ MarketBrain (on-chain TWAP)  │    │  │  │  · DecisionLogger         │  │
│  │ PoolBrain  (liquidity-planner│    │  │  │  · StrategyManager v2     │  │
│  │            + swap-planner)   │    │  │  │  · FollowVaultFactory     │  │
│  │ RiskBrain  (IL math)         │    │  │  └───────────────────────────┘  │
│  │ V3PositionManager            │────┼──┼──▶ Uniswap V3 (X Layer)       │
│  │  · mintViaTEE()              │    │  │    · Factory   0x4B2a…        │
│  │  · collectViaTEE()           │    │  │    · NPM       0x315e…        │
│  │  · rebalanceViaTEE()         │    │  │    · Router    0x4f0c…        │
│  │ OnchainOSAdapter             │────┼──┼──▶ OnchainOS TEE Signer       │
│  │  · wallet contract-call      │    │  │    Agentic Wallet 0x6ab2…     │
│  │  · swap execute              │    │  │                                 │
│  │ AgentCoordinator (5min loop) │    │  │  ┌───────────────────────────┐  │
│  └──────────────────────────────┘    │  │  │ V3 LP NFT Positions       │  │
│                                      │  │  │  · NFT #962 (TEE mint)    │  │
│  14 REST endpoints + WebSocket       │  │  │  · NFT #966 (Strategy #9) │  │
└──────────────────────────────────────┘  │  └───────────────────────────┘  │
                                          └─────────────────────────────────┘
```

### Two-Signer Anti-Gaming Architecture

| Signer | Address | Responsibility | Cannot Do |
|--------|---------|---------------|-----------|
| **OnchainOS Agentic Wallet** (TEE) | `0x6ab27b82890bc85cd996f518173487ece9811d61` | All DEX txs: V3 mint, swap, approve, rebalance | Cannot write to audit contracts |
| **Audit EOA** | `0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838` | Audit records: deployStrategy, logDecision | Cannot sign DEX transactions |

This split-key design means a judge can cross-reference `StrategyManager.getExecutions(strategyId)` against the Agentic Wallet's on-chain activity — the tx hashes must match 1:1, because the audit signer physically cannot fabricate DEX transactions.

---

## 📍 Deployment Addresses

### Smart Contracts (X Layer Mainnet, Chain ID: 196)

| Contract | Address | Explorer |
|----------|---------|----------|
| **DecisionLogger** | `0x5989f764bC20072e6554860547CfEC474877892C` | [OKLink](https://www.oklink.com/xlayer/address/0x5989f764bC20072e6554860547CfEC474877892C) |
| **StrategyManager** v2 | `0x2180fA2e3F89E314941b23B7acC0e60513766712` | [OKLink](https://www.oklink.com/xlayer/address/0x2180fA2e3F89E314941b23B7acC0e60513766712) |
| **FollowVaultFactory** | `0x9203C9d95115652b5799ab9e9A640DDEB0879F85` | [OKLink](https://www.oklink.com/xlayer/address/0x9203C9d95115652b5799ab9e9A640DDEB0879F85) |

### Agentic Wallet (OnchainOS TEE)

| Item | Value |
|------|-------|
| **Wallet Address** | `0x6ab27b82890bc85cd996f518173487ece9811d61` |
| **Account ID** | `04c9d299-9e85-4c20-98c5-8f1f2a4bba36` |
| **Type** | ERC-4337 (OnchainOS TEE Signer) |
| **Explorer** | [OKLink](https://www.oklink.com/xlayer/address/0x6ab27b82890bc85cd996f518173487ece9811d61) |

### Uniswap V3 on X Layer (Official Deployment)

| Contract | Address |
|----------|---------|
| **UniswapV3Factory** | `0x4B2ab38DBF28D31D467aA8993f6c2585981D6804` |
| **NonfungiblePositionManager** | `0x315e413a11ab0df498ef83873012430ca36638ae` |
| **SwapRouter02** | `0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca` |
| **Quoter** | `0x976183ac3d09840d243a88c0268badb3b3e3259f` |
| **TickLens** | `0x661e93cca42afacb172121ef892830ca3b70f08d` |

### Verified On-Chain Activity

| Operation | Tx Hash | Signed By |
|-----------|---------|-----------|
| USDT approve → NPM | [`0x6cf923cb…`](https://www.oklink.com/xlayer/tx/0x6cf923cb06b11282bfd75eb94840493b974b45b08911797e4a34ed494b5c9842) | OnchainOS TEE |
| WOKB approve → NPM | [`0xbcf17ede…`](https://www.oklink.com/xlayer/tx/0xbcf17ede11efeed316feaa3e335b59d31a422385c2d76307ff64f35c1f27f12d) | OnchainOS TEE |
| **NPM.mint() → NFT #962** | [`0x0856912b…`](https://www.oklink.com/xlayer/tx/0x0856912b51a4c36d3316dc3860cae28f20627a8bea9ce49e9c30b4d7a3704bb7) | OnchainOS TEE |
| Swap Deploy (Strategy #1) | [`0x8204ad49…`](https://www.oklink.com/xlayer/tx/0x8204ad49a1f27ae3412644c2b62a2f20fd7d79d9445d9dd8a99343eb85e512f3) | OnchainOS TEE |

**Verify NFT #962 ownership:**
```bash
cast call 0x315e413a11ab0df498ef83873012430ca36638ae \
  "ownerOf(uint256)(address)" 962 --rpc-url https://rpc.xlayer.tech
# → 0x6ab27b82890bc85cd996f518173487ece9811d61  (Agentic Wallet)
```

### Frontend Deployment

| Item | URL |
|------|-----|
| **Live Demo** | [frontend-nine-theta-22.vercel.app](https://frontend-nine-theta-22.vercel.app) |
| **Platform** | Vercel (auto-deploy on git push) |

---

## 🔧 OnchainOS & Uniswap Skill Usage

### OnchainOS Core Modules Used

YieldAgent deeply integrates **6 OnchainOS core commands** as the primary execution layer. All DEX transactions are routed through the Agentic Wallet TEE — the agent's local private key **never** signs DEX operations.

| OnchainOS Command | Where Used | Purpose |
|-------------------|------------|---------|
| `onchainos wallet contract-call` | `V3PositionManager.mintViaTEE()`, `collectViaTEE()`, `decreaseLiquidityViaTEE()` | **Primary execution path** — routes encoded calldata (V3 mint, approve, collect) through TEE signer |
| `onchainos swap execute` | `AgentCoordinator.rebalanceViaOnchainOS()` | DEX swap via OKX aggregator for token rebalancing |
| `onchainos wallet login/status` | `OnchainOSAdapter.checkWalletStatus()` | Agentic Wallet authentication and health check |
| `onchainos wallet addresses` | `OnchainOSAdapter.getAddresses()` | Retrieve TEE wallet addresses |
| `onchainos wallet balance` | `OnchainOSAdapter.getBalance()` | Query wallet balances on X Layer (chain 196) |
| `onchainos defi search/detail/positions` | `OnchainOSAdapter.defiSearch()`, `defiDetail()` | Pool discovery, position tracking, market data |

**Implementation**: [`agent/src/adapters/OnchainOSAdapter.ts`](agent/src/adapters/OnchainOSAdapter.ts) — wraps OnchainOS CLI as a spawned subprocess with structured JSON parsing.

**Three-tier execution priority** (code: [`AgentCoordinator.ts`](agent/src/services/AgentCoordinator.ts)):

```
Priority 1: OnchainOS TEE → wallet contract-call → NPM.mint()    ← anti-gaming ✅
Priority 2: Direct PRIVATE_KEY → NPM.mint()                       ← fallback
Priority 3: OnchainOS swap execute                                 ← legacy swap path
```

### Uniswap AI Skills Used

Both official Uniswap AI Skills are ported verbatim into the agent and invoked on every deploy/rebalance cycle:

| Skill | Version | Source | Where Called | Function |
|-------|---------|--------|-------------|----------|
| **liquidity-planner** | `0.2.0` | [Uniswap AI GitHub](https://github.com/Uniswap/uniswap-ai/tree/main/liquidity-planner) | `PoolBrain.analyze()` → `UniswapSkillsAdapter.computeRangeCandidates()` | Pair classification (stable/correlated/major/volatile), tick-spacing table, range width recommendations, TVL assessment |
| **swap-planner** | `0.1.0` | [Uniswap AI GitHub](https://github.com/Uniswap/uniswap-ai/tree/main/swap-planner) | `AgentCoordinator.rebalanceViaOnchainOS()` → `UniswapSkillsAdapter.planRebalanceSwap()` | Slippage ladder by pair type, price-impact k-factor estimation, minimum output calculation, split-swap for large orders |

**Implementation**: [`agent/src/adapters/UniswapSkillsAdapter.ts`](agent/src/adapters/UniswapSkillsAdapter.ts) — runtime-callable port with methodology citation for every output.

**Key integration points:**
- `classifyPairType()` — categorizes token pairs (stablecoin ±0.5%, major ±5-15%, volatile ±30-100%)
- `computeRangeCandidates()` — generates optimal tick ranges for V3 LP positions
- `planRebalanceSwap()` — calculates slippage tolerance and split-swap strategy for rebalancing

### Real V3 LP Lifecycle (Not Just Swaps)

| V3 Operation | Method | Signed By | Code |
|-------------|--------|-----------|------|
| **Mint LP position** | `NPM.mint()` via TEE | Agentic Wallet | `V3PositionManager.mintViaTEE()` |
| **Collect trading fees** | `NPM.collect()` via TEE | Agentic Wallet | `V3PositionManager.collectViaTEE()` |
| **Remove liquidity** | `NPM.decreaseLiquidity()` via TEE | Agentic Wallet | `V3PositionManager.decreaseLiquidityViaTEE()` |
| **Full rebalance** | remove → collect → re-mint | Agentic Wallet | `V3PositionManager.rebalance()` |
| **Optimal token split** | sqrtPrice-based ratio | Local compute | `V3PositionManager.calculateOptimalAmounts()` |

---

## ⚙️ Operating Mechanism

### End-to-End Strategy Lifecycle

```
1. User Input
   "Deploy 100 USDT as LP in OKB pool, conservative"
                    ↓
2. IntentParser (GPT-4o-mini)
   → { principal: 100, riskProfile: "conservative", preferredPairs: ["USDT/OKB"] }
                    ↓
3. Three-Brain Parallel Analysis
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │ Market Brain │  │  Pool Brain  │  │  Risk Brain  │
   │ On-chain TWAP│  │ liquidity-   │  │ IL math,     │
   │ volatility,  │  │ planner      │  │ health 0-100 │
   │ trend state  │  │ range recs   │  │ rebalance    │
   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
          └─────────────────┼─────────────────┘
                            ↓
4. GPT-4o-mini Synthesis
   → Action: DEPLOY | REBALANCE | HOLD | COMPOUND | EMERGENCY_EXIT
   → Reasoning: "Market ranging, vol 0.94%, Pool APR 12.5%, Health 87%"
   → Confidence: 95%
                            ↓
5. Execution (OnchainOS TEE)
   V3PositionManager.deployLPViaTEE()
   → approve USDT → approve WOKB → NPM.mint() → real V3 NFT
                            ↓
6. On-Chain Audit
   StrategyManager.recordExecution(strategyId, txHash)
   DecisionLogger.logDecision(strategyId, reasoning, confidence)
                            ↓
7. Continuous Monitoring
   Every 5 min:   Quick edge-proximity check
   Every 30 min:  Full three-brain re-analysis
   Every 6 hours: Fee collection heartbeat
                            ↓
8. Auto-Rebalance (when triggered)
   decreaseLiquidity → collect → re-mint at new optimal range
   All via TEE, all logged on-chain
```

### The Three Brains

| Brain | Data Source | Output | Key Computation |
|-------|------------|--------|-----------------|
| **Market Brain** | On-chain TWAP, 2016-snapshot price buffer (~7 days) | Volatility, trend state, price momentum | Realised volatility (ATR-style), trend classification (trending_up/down/ranging/high_vol), whale detection |
| **Pool Brain** | slot0, liquidity, tick spacing, oracle observations + `liquidity-planner` methodology | Recommended LP ranges, fee APR, IL estimate | Pair classification, tick-spacing snapping, TVL assessment, DexScreener data integration |
| **Risk Brain** | Current tick vs entry tick vs range bounds | Health 0-100, IL%, rebalance urgency | Concentrated-liquidity IL formula, edge proximity vs risk-profile threshold, per-profile (conservative/moderate/aggressive) calibration |

### Monitor Loop

```
┌─────────────────────────────────────────────────────┐
│                  Agent Monitor Loop                   │
│                                                       │
│  Every 5 min:   Quick check                          │
│    → Is price near range edge? (>80% of range used)  │
│    → If urgent → trigger full evaluation immediately  │
│                                                       │
│  Every 30 min:  Full three-brain evaluation           │
│    → Market + Pool + Risk analysis in parallel        │
│    → GPT-4o-mini synthesizes recommendation           │
│    → Execute if needed: REBALANCE / COMPOUND / EXIT   │
│    → Log decision on-chain (even HOLD)                │
│                                                       │
│  Every 6 hours: Fee compound heartbeat                │
│    → NPM.collect() via TEE → reinvest fees            │
│    → Record as COMPOUND audit entry                   │
└─────────────────────────────────────────────────────┘
```

### Copy-Trading (FollowVault)

1. **Browse**: Leaderboard ranks strategies by on-chain decision count with search, filter, sort, and pagination
2. **Follow**: Connect browser wallet → approve USDT → deposit into FollowVault → receive vault shares (ERC20)
3. **Auto-mirror**: Vault mirrors the agent's LP positions automatically
4. **Withdraw**: Redeem shares anytime — agent takes 10% of profit, follower keeps 90%

### API Endpoints (14 total)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Full health probe: OnchainOS status, Uniswap Skills, chain info |
| `GET` | `/api/state` | Current agent state (monitoring/idle/rebalancing) |
| `GET` | `/api/history` | All evaluation history |
| `GET` | `/api/latest` | Latest three-brain evaluation |
| `GET` | `/api/brains/snapshot` | Three-brain snapshot (no OpenAI required) |
| `POST` | `/api/intent` | Natural language → structured UserIntent |
| `POST` | `/api/analyze` | Run three-brain analysis |
| `POST` | `/api/deploy` | Deploy strategy + mint V3 LP via TEE |
| `POST` | `/api/monitor/start` | Start 5-min monitoring loop |
| `POST` | `/api/monitor/stop` | Stop monitoring |
| `POST` | `/api/chat` | Structured chat response |
| `POST` | `/api/chat/stream` | SSE streaming chat with brain progress |
| `GET` | `/api/v3/positions` | Real V3 NFT positions owned by agent |
| `GET` | `/api/v3/pool/:address` | Real-time pool state (tick, liquidity, price) |
| `WS` | `/ws` | Real-time state + evaluation + alert push |

---

## 🖥️ Frontend Pages

| Page | Route | Features |
|------|-------|----------|
| **Landing** | `/` | Hero, three-brain features, interactive chat widget, comparison, FAQ |
| **Agent Dashboard** | `/app` | Intent input, pool selector, deploy controls, V3 positions with range visualization, three-brain panel, agent chat (SSE streaming), decision history |
| **Decision Log** | `/app/decisions` | Full on-chain decision history, action type breakdown, confidence stats, tx links |
| **Follow Leaderboard** | `/app/follow` | Strategy ranking with TOP badges, search/filter/sort, pagination, one-click follow with USDT deposit, "How Copy-Trading Works" guide |

---

## 🧪 Test Coverage

| Suite | Count | Coverage |
|-------|-------|----------|
| **Hardhat unit tests** | 68 passing | DecisionLogger (23) + StrategyManager (25) + FollowVault (20) |
| **Playwright E2E tests** | 17 passing | Landing (5) + Dashboard (5) + Decisions (3) + Follow (4) |
| **Total** | **85 tests** | Smart contracts + frontend UI |

```bash
npm test                              # 68 hardhat tests in ~1s
cd frontend && npm run test:e2e       # 17 Playwright tests
```

---

## 👥 Team Members

**Solo developer** — responsible for all aspects of the project:
- Solidity smart contract development (DecisionLogger, StrategyManager, FollowVault)
- TypeScript agent backend (Three-Brain architecture, V3PositionManager, OnchainOS integration)
- Next.js 14 frontend (Agent Dashboard, Decision Log, Follow Leaderboard)
- OnchainOS CLI integration (TEE-signed wallet contract-call, swap execute)
- Uniswap AI Skills porting (liquidity-planner, swap-planner)
- Uniswap V3 NonfungiblePositionManager discovery and integration on X Layer
- X Layer mainnet deployment and on-chain activity verification

### Agent Roles

YieldAgent runs a **single AgentCoordinator** process that manages multiple strategies. It is not multi-agent; instead, it uses a **three-brain ensemble** within one agent:

| Component | Role | Type |
|-----------|------|------|
| **AgentCoordinator** | Orchestrator — runs monitor loop, coordinates brains, executes trades | Core agent process |
| **MarketBrain** | Analyzes market conditions (price, volatility, trend) | Analysis module |
| **PoolBrain** | Analyzes pool state (liquidity, fees, optimal ranges) | Analysis module |
| **RiskBrain** | Assesses position health and rebalance urgency | Analysis module |
| **IntentParser** | Converts natural language to structured intent | NLP module |
| **V3PositionManager** | Manages real V3 LP positions (mint/collect/rebalance) | Execution module |
| **OnchainOSAdapter** | Interfaces with OnchainOS TEE for signed transactions | Signing module |

---

## 🌐 Positioning in X Layer Ecosystem

### Why X Layer is Essential for YieldAgent

1. **Gas-free monitoring loop**: The agent evaluates positions every 5 minutes and logs every decision on-chain — including HOLD decisions. This generates thousands of transactions per month. Only X Layer's ultra-low gas cost makes this economically viable, enabling a truly transparent AI audit trail.

2. **Native OnchainOS integration**: The Agentic Wallet TEE, ERC-4337 account abstraction, and OKX DEX aggregator are all natively available on X Layer. YieldAgent leverages `wallet contract-call` for V3 LP operations and `swap execute` for token rebalancing — capabilities that don't exist on other chains.

3. **Official Uniswap V3 deployment**: X Layer hosts a fully verified Uniswap V3 deployment (Factory, NPM, Router, Quoter, TickLens). YieldAgent is the first project to route V3 NonfungiblePositionManager calls through OnchainOS TEE on X Layer.

4. **On-chain AI audit trail**: Every AI decision — including the reasoning and confidence score — is permanently stored on X Layer via `DecisionLogger`. The low transaction cost means we never need to drop HOLD logs, preserving the complete audit invariant.

### YieldAgent's Role in X Layer DeFi

```
┌─────────────────────────────────────────────────────────────────┐
│                    X Layer DeFi Ecosystem                        │
│                                                                   │
│  Users ──→ YieldAgent ──→ Uniswap V3 LP Positions               │
│              │                                                    │
│              ├──→ OnchainOS TEE (signed execution)               │
│              ├──→ DecisionLogger (verifiable AI reasoning)        │
│              ├──→ FollowVault (copy-trading for followers)        │
│              └──→ OKX DEX Aggregator (swap optimization)         │
│                                                                   │
│  Value: Autonomous LP management, transparent AI decisions,       │
│         copy-trading access, on-chain verifiability               │
└─────────────────────────────────────────────────────────────────┘
```

YieldAgent brings **autonomous DeFi intelligence** to X Layer — users who lack the expertise or time to manage V3 concentrated liquidity can delegate to an AI agent that operates transparently, with every decision verifiable on-chain. The copy-trading system (FollowVault) further democratizes access, allowing anyone to benefit from the agent's strategies by simply depositing USDT.

---

## 📁 Repo Layout

```
yield-agent/
├── contracts/
│   ├── DecisionLogger.sol             # On-chain AI decision audit trail
│   ├── StrategyManager.sol            # Strategy registry + execution records
│   └── FollowVault.sol                # ERC20 copy-trading vaults + factory
├── test/                              # 68 hardhat unit tests
├── agent/
│   └── src/
│       ├── config/index.ts            # X Layer V3 addresses, chain config
│       ├── adapters/
│       │   ├── OnchainOSAdapter.ts    # CLI wrapper: wallet contract-call, swap, defi
│       │   └── UniswapSkillsAdapter.ts # liquidity-planner@0.2.0 + swap-planner@0.1.0
│       ├── engines/
│       │   ├── IntentParser.ts        # Natural language → structured intent
│       │   ├── MarketBrain.ts         # Market analysis (TWAP, volatility, trend)
│       │   ├── PoolBrain.ts           # Pool analysis (ranges, APR, IL)
│       │   ├── RiskBrain.ts           # Risk assessment (health, rebalance urgency)
│       │   └── ExecutionEngine.ts     # On-chain audit writes
│       ├── services/
│       │   ├── AgentCoordinator.ts    # Core orchestrator + 5-min monitor loop
│       │   └── V3PositionManager.ts   # Real V3 LP: mint/collect/rebalance via TEE
│       └── index.ts                   # Express + WebSocket + SSE server
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx               # Landing page
│       │   └── app/
│       │       ├── page.tsx           # Agent Dashboard
│       │       ├── decisions/page.tsx # Decision Log
│       │       └── follow/page.tsx    # Follow Leaderboard + Copy-Trading
│       ├── components/
│       │   ├── AgentChat.tsx          # SSE streaming chat
│       │   ├── V3Positions.tsx        # Real-time V3 NFT display
│       │   ├── ThreeBrainPanel.tsx    # Brain status (cascading: WS→API→RPC)
│       │   ├── DeployControls.tsx     # Strategy deployment UI
│       │   └── AlertBanner.tsx        # Price alerts
│       ├── lib/
│       │   ├── api.ts                 # Backend client + types
│       │   ├── hooks.ts              # Shared agent state context (WebSocket)
│       │   ├── brainRpc.ts           # Direct on-chain data fallback
│       │   └── onchainDecisions.ts   # Read DecisionLogger events
│       ├── config/contracts.ts        # Contract addresses per chain
│       └── e2e/                       # 17 Playwright tests
├── hardhat.config.ts
├── SUBMISSION.md                      # Hackathon submission evidence
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- OKB-funded wallet on X Layer
- OpenAI API key (for IntentParser + reasoning synthesis)
- **OnchainOS CLI**: `curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh`
- OnchainOS API keys from [web3.okx.com/onchainos/dev-portal](https://web3.okx.com/onchainos/dev-portal)

### Install

```bash
git clone https://github.com/dddd86971-cloud/yield-agent.git
cd yield-agent
npm install                          # Root (contracts + hardhat)
cd agent && npm install && cd ..     # Agent backend
cd frontend && npm install && cd ..  # Frontend
```

### Configure

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
# Edit .env: PRIVATE_KEY, OPENAI_API_KEY, OKX_ACCESS_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE
```

### Login to OnchainOS

```bash
onchainos wallet login --force
onchainos wallet status              # Should show loggedIn: true
```

### Deploy Contracts (Optional — already deployed on mainnet)

```bash
npm run compile && npm run deploy:xlayer
```

### Run

```bash
cd agent && npm start                # Backend: http://localhost:3001
cd frontend && npm run dev           # Frontend: http://localhost:3000
```

### Verify

```bash
curl http://localhost:3001/api/health | jq          # OnchainOS + Skills status
curl http://localhost:3001/api/v3/positions | jq    # Real V3 NFT positions
npm test                                            # 68 hardhat tests
cd frontend && npm run test:e2e                     # 17 Playwright tests
```

---

## 📄 License

MIT. Built for OKX Build X AI Hackathon — Season 2, X Layer Arena Track.
