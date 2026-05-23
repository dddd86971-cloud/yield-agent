# YieldAgent v3 Architecture — Multi-Brain x402 Economy

**Status:** Designed · target sprint = post-Build X AI Season 2 (~7-14 days)
**Inspiration:** Build X AI Season 2 winners — [@0xheliosfi](https://x.com/0xheliosfi) (multi-agent x402 economy) and [@Krava491](https://x.com/Krava491)'s XSight (API-as-revenue model)
**Position vs. v2:** v2 ships a single Agentic Wallet that runs three Brain *modules* in one process. v3 promotes each Brain into a **sovereign agent** with its own TEE wallet, and routes every brain call through a real **x402 micropayment** so the agent economy is auditable and self-sustaining.

> v2 (current shipping) = three brains in one process, one TEE wallet.
> v3 (next sprint) = four sovereign brains, each with its own TEE wallet, paid by a Coordinator via x402.

---

## 🎯 Why v3

The Build X AI Season 2 winners aligned on one thesis the judges clearly cared about: **"x402 + multi-agent"**.

- **Helios (Most Active Agent)** — 4 sovereign agents, 4 independent TEE wallets, x402 USDG micropayments between them, all 14 OnchainOS skills.
- **XSight (Best x402 Implementation)** — agent monetizes itself per API call via x402; the agent is its own revenue source.

YieldAgent v2 underbuilt this layer. v3 closes the gap while preserving every v2 differentiator (real V3 LP lifecycle, official Uniswap AI Skills ported verbatim, on-chain DecisionLogger, FollowVault copy-trading).

---

## 🏗️ v3 Target Architecture (Figure A)

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

---

## 💸 The x402 Economy in Detail (Figure B)

```
╔════════════════════════════════════════════════════════════╗
║          The x402 Micropayment Economy (per cycle)          ║
╚════════════════════════════════════════════════════════════╝

                ┌───────────────────────┐
                │  🧭  Coordinator      │  ← user funds (USDG)
                │      TEE Wallet #1    │
                └───────────┬───────────┘
                            │
            ┌───────────────┼───────────────┬───────────────┐
            │               │               │               │
       0.0001 USDG    0.0001 USDG    0.0001 USDG    0.0001 USDG
       (per scan)    (per analyze)   (per check)    (per query)
            │               │               │               │
            ▼               ▼               ▼               ▼
       ┌────────┐      ┌────────┐      ┌────────┐      ┌────────┐
       │  📊    │      │  🏊    │      │  🛡️   │      │  🏦    │
       │ Market │      │  Pool  │      │  Risk  │      │ Lending│
       │  #2    │      │   #3   │      │   #4   │      │   #5   │
       └────────┘      └────────┘      └────────┘      └────────┘

       Each call → EIP-3009 USDG transfer → on-chain proof
       Every payment → x402PaymentLog event → audit trail
       After seed funding → economy is self-sustaining

       1 cycle  ≈  4 micropayments  ≈  0.0004 USDG  (~$0.0004 cost)
       1 day    ≈  288 cycles       ≈  ~$0.12 / day operating cost
       Funded by → FollowVault performance fees (10% of LP profit)
```

### Why x402 (vs. shared treasury)

1. **Audit trail = economy itself.** Every brain call leaves an EIP-3009 USDG transfer on-chain. No need for a separate "what did the agent do" log; the payment log *is* the activity log.
2. **Anti-gaming.** A brain can't fake having been called — the Coordinator's wallet has to actually pay it, and that payment is verifiable on-chain.
3. **Self-sustaining.** Once seeded, FollowVault performance fees fund the operating budget. The agent literally pays for its own existence.
4. **Composable.** Other agents (third-party) can pay this Coordinator (or this Coordinator's brains) for services, opening a future agent-economy primitive.

### Settlement Mechanics

- **Standard:** EIP-3009 (`transferWithAuthorization`) on USDG, signed by Coordinator's TEE inside OKX OnchainOS.
- **Trigger:** Coordinator generates an x402 challenge for each brain call; brain only executes after payment proof is verified.
- **Receipt:** Coordinator emits `x402PaymentLog.PaymentSettled(payer, payee, amount, callType, txHash)` for off-chain indexing.
- **Failure mode:** If payment fails → brain refuses to run → Coordinator falls back to deterministic local heuristic for that cycle. No silent skip.

---

## 🔄 v3 Cycle State Machine (Figure C)

```
                            ┌──────────────┐
                            │     IDLE     │ ◄───────────────┐
                            └──────┬───────┘                  │
                                   │ 5-min tick                │
                                   ▼                           │
                  💸 x402 → 4 brains in parallel              │
                  ┌─────────────────────────────────┐          │
                  │           ANALYZE                │          │
                  │  Market · Pool · Risk · Lending  │          │
                  └─────────────────┬────────────────┘          │
                                    │                           │
                                    ▼                           │
                          ┌──────────────────┐                  │
                          │     DECIDE       │                  │
                          │  GPT-4o-mini     │                  │
                          │  synthesis       │                  │
                          └────────┬─────────┘                  │
                                   │                            │
        ┌──────────┬───────────────┼──────────────┬────────────┤
        ▼          ▼               ▼              ▼            ▼
    ┌──────┐  ┌──────────┐  ┌────────────┐  ┌────────┐  ┌──────────┐
    │ HOLD │  │ DEPLOY   │  │ REBALANCE  │  │COMPOUND│  │EMERGENCY │
    │      │  │ NPM.mint │  │ remove +   │  │ collect│  │  EXIT    │
    │      │  │ via TEE  │  │ re-mint    │  │ + re-  │  │ full     │
    │      │  │          │  │            │  │ stake  │  │ unwind   │
    └───┬──┘  └────┬─────┘  └─────┬──────┘  └───┬────┘  └────┬─────┘
        │          │              │             │             │
        └──────────┴──────────────┼─────────────┴─────────────┘
                                  ▼
                       ┌─────────────────────┐
                       │  AUDIT (always)     │
                       │  DecisionLogger     │ ───────────────►─┘
                       │  + StrategyManager  │   back to IDLE
                       └─────────────────────┘

   Hard Circuit Breakers (any → EMERGENCY_EXIT):
     ⚠️  Take-profit   ≥ +30%
     ⚠️  Drawdown       ≥ -20%
     ⚠️  Time stop      ≥ 30 days
     ⚠️  IL beyond user-set tolerance
```

---

## 🧠 The Four Brains

| Brain | Role | Data Source | Key OnchainOS Skills |
|-------|------|-------------|----------------------|
| 📊 **Market** | Macro context — price, volatility, trend | On-chain TWAP, 2016-snapshot price buffer | `dex-market`, `dex-signal`, `dex-token` |
| 🏊 **Pool** | LP-specific intelligence — ranges, fees, IL | Pool slot0 + liquidity-planner@0.2.0 + swap-planner@0.1.0 | `defi-portfolio`, `dex-token`, `dex-ws` |
| 🛡️ **Risk** | Position health + exit triggers | Concentrated-liquidity IL math, edge detection | `security`, `audit-log` |
| 🏦 **Lending** | Idle-capital yield — Aave V3 supply / borrow rates | Aave V3 reserves, OnchainOS `defi-invest` | `defi-invest`, `onchain-gateway` |

After v3, all **14 OnchainOS skills** are exercised across the four brains. The Coordinator additionally uses `agentic-wallet`, `wallet-portfolio`, and `audit-log`. The Executor sub-component (called by any brain that needs to broadcast) uses `dex-swap`, `onchain-gateway`, and `x402-payment`.

---

## 📦 Implementation Plan (7-14 days)

### Day 1-2 — x402 + Coordinator Wallet Split
- [ ] Add `OnchainOSAdapter.x402Pay({ to, amount, memo })` wrapping `onchainos x402-payment`.
- [ ] Add `x402PaymentLog.sol` minimal contract — `event PaymentSettled(payer, payee, amount, callType, txHash)`.
- [ ] Provision 4 new TEE wallets via `onchainos wallet login --account market` etc.
- [ ] Deploy `x402PaymentLog` to X Layer mainnet.

### Day 3-4 — Brain-as-Service Refactor
- [ ] Each Brain becomes a HTTP service exposing `POST /analyze` that requires x402 challenge.
- [ ] `AgentCoordinator.runCycle()` issues x402 payments before each brain call.
- [ ] Wire fallback: if payment fails, fall back to deterministic heuristic + log degraded mode.

### Day 5 — Lending Brain (Aave V3)
- [ ] `LendingBrain.ts` — wraps `onchainos defi-invest` for Aave V3 supply.
- [ ] When Coordinator detects idle USDT > threshold, call `LendingBrain.parkIdleCapital()`.
- [ ] When LP cycle needs capital, call `LendingBrain.unparkCapital(amount)`.

### Day 6 — All 14 Skills Wired
- [ ] Add `defi-portfolio`, `dex-signal`, `dex-token`, `dex-trenches`, `dex-ws`, `security`, `audit-log`, `onchain-gateway` to `OnchainOSAdapter`.
- [ ] Surface them via the existing brains or as standalone helpers.

### Day 7 — MCP Server + CLI Wizard
- [ ] `agent/src/mcp/server.ts` — Stdio MCP exposing `deploy / analyze / status / pnl / position / suggest` as MCP tools.
- [ ] `npx yield-agent init` — interactive setup that runs `onchainos wallet login` × 4, scaffolds `.env`, runs self-check.

### Day 8-10 — Stress Test + Docs
- [ ] Run 200+ live cycles on mainnet, confirm x402 payment trail is unbroken.
- [ ] Update README, ARCHITECTURE_V3.md, SUBMISSION.md with the new metrics.
- [ ] Re-record demo video showing the four-wallet x402 flow on OKLink.

---

## 🔄 Migration from v2 → v3

**Backward compatibility:** v3 is additive. v2's single-Coordinator path remains operational. The Coordinator gains an `EXECUTION_MODE = "v2_local" | "v3_x402"` env switch:

- `v2_local` — legacy: brains are local modules, no x402 cost.
- `v3_x402` — new: brains are remote services, paid per call.

This lets us flip mainnet behavior with one env var, and lets developers running self-hosted instances avoid x402 cost during development.

**Frontend changes:** None required initially — the brain panel and chat already render whatever the Coordinator returns. v3.1 will add an `x402 Receipts` tab that shows the per-cycle micropayment trail with OKLink links.

---

## 🆚 v3 vs. Helios — How We Differentiate

| Dimension | v3 YieldAgent | Helios |
|-----------|---------------|--------|
| Multi-agent | 4 brains + 1 coordinator (5 wallets) | 4 sovereign agents (4 wallets) |
| x402 economy | Coordinator → brains, per-call settlement | Curator → 3 service agents, per-call settlement |
| OnchainOS skill coverage | Target 14/14 | 14/14 |
| Real V3 LP lifecycle | ✅ NPM.mint / collect / decreaseLiquidity via TEE | swap + Aave only (no NPM direct) |
| Uniswap AI Skills (verbatim) | ✅ liquidity-planner@0.2.0 + swap-planner@0.1.0 | Trading API only |
| Copy-trading | ✅ FollowVault ERC20 vaults, 90/10 split | none |
| On-chain reasoning audit | ✅ DecisionLogger logs every decision incl. HOLD | HeliosRegistry logs cycles |
| Multi-protocol | Uniswap V3 + Aave V3 + OKX DEX | Uniswap + Aave + OKX DEX |
| Frontend | 6 routes, SSE chat, three-brain panel, PnL dashboard | leaderboard + war room |
| Hard circuit breakers | 4 explicit rules | 4 explicit rules |
| MCP server | Planned | Stdio MCP shipped |
| CLI deploy wizard | Planned | Shipped |

**Headline:** Helios is the strongest multi-agent x402 economy. v3 YieldAgent meets it on the multi-agent / x402 / 14-skill / Aave / FSM dimensions, while keeping our differentiators: **real V3 NPM lifecycle, verbatim Uniswap AI Skills port, on-chain reasoning audit, and copy-trading vaults**.

---

## 🚧 Out of Scope for v3

Reserved for v4 / future:
- Decentralized agent marketplace (other apps pay our brains for services)
- Cross-chain execution (Polygon, Arbitrum, Base)
- Brain reputation scoring on-chain (per-brain track record)
- L2 → L1 settlement of agent earnings
- Permissionless brain registration (third parties can register their own brains)

---

## 🔗 References

- **v2 spec:** [`ARCHITECTURE_V2.md`](ARCHITECTURE_V2.md) — current shipping architecture, pre-x402.
- **Helios source:** [github.com/helioslabs-ai/helios](https://github.com/helioslabs-ai/helios) — the strongest competing multi-agent x402 economy.
- **x402 protocol:** [x402.org](https://www.x402.org) — payment-required HTTP, EIP-3009 settlement.
- **OnchainOS docs:** [web3.okx.com/onchainos](https://web3.okx.com/onchainos) — agentic wallet + 14 skills.
- **Build X AI Season 2:** [X Layer announcement](https://x.com/XLayerOfficial/status/2048021007047573638) — winners + judging criteria.
