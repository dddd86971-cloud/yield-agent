# YieldAgent — Demo Walkthrough

This is the script to use when recording the hackathon demo video. Total runtime target: **3 minutes**.

---

## Setup (off-camera)

1. `cp .env.example .env` — fill `PRIVATE_KEY` (deployer wallet, ~0.5 OKB) and `OPENAI_API_KEY`
2. `cp frontend/.env.example frontend/.env.local`
3. `npm install` in repo root, `agent/`, and `frontend/`
4. `npm run compile && npm run deploy:xlayer`
5. Paste the printed contract addresses into `.env` (`STRATEGY_MANAGER_ADDRESS`, `DECISION_LOGGER_ADDRESS`, `FOLLOW_VAULT_FACTORY_ADDRESS`) and into `frontend/.env.local` (`NEXT_PUBLIC_*`)
6. Terminal A: `cd agent && npm start`
7. Terminal B: `cd frontend && npm run dev`
8. Open `http://localhost:3000`

---

## On-camera script

### 0:00 — 0:20 · Opening hook

> "DeFi LP positions need constant attention — rebalancing, compounding, exiting before bleed. **YieldAgent** is an AI agent that does all of that for you on **X Layer**, and writes every decision it makes to chain so you can verify the alpha."

(Show landing page hero, point at the live status bar)

### 0:20 — 0:45 · Natural language intent

> "I tell the agent what I want in plain English."

Type into the IntentInput:
```
Conservative OKB/USDC LP with $5000, target 15% APR
```

Click send.

> "GPT-4o-mini parses the request into a structured `UserIntent` — principal, risk profile, target APR, max IL tolerance. The intent is what I'd write on a napkin; the agent figures out the rest."

(Show parsed intent card with principal $5000, risk conservative, target 5-12%)

### 0:45 — 1:30 · The three brains

Scroll down to ThreeBrainPanel.

> "Now the magic. The agent runs three separate analyses in parallel — all from on-chain data."

**Market Brain** (point at first card):
> "Reads the pool's TWAP oracle, classifies the market state, computes realised volatility. Right now: ranging, 1.4 % vol."

**Pool Brain** (point at second card):
> "Walks the V3 tick array, finds the liquidity center of mass, builds three recommended ranges — wide, narrow, ultra-narrow. Conservative profile gets 60 % allocation in wide, 30 in narrow, 10 in ultra. Computes fee APR from volume × fee tier."

**Risk Brain** (point at third card):
> "Pure-math IL engine — concentrated liquidity formula, no oracles needed. Tracks position health, edge proximity, in-range status."

### 1:30 — 2:00 · LP visualization + Deploy

Scroll to LPRangeChart.

> "The position bar shows where we are in the range. Pulse means 'in range, earning fees'."

(Click Deploy if not already deployed)

> "On click, the agent calls `StrategyManager.deployStrategy` — mints three Uniswap V3 positions in a single transaction. **And here's the key part…**"

### 2:00 — 2:30 · The Decision Log (the killer feature)

Scroll to DecisionLog.

> "Every decision the agent makes — including the decision to do nothing — is recorded in `DecisionLogger.sol`. This is the on-chain reasoning history. Look — DEPLOY at 12:01 with confidence 95, full reasoning string, and a tx hash you can click and verify on OKLink."

(Click the tx hash, show OKLink page in a tab)

> "Five minutes from now, the agent will check again. If price drifts too close to a range edge, it'll rebalance — and that decision will also land here. If volatility spikes, you'll see an emergency exit. **You can audit the AI's history forever.**"

### 2:30 — 2:55 · Copy-trading

Click "Follow" in the header.

> "Successful agents become followable. Each strategy can spin up a `FollowVault` — an ERC20 vault. Followers deposit USDC, the vault mirrors the agent's positions, and the agent earns 10 % of follower profit on withdrawal. It's a permissionless leaderboard of AI alpha on X Layer."

(Show leaderboard with three demo agents)

### 2:55 — 3:00 · Closing

> "Three brains. Verifiable on-chain reasoning. Copy-trading vaults. **YieldAgent.** Built for X Layer Build X Season 2."

---

## Backup / fallback flows

**If the chain RPC is slow:** the WebSocket already pushes cached state on connect, so the dashboard renders even without a fresh evaluation. Mention "live state via WebSocket" while the analyzer warms up.

**If GPT-4o-mini rate-limits:** the IntentParser has a deterministic regex fallback (`agent/src/engines/IntentParser.ts:fallbackParse`). The reasoning composer also has a fallback string. Demo will degrade gracefully.

**If a tx fails on-chain:** The agent surfaces the error in the chat panel; you can show that the system caught the failure rather than blowing up. Mention `try/catch` around `executor.deployStrategy(...)` in `AgentCoordinator.runFullEvaluation`.

---

## Key talking points to hit (in case you forget)

1. **Onchain OS skill in the core path** — without the agent, no LP positions get minted. The "AI" is not a chatbot wrapper.
2. **X Layer is required** — the 5-minute monitoring loop × multi-position rebalancing × copy-trading would be unaffordable on Ethereum L1.
3. **Verifiable AI** — `DecisionLogger.logDecision(...)` is called for every action including HOLD. Anyone can scan the contract and replay the agent's history.
4. **Three brains** — not one prompt, three deterministic analyses (market, pool, risk) + one composer.
5. **End-to-end working** — Solidity contracts on X Layer mainnet, Node agent loop, Next.js dashboard with live WebSocket — `npm install` and run.
