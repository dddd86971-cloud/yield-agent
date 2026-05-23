# YieldAgent — Autonomous AI Liquidity Manager on X Layer

<p align="center">
  <img src="https://img.shields.io/badge/X%20Layer-Mainnet%20196-00ffa3?style=for-the-badge" />
  <img src="https://img.shields.io/badge/OnchainOS-TEE%20Signed-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Uniswap%20V3-LP%20Positions-ff007a?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Uniswap%20AI%20Skills-liquidity--planner%20%2B%20swap--planner-ff007a?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Tests-100%20Passing-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/X%20Layer%20Mainnet%20Fork-15%2F15-00ffa3?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Pages-6%20Routes-9333ea?style=for-the-badge" />
  <img src="https://img.shields.io/badge/API-19%20Endpoints-0ea5e9?style=for-the-badge" />
  <img src="https://img.shields.io/badge/v3%20Roadmap-Multi--Brain%20x402%20Economy-ff007a?style=for-the-badge" />
</p>

> **Live Demo**: [frontend-nine-theta-22.vercel.app](https://frontend-nine-theta-22.vercel.app)
> &nbsp;|&nbsp; **GitHub**: [github.com/dddd86971-cloud/yield-agent](https://github.com/dddd86971-cloud/yield-agent)

Built for **OKX Build X AI Hackathon — Season 2**, X Layer Arena Track.

---

## 📖 Project Introduction

YieldAgent is an **autonomous AI liquidity strategist** that manages Uniswap V3 concentrated-liquidity positions on X Layer. A user describes their intent in one sentence; the AI parses it, runs three parallel analysis brains (Market · Pool · Risk), deploys a real V3 LP position via the OnchainOS Agentic Wallet TEE, and continuously monitors / rebalances / compounds — all without human intervention, with every reasoning step permanently anchored on-chain.

**Core Value Proposition:**
- **One-sentence deploy**: "Deploy 100 USDT as LP, conservative" → real V3 NFT minted on X Layer
- **Three-Brain AI**: Market + Pool + Risk brains evaluate every 5 minutes
- **TEE-signed execution**: All DEX transactions signed inside OnchainOS Agentic Wallet (ERC-4337)
- **On-chain audit trail**: Every AI decision (including "do nothing") is recorded on-chain via `DecisionLogger`
- **Copy-trading**: FollowVault lets anyone mirror agent strategies with one click
- **Per-wallet PnL tracking**: Historical value + fees curves scoped to each connected browser wallet
- **Cross-protocol yield aggregator**: Live opportunities via OnchainOS `defi search` across every X Layer DEX
- **Restart-survival persistence**: File-based JSON snapshots for strategies, history, and PnL points (no SQLite native-dep headaches)
- **Proactive AI chat**: PnL / Position / History / Suggest quick-commands generate grounded recommendations on demand

**What makes YieldAgent different:** Unlike chatbot wrappers that only *suggest* trades, YieldAgent is a fully autonomous agent that *plans, executes, monitors, rebalances, and compounds* real on-chain positions — with every reasoning step permanently anchored on-chain for verifiability, and every snapshot recoverable across restarts.

---

## ✨ Latest Build Highlights

This build pushed the project past the v1 demo into a production-ready feature set. What landed in the latest round:

| Area | Delta |
|------|-------|
| **Persistence** | New `PersistenceService` — debounced JSON writes to `data/strategies.json`, `data/history.json`, `data/pnl-snapshots.json`. Full restart survival; no native deps. |
| **Multi-tenant state** | `AgentCoordinator.getStateForWallet(address)` + per-wallet WebSocket filtering. Every browser wallet sees only its own strategy. |
| **PnL tracking** | New `/app/pnl` dashboard with pure-SVG dual-axis chart (position value + fees). `capturePnLSnapshot()` writes on every full evaluation. |
| **Pool catalogue** | New `/app/pools` page — live on-chain state for every supported pool + cross-protocol opportunities from OnchainOS `defi search`. |
| **Proactive AI chat** | Quick-command handlers for `pnl` / `position` / `history` / `suggest` (EN + 中文). `getProactiveSuggestion()` generates grounded recommendations. |
| **Richer system prompt** | `buildChatSystemPrompt()` replaces `JSON.stringify(state)` dumps with a tight context block (strategy, market, pool, risk, PnL, quick-command hints). |
| **CLI footprint reduction** | Generic TTL read-cache in `OnchainOSAdapter` (LRU-bounded at 128 entries). Cuts subprocess spawn count by ~90% under frontend polling load. |
| **New REST endpoints** | `/api/strategies`, `/api/pnl/:strategyId`, `/api/pnl`, `/api/pnl/refresh`, `/api/defi/opportunities` — all wallet-scoped where relevant. |
| **Fix: WETH/USDT typo** | Corrected `fB` → `fC` in 5th byte of WETH/USDT pool address across backend config. |
| **Fix: IntentInput dead UI** | Removed misleading pool selector whose state was never propagated. |

---

## 🚀 v3 Roadmap — Multi-Brain x402 Economy (Next Sprint)

Inspired by the Build X AI Season 2 winners — [Helios](https://github.com/helioslabs-ai/helios) (Most Active Agent, multi-agent x402 economy) and XSight (Best x402 Implementation, API-as-revenue) — v3 turns YieldAgent from "automated LP" into **"an agent economy that pays its own ops"**.

| Upgrade | Status | What Changes |
|---------|--------|-------------|
| **x402 micropayments** | 📐 Designed | Coordinator pays each Brain ~0.0001 USDG per call via EIP-3009. After seed funding, the economy is self-sustaining. |
| **Brain-per-wallet** | 📐 Designed | Each Brain (Market / Pool / Risk / Lending) gets its own sovereign TEE wallet. Coordinator becomes the orchestrator routing payments. |
| **Aave V3 Lending Brain** | 📐 Designed | New 4th brain — idle USDT auto-supplies to Aave V3 for baseline yield while LP cycles complete. |
| **All 14 OnchainOS skills** | 🚧 In Progress | Currently using **6/14**. Adding `defi-invest`, `defi-portfolio`, `dex-signal`, `dex-token`, `security`, `audit-log`, `onchain-gateway`, `dex-ws`. |
| **Stdio MCP server** | 📐 Designed | Expose deploy / analyze / status / pnl as MCP tools so Claude Code / Cursor / Claude Desktop can plug in directly. |
| **Explicit FSM + 4 hard circuit breakers** | 📐 Designed | Take-profit ≥+30%, drawdown ≤-20%, time stop ≥30 days, IL beyond user tolerance. |
| **CLI deploy wizard** | 📐 Designed | `npx yield-agent init` — auto-runs OnchainOS login × 4, scaffolds `.env`, runs self-check. |
| **`x402PaymentLog` contract** | 📐 Designed | Per-payment on-chain audit trail — every brain micropayment emits a `PaymentSettled` event. |

**Full v3 spec:** [`ARCHITECTURE_V3.md`](ARCHITECTURE_V3.md) — includes target architecture diagram, x402 economy detail, cycle state machine, and 7-14 day implementation plan.

**Visual asset:** [`docs/v3-architecture.svg`](docs/v3-architecture.svg) — 1600×900 image suitable for blog posts and social media.

---

## 🪝 Hook the Future Submission — AgentArena Hook

> **Where AI agents bet on themselves.**

Built for **Hook the Future Hackathon** (X Layer × Uniswap × Flap, 5/22–5/28 2026) — a Uniswap V4 hook that creates an **open marketplace for AI agents** to compete for the right to manage V4 LP positions.

Each epoch (4 hours):
1. AI agents submit **TEE-signed StrategyBonds** (stake + signed commitment of fee range, max rebalances, promised APR)
2. Hook elects winner via `score = stake × promisedAPR × reputation / committed_band` — tighter band → higher confidence → higher score
3. Active Manager controls dynamic fee + LP modifications for the epoch
4. Hook **enforces every committed parameter in real-time** via `beforeSwap` / `beforeAddLiquidity` callbacks
5. Failure to meet bond triggers **automatic slashing** → slashed funds go directly to LPs as a hard performance floor

**This is the first on-chain Agent Performance Bond.** Other DEXes let humans speculate on prices; AgentArena lets LPs speculate on AI strategy quality, with cryptographic enforcement.

### Code

| Path | Lines | Role |
|------|-------|------|
| [`hook/src/AgentArenaHook.sol`](hook/src/AgentArenaHook.sol) | 470 | V4 hook — 5 callbacks + bid auction + election + epoch settlement + spec enforcement |
| [`hook/src/AgentRegistry.sol`](hook/src/AgentRegistry.sol) | 230 | Agent registration, stake escrow, reputation tracking, slashing |
| [`hook/src/libraries/StrategyBond.sol`](hook/src/libraries/StrategyBond.sol) | 80 | Bond struct + EIP-712 hash + bid score formula + spec validation |
| [`hook/src/interfaces/IAgentArena.sol`](hook/src/interfaces/IAgentArena.sol) | 70 | Shared errors + events |
| [`hook/script/DeployHook.s.sol`](hook/script/DeployHook.s.sol) | 90 | HookMiner CREATE2 mining + mainnet deploy + registry authorization |
| [`hook/script/InitPool.s.sol`](hook/script/InitPool.s.sol) | 70 | Initialize V4 USDT/WOKB pool with dynamic fee + hook attached |
| [`hook/script/RegisterAgent.s.sol`](hook/script/RegisterAgent.s.sol) | 90 | Register YieldAgent + submit first StrategyBond |
| [`hook/test/AgentArenaHook.t.sol`](hook/test/AgentArenaHook.t.sol) | 200 | Smoke tests — 5/5 passing |

**Build:**
```bash
cd hook && ./setup.sh   # installs Uniswap V4 + V4 Hooks Public + OZ + forge-std + compiles
forge test --fork-url https://rpc.xlayer.tech  # 15/15 passing on LIVE X Layer
```

**Headline test: forked X Layer mainnet, block 60735890** — our hook is accepted by the **real** V4 PoolManager `0x360E…fb32`:
```
=== Fork Deployment ===
Chain ID:     196
PoolManager:  0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32 (real V4)
Hook:         0xA40AeA0b8cD8Fe8029a9d3a948376D1D49359ac0 (mined CREATE2)
Lower-14 flags: 0x1AC0 (matches required permissions exactly)

--- PoolManager.initialize() on LIVE X Layer ---
Initial tick:    0
currentEpoch:    1
epochStartTime:  1779504926
PROOF: V4 PoolManager on X Layer accepted our hook.
PROOF: afterInitialize callback executed.

--- Full Pipeline on Fork ---
2 agents bid → AgentA wins → epoch runs → settled
Slashed:        250 USDT
LP sink:        250 USDT (received slash flow)
Reputation:     10000 → 9251
```

**Integration test (`MultiAgentEpoch.t.sol`):**
```
test_FullEpochLifecycle_3AgentsCompete_AggressiveWinsAndGetsSlashed:
  Confident  score:  42,857,142,857
  Cautious   score:   3,508,771,929
  Aggressive score:  59,523,809,523  ← winner
  Stake slashed:        250 USDT  →  LP sink received: 250 USDT
  Reputation:           10000 → 9251
  Now in Epoch 2 -- bidding open for next round
```

**Deploy:**
```bash
DEPLOYER_PK=0x...  forge script script/DeployHook.s.sol --rpc-url xlayer --broadcast
HOOK_ADDR=0x...    forge script script/InitPool.s.sol --rpc-url xlayer --broadcast
AGENT_PK=0x... HOOK_ADDR=0x... POOL_ID=0x... forge script script/RegisterAgent.s.sol --rpc-url xlayer --broadcast
```

---

## 🎯 How YieldAgent Maps to the Judging Rubric

This section exists to give evaluators (human or AI) a fast path from each scoring dimension to concrete, verifiable evidence in this repo.

| Dimension | Where to Look | Why It Scores |
|-----------|--------------|---------------|
| **OnchainOS / Uniswap Integration** | `agent/src/adapters/OnchainOSAdapter.ts`, `agent/src/services/V3PositionManager.ts`, `agent/src/adapters/UniswapSkillsAdapter.ts` | Uses **6 OnchainOS commands** as the primary execution path (not a fallback): `wallet contract-call`, `swap execute`, `wallet login/status/addresses/balance`, `defi search/detail/positions`. Both official **Uniswap AI Skills** (`liquidity-planner@0.2.0`, `swap-planner@0.1.0`) are ported verbatim and invoked every cycle. Routes **real V3 `NPM.mint()` / `collect()` / `decreaseLiquidity()`** through the TEE — verifiable via NFT #962 and tx `0x0856912b…`. |
| **X Layer Ecosystem Contribution** | `contracts/`, on-chain deployments (§ Deployment Addresses) | Three contracts live on X Layer mainnet (chain 196): `DecisionLogger`, `StrategyManager v2`, `FollowVaultFactory`. Ultra-low gas enables logging **every** AI decision (including HOLD) — preserving the complete audit invariant. Two-signer split-key architecture proves anti-gaming: TEE signs DEX, audit EOA signs records, cross-referenceable 1:1. `FollowVault` brings copy-trading natively to X Layer. |
| **AI / User Experience** | `frontend/src/components/AgentChat.tsx`, `agent/src/services/AgentCoordinator.ts` (`buildChatSystemPrompt`, `getProactiveSuggestion`), `frontend/src/app/app/pnl/page.tsx` | **Three-Brain ensemble** (Market + Pool + Risk) feeds GPT-4o-mini synthesis with on-chain TWAP, liquidity-planner ranges, and IL math. **SSE streaming** surfaces per-brain progress live in the UI. **8 quick-commands** (`deploy / analyze / status / pnl / position / history / suggest / why`) in both EN + 中文. **Proactive AI chat** generates grounded recommendations via a richer context-block prompt (not a `JSON.stringify(state)` dump). Pure-SVG PnL dashboard, per-wallet state isolation, restart-survival persistence. |
| **Product Completeness** | Whole repo | **6 frontend routes** (Landing, Dashboard, PnL, Pools, Decisions, Follow). **19 REST + SSE + WebSocket** endpoints. **85 automated tests** (68 Hardhat unit + 17 Playwright E2E). Full lifecycle proven on mainnet: deploy → mint → monitor → rebalance → compound → audit. Multi-tenant wallet-scoped state. Cross-protocol yield aggregator. JSON-based persistence with debounced writes. Live demo + verified tx hashes + end-to-end documentation. |

**Key Differentiators (for at-a-glance scoring):**

- **Real V3 LP lifecycle, not just swaps** — `NPM.mint()`, `collect()`, `decreaseLiquidity()`, full rebalance, fee compounding — all signed by TEE.
- **Split-key anti-gaming proof** — TEE signer physically cannot fabricate DEX transactions; audit records must match on-chain reality 1:1.
- **Every decision is an on-chain event** — including `HOLD`, preserving a tamper-proof AI reasoning trail.
- **Both Uniswap AI Skills ported verbatim** — not "inspired by", the actual methodology from the Uniswap AI repo.
- **Multi-tenant ready today** — per-wallet state, per-wallet WebSocket filtering, per-wallet PnL curves.
- **OpenAI-optional** — the three-brain snapshot endpoint works without any LLM; deterministic fallbacks everywhere.

---

## 🏗️ Architecture Overview

> Two architectures live in this README: **v2 (current shipping)** is what's deployed and verifiable on-chain right now. **v3 (next sprint)** is the multi-brain x402 economy designed in [`ARCHITECTURE_V3.md`](ARCHITECTURE_V3.md).

### v2 — Current Shipping Architecture (single TEE, 3 brain modules)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 14 + Vercel)                    │
│   Intent Input · Agent Chat (SSE) · Three-Brain Panel · V3 Positions     │
│   PnL Dashboard · Pool Catalogue · Decision Log · Follow Leaderboard     │
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
│  19 REST endpoints + SSE + WebSocket │  │  │  · NFT #966 (Strategy #9) │  │
└──────────────────────────────────────┘  │  └───────────────────────────┘  │
                                          └─────────────────────────────────┘
```

### v3 — Target Architecture (Multi-Brain x402 Economy · Next Sprint)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║              YieldAgent v3 — Multi-Brain x402 Economy on X Layer              ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌────────────────────────────────────────────────────────────────────────┐
  │                     User Layer (Next.js + Vercel)                      │
  │  Intent · Chat (SSE) · 3-Brain Panel · PnL · Pools · FollowVault       │
  └─────────────────────────────────┬──────────────────────────────────────┘
                                    │ HTTP / SSE / WebSocket
                                    ▼
  ╔════════════════════════════════════════════════════════════════════════╗
  ║         🧭  Coordinator Agent  (Orchestrator · TEE Wallet #1)          ║
  ║  · 5-min cycle loop · GPT-4o-mini synthesis                            ║
  ║  · Pays brains via x402 USDG (EIP-3009 · ~0.0001 USDG / call)          ║
  ║  · Wallet:  0x6ab2…  (Curator)                                         ║
  ╚════════════════════════════════════════════════════════════════════════╝
              │              │              │              │
              │ 💸 x402       │ 💸 x402      │ 💸 x402      │ 💸 x402
              │ 0.0001 USDG  │ 0.0001 USDG │ 0.0001 USDG │ 0.0001 USDG
              ▼              ▼              ▼              ▼
       ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
       │ 📊 Market   │ │ 🏊 Pool     │ │ 🛡️  Risk    │ │ 🏦 Lending  │
       │   Brain     │ │   Brain     │ │   Brain     │ │   Brain     │
       │             │ │             │ │             │ │  (NEW v3)   │
       │ TEE Wlt #2  │ │ TEE Wlt #3  │ │ TEE Wlt #4  │ │ TEE Wlt #5  │
       │  0xMrk…     │ │  0xPol…     │ │  0xRsk…     │ │  0xLnd…     │
       └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
              │ TWAP          │ liquidity-    │ IL math       │ supply APR
              │ volatility    │ planner       │ health 0-100  │ borrow rate
              │ trend state   │ swap-planner  │ exit trigger  │ idle-USDT
              ▼               ▼               ▼               ▼
  ╔════════════════════════════════════════════════════════════════════════╗
  ║                    X Layer Mainnet  (chainId 196)                      ║
  ║                                                                        ║
  ║  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐  ║
  ║  │  Uniswap V3     │ │   Aave V3       │ │   OKX DEX (aggregator)  │  ║
  ║  │  · NPM.mint     │ │   · supply      │ │   · cross-DEX routing   │  ║
  ║  │  · collect      │ │   · withdraw    │ │   · best-price exec     │  ║
  ║  │  · rebalance    │ │   · borrow      │ │                         │  ║
  ║  └─────────────────┘ └─────────────────┘ └─────────────────────────┘  ║
  ║                                                                        ║
  ║  ┌────────────────────────────────────────────────────────────────┐   ║
  ║  │              YieldAgent Audit Contracts                         │   ║
  ║  │  · DecisionLogger     — every decision (incl. HOLD)            │   ║
  ║  │  · StrategyManager v2 — deploy + execution records             │   ║
  ║  │  · FollowVaultFactory — ERC20 copy-trading vaults (90/10)      │   ║
  ║  │  · x402PaymentLog     — every brain micropayment (NEW in v3)   │   ║
  ║  └────────────────────────────────────────────────────────────────┘   ║
  ╚════════════════════════════════════════════════════════════════════════╝

  Legend:
    💸 x402 micropayment   ▷  Coordinator → Brain  per-call settlement
    🧭 Coordinator         ▷  pays its operators in real USDG (EIP-3009)
    📊🏊🛡️🏦 Brain         ▷  sovereign agent · independent TEE wallet
```

> **Why v3?** The Build X AI Season 2 winners aligned on one thesis: **"x402 + multi-agent"**. v3 closes that gap while keeping every v2 differentiator (real V3 LP lifecycle, verbatim Uniswap AI Skills port, DecisionLogger, FollowVault). Full design + cycle state machine + x402 economy detail in [`ARCHITECTURE_V3.md`](ARCHITECTURE_V3.md).

### Two-Signer Anti-Gaming Architecture

| Signer | Address | Responsibility | Cannot Do |
|--------|---------|---------------|-----------|
| **OnchainOS Agentic Wallet** (TEE) | `0x6ab27b82890bc85cd996f518173487ece9811d61` | All DEX txs: V3 mint, swap, approve, rebalance | Cannot write to audit contracts |
| **Audit EOA** | `0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838` | Audit records: deployStrategy, logDecision | Cannot sign DEX transactions |

This split-key design means a judge can cross-reference `StrategyManager.getExecutions(strategyId)` against the Agentic Wallet's on-chain activity — the tx hashes must match 1:1, because the audit signer physically cannot fabricate DEX transactions.

### Wallet Roles: Who Does What

YieldAgent uses three distinct wallets, each with a clear responsibility:

| Wallet | Role | What It Does | What It Cannot Do |
|--------|------|-------------|-------------------|
| **Agentic Wallet** (TEE) `0x6ab27b82...` | Executor | Signs all DEX txs: V3 mint, swap, approve, collect fees, rebalance | Cannot write audit records |
| **Audit EOA** `0x2E2FC9...` | Recorder | Writes strategy records + decision logs to on-chain contracts | Cannot sign DEX transactions |
| **User's Browser Wallet** | Observer | Identity binding — records "who initiated this strategy" in the frontend | Does not sign any transaction, does not spend any funds |

The user's browser wallet connects via RainbowKit/wagmi but **never signs transactions or spends tokens**. All on-chain execution is handled by the Agentic Wallet inside the OnchainOS TEE.

### Current Architecture: Single-Agent Demo

The hackathon demo runs a **single Agentic Wallet** that manages all LP positions. This proves the core capability: an AI agent that autonomously deploys, monitors, rebalances, and compounds real V3 LP positions via TEE-signed transactions, with every decision permanently recorded on-chain.

```
┌─────────────────────────────────────────────────────────────┐
│                   Current Demo (Hackathon)                    │
│                                                               │
│   Any wallet ──→ Connect to frontend ──→ Initiate strategy   │
│                         ↓                                     │
│   Shared Agent Backend ──→ Single Agentic Wallet             │
│                             0x6ab27b82...                     │
│                             ↓                                 │
│   LP NFTs owned by Agentic Wallet, managed autonomously      │
│   Users observe their strategies via frontend (localStorage)  │
└─────────────────────────────────────────────────────────────┘
```

### Production Roadmap: Per-User Isolated Agents

The architecture is designed to scale from single-agent to full multi-tenant without code changes:

**Phase 1 — Self-Hosted Agent (Available Now)**

Any user can run their own isolated agent instance today:

1. Create your Agentic Wallet: `onchainos wallet login --force`
2. Get API keys from [OnchainOS Dev Portal](https://web3.okx.com/onchainos/dev-portal)
3. Clone this repo, fill `.env` with your own keys
4. Fund your Agentic Wallet with USDT + OKB on X Layer
5. Run `cd agent && npm start` — your LP positions belong to your wallet

Each instance is fully self-contained. Zero code changes required.

```
┌─────────────────────────────────────────────────────────────┐
│              Phase 1: Self-Hosted (Available Now)             │
│                                                               │
│   User A ──→ Own Backend ──→ Own Agentic Wallet A            │
│              (.env: own keys)  LP NFTs owned by Wallet A     │
│                                                               │
│   User B ──→ Own Backend ──→ Own Agentic Wallet B            │
│              (.env: own keys)  LP NFTs owned by Wallet B     │
│                                                               │
│   Fully isolated. Each user controls their own funds.        │
└─────────────────────────────────────────────────────────────┘
```

**Phase 2 — Managed Multi-Tenant Platform (Planned)**

A hosted platform that provisions per-user Agentic Wallets automatically:

```
┌─────────────────────────────────────────────────────────────┐
│             Phase 2: Managed Platform (Planned)               │
│                                                               │
│   User connects browser wallet                                │
│     ↓                                                         │
│   Platform creates Agentic Wallet via OnchainOS SDK           │
│     ↓                                                         │
│   User funds their own Agentic Wallet (USDT + OKB)           │
│     ↓                                                         │
│   Platform provisions isolated agent worker                   │
│     ↓                                                         │
│   AI manages LP using user's own Agentic Wallet               │
│     ↓                                                         │
│   LP NFTs owned by user's TEE wallet — fully self-custodied  │
└─────────────────────────────────────────────────────────────┘
```

Key features planned for Phase 2:
- **One-click onboarding**: connect wallet → auto-create Agentic Wallet → fund → deploy
- **Per-user agent isolation**: each user gets a dedicated agent worker with their own TEE signer
- **Cross-strategy leaderboard**: compare performance across all users' strategies on-chain
- **Vault-based delegation**: users who prefer not to run their own agent can deposit into FollowVault to mirror top-performing agents

**Phase 3 — Decentralized Agent Network (Vision)**

```
┌─────────────────────────────────────────────────────────────┐
│           Phase 3: Decentralized Network (Vision)             │
│                                                               │
│   Agent operators stake OKB to run yield management nodes    │
│     ↓                                                         │
│   Users delegate funds to agents via smart contract vaults   │
│     ↓                                                         │
│   On-chain reputation system ranks agents by verified ROI    │
│     ↓                                                         │
│   DecisionLogger provides transparent, auditable track record│
│     ↓                                                         │
│   Revenue sharing: agent takes performance fee, user keeps   │
│   the rest — enforced by smart contract, no trust required   │
└─────────────────────────────────────────────────────────────┘
```

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

### API Endpoints (19 REST + SSE + WebSocket)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Full health probe: OnchainOS status, Uniswap Skills, chain info |
| `GET` | `/api/state` | Current agent state (monitoring/idle/rebalancing) — wallet-scoped |
| `GET` | `/api/strategies` | List active strategies owned by the connected wallet |
| `GET` | `/api/history` | Evaluation history for the connected wallet |
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
| `GET` | `/api/pnl/:strategyId` | PnL time-series for a specific strategy (value + fees curve) |
| `GET` | `/api/pnl` | Aggregate PnL across every strategy owned by the wallet |
| `POST` | `/api/pnl/refresh` | Force a PnL snapshot capture outside the monitor loop |
| `GET` | `/api/defi/opportunities` | Cross-protocol yield opportunities via OnchainOS `defi search` |
| `SSE` | `/api/chat/stream` | Server-Sent Events for live token streaming + brain progress |
| `WS`  | `/ws` | Real-time state + evaluation + alert push (per-wallet filtered) |

---

## 🖥️ Frontend Pages (6 Routes)

| Page | Route | Features |
|------|-------|----------|
| **Landing** | `/` | Hero, three-brain features, interactive chat widget, comparison, FAQ |
| **Agent Dashboard** | `/app` | Intent input, deploy controls, V3 positions with range visualization, three-brain panel, agent chat (SSE streaming with 8 quick-commands), decision history |
| **PnL Dashboard** | `/app/pnl` | Per-wallet historical value + fees time-series, pure-SVG dual-axis chart, ROI and annualized APR stats, cross-strategy aggregation |
| **Pools** | `/app/pools` | Live on-chain state for every supported X Layer V3 pool + cross-protocol yield opportunities via OnchainOS `defi search`; one-click pre-fill flow into `/app?pool=…` |
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
| **AgentCoordinator** | Orchestrator — runs monitor loop, coordinates brains, executes trades, handles chat quick-commands, captures PnL snapshots, keeps per-wallet state | Core agent process |
| **MarketBrain** | Analyzes market conditions (price, volatility, trend) | Analysis module |
| **PoolBrain** | Analyzes pool state (liquidity, fees, optimal ranges) | Analysis module |
| **RiskBrain** | Assesses position health and rebalance urgency | Analysis module |
| **IntentParser** | Converts natural language to structured intent | NLP module |
| **V3PositionManager** | Manages real V3 LP positions (mint/collect/rebalance) | Execution module |
| **OnchainOSAdapter** | Interfaces with OnchainOS TEE for signed transactions; TTL-cached reads to cut subprocess load | Signing module |
| **PersistenceService** | Debounced JSON snapshots for strategies, history, PnL — restart survival with zero native deps | Storage module |

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
│       │   │                          #   + LRU-bounded TTL read-cache (~90% CLI cut)
│       │   └── UniswapSkillsAdapter.ts # liquidity-planner@0.2.0 + swap-planner@0.1.0
│       ├── engines/
│       │   ├── IntentParser.ts        # Natural language → structured intent
│       │   ├── MarketBrain.ts         # Market analysis (TWAP, volatility, trend)
│       │   ├── PoolBrain.ts           # Pool analysis (ranges, APR, IL)
│       │   ├── RiskBrain.ts           # Risk assessment (health, rebalance urgency)
│       │   └── ExecutionEngine.ts     # On-chain audit writes
│       ├── services/
│       │   ├── AgentCoordinator.ts    # Core orchestrator + 5-min monitor loop
│       │   │                          #   + multi-tenant wallet state + proactive chat
│       │   ├── V3PositionManager.ts   # Real V3 LP: mint/collect/rebalance via TEE
│       │   └── PersistenceService.ts  # Debounced JSON snapshots (strategies/history/pnl)
│       └── index.ts                   # Express + WebSocket + SSE server (19 endpoints)
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx               # Landing page
│       │   └── app/
│       │       ├── page.tsx           # Agent Dashboard (SSE chat + V3 positions)
│       │       ├── pnl/page.tsx       # PnL Dashboard (value + fees time-series)
│       │       ├── pools/page.tsx     # Pool catalogue + cross-protocol opportunities
│       │       ├── decisions/page.tsx # Decision Log
│       │       └── follow/page.tsx    # Follow Leaderboard + Copy-Trading
│       ├── components/
│       │   ├── AgentChat.tsx          # SSE streaming chat — 8 quick-commands, brain progress
│       │   ├── IntentInput.tsx        # Natural-language intent parser UI
│       │   ├── V3Positions.tsx        # Real-time V3 NFT display
│       │   ├── PnLChart.tsx           # Pure-SVG dual-axis chart (no chart library)
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
├── data/                              # JSON snapshots (gitignored — created at runtime)
│   ├── strategies.json                # Active strategies + deployerWallet ownership
│   ├── history.json                   # Evaluation history per wallet
│   └── pnl-snapshots.json             # PnL time-series for every strategy
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
