# AgentArena Hook — Hook the Future Hackathon Submission

**Project:** AgentArena Hook
**Tagline:** Where AI agents bet on themselves — the first on-chain Agent Performance Bond market for Uniswap V4.
**Team:** YieldAgent (Build X AI Season 2 — X Layer Arena recognized)
**Twitter:** [@YieldAgent_Aiz](https://x.com/YieldAgent_Aiz)
**Repo:** [github.com/dddd86971-cloud/yield-agent](https://github.com/dddd86971-cloud/yield-agent) (subdirectory: `hook/`)

---

## 1. The One-Sentence Pitch

**AgentArena Hook turns Uniswap V4 pools into open competitive markets where AI agents stake USDT, sign their strategy commitments via TEE, and get automatically slashed on-chain if they fail to deliver — giving LPs the first cryptographic performance floor in DeFi history.**

---

## 2. Why This Hook Could Only Exist as a V4 Hook

| V4 capability we exploit | What we do with it |
|--------------------------|--------------------|
| **Hook-controlled dynamic fee** | Active Manager's committed fee range is enforced in `beforeSwap` — every swap pays a fee inside the manager's signed band, or the call reverts. |
| **`beforeAddLiquidity` / `beforeRemoveLiquidity` callbacks** | Only the elected manager can mutate liquidity; rebalance count + tick range are checked against the signed bond and slash-triggers on overshoot. |
| **Per-pool hook isolation** | Every Uniswap V4 pool can attach its own arena instance — composable across the entire protocol. |
| **Flash accounting** | Multiple agent actions per cycle settle in a single PoolManager unlock — making per-epoch state machines economically viable. |

No V3 equivalent exists for any of these. This hook is **V4-native**, not a port.

---

## 3. The Innovation: Programmable Accountability for AI Agents

### What an Agent Performance Bond looks like on-chain

```solidity
struct StrategyBond {
    address agent;             // TEE wallet
    bytes32 poolId;            // target V4 pool
    uint256 epochId;
    uint256 stakeAmount;       // USDT locked as collateral
    uint256 promisedAPRBps;    // committed annualized return (basis points)
    uint24  minFeeBps;         // committed dynamic fee floor
    uint24  maxFeeBps;         // committed dynamic fee ceiling
    uint16  maxRebalancesPerEpoch;  // committed activity bound
    int24   maxTickRange;      // committed LP range bound
    uint256 nonce;
    bytes   signature;         // TEE-signed by agent
}
```

### The bid score formula creates self-calibration

```
score = stake × promisedAPR × reputation / committedBand
where committedBand = (maxFeeBps - minFeeBps + 1)
```

- **Tighter band → higher score** — confident agents are rewarded with election priority
- **Higher promised APR → higher score** — but slashed if missed
- **Higher reputation → higher score** — track record compounds
- **Higher stake → higher score** — skin in the game

**Game-theoretic outcome:** agents are forced to **precisely predict their own ability**. Promise too high → slashed. Promise too low → lose to better bidders. Only optimal bidders survive.

### Cryptographic enforcement at every callback

| Trigger | Check | On violation |
|---------|-------|-------------|
| `beforeSwap` | dynamic fee fits committed band | (auto-set by hook) |
| `beforeAddLiquidity` | `sender == activeManager` | `revert NotActiveManager()` |
| `beforeAddLiquidity` | `rebalanceCount ≤ maxRebalances` | `revert SpecViolation` + slash 20% |
| `beforeAddLiquidity` | `(tickUpper - tickLower) / 2 ≤ maxTickRange` | `revert SpecViolation` + slash 20% |
| `settleEpoch` | `actualAPR ≥ promisedAPR` | slash proportional to shortfall, max 50% |

### What LPs get

A **mathematical performance floor**: if the manager doesn't deliver promised APR, the difference is **paid by the manager's stake** to the LP sink. This is the first time in DeFi history that LPs have an enforced lower bound on yield, not just a hope.

---

## 4. Live Verification

### Deployed Contracts (X Layer Mainnet, Chain ID 196)

After running `script/DeployHook.s.sol` and `script/InitPool.s.sol`, the following addresses will be appended here:

| Contract | Address | OKLink |
|----------|---------|--------|
| AgentRegistry | _(to be filled after deploy)_ | _(link)_ |
| AgentArenaHook | _(to be filled after deploy)_ | _(link)_ |
| V4 Pool (USDT/WOKB w/ DynamicFee) | PoolId: _(to be filled)_ | _(link)_ |

### Live Activity

| Activity | Tx Hash |
|----------|---------|
| AgentRegistry deployment | _(to be filled)_ |
| AgentArenaHook deployment | _(to be filled)_ |
| YieldAgent registration | _(to be filled)_ |
| First StrategyBond submission | _(to be filled)_ |
| First election | _(to be filled)_ |
| First swap (hook fired) | _(to be filled)_ |
| First settlement (slash or reward) | _(to be filled)_ |

### Build verification

```bash
$ cd hook && forge build
Compiling 54 files with Solc 0.8.26
Solc 0.8.26 finished in 760ms
✓ AgentArenaHook  10,804 bytes  (44% of 24KB limit)
✓ AgentRegistry    4,658 bytes  (19% of 24KB limit)

$ forge test
Ran 2 test suites: 12 tests passed, 0 failed
```

The headline integration test (`test_FullEpochLifecycle_3AgentsCompete_AggressiveWinsAndGetsSlashed`) demonstrates the entire mechanism on-chain in one transaction sequence:

```
--- Stage 1: Bid Phase ---
  Confident  score:  42,857,142,857
  Cautious   score:   3,508,771,929
  Aggressive score:  59,523,809,523  ← winner
--- Stage 2: Election ---
  Active Manager: AggressiveAgent
--- Stage 3: Manager Sets TVL Snapshot ---
  startTVL = $10,000
--- Stage 4: Epoch Runs (4 hours simulated) ---
  Accumulated fees = 0 → manager will MISS promised APR
--- Stage 5: Settlement ---
  Stake slashed:        250 USDT
  LP sink received:     250 USDT
  Reputation:           10000 → 9251
--- Stage 6: Verify Next Epoch Advances ---
  Now in Epoch 2 — bidding open for next round
```

---

## 5. How This Maps to the Judging Rubric

### Innovation (Hook Logic Design Cleverness)

| | Aspect |
|---|--------|
| ⭐ | **Novel financial primitive**: Agent Performance Bond — fuses CDS, auction, and reputation on top of V4. No prior art exists. |
| ⭐ | **Mechanism design**: the bid score formula incentivizes precise self-prediction; over-promising and under-promising are both punished. |
| ⭐ | **V4-native**: dynamic fee + per-callback enforcement + flash accounting are all leveraged; this hook cannot exist on V3. |
| ⭐ | **AI-as-product, not AI-as-feature**: agents are the protocol's first-class participants, not auxiliary signal sources. |

### Potential Market Value

| | Aspect |
|---|--------|
| ⭐ | **Solves real LP pain**: LVR + adverse selection are the #1 invisible cost of being a Uniswap LP. AgentArena gives LPs a hard floor. |
| ⭐ | **Protocol-level infrastructure**: every X Layer agentic project (Helios, XSight, future entries) can plug in to compete for management roles. |
| ⭐ | **Self-sustaining economy**: agent fee revenue funds ongoing competitive cycles; no token incentive required. |
| ⭐ | **Composable**: a single hook + registry can serve unlimited V4 pools. |

### Completeness (Real On-chain, Triggerable)

| | Aspect |
|---|--------|
| ✅ | 5 Solidity contracts + libraries, 1,313 lines of production code |
| ✅ | Full Foundry test suite: 12/12 passing |
| ✅ | Deployment scripts (DeployHook, InitPool, RegisterAgent) with HookMiner CREATE2 |
| ✅ | Hook permissions verified at deploy time — won't compile/deploy with mismatched flags |
| ✅ | Contract sizes well under 24KB EVM limit (44% headroom) |
| ✅ | Ready for X Layer mainnet (PoolManager `0x360E…fb32`) |

### Demo Video Bonus

A 90-second demo video walking through:
1. The judging rubric problem we're solving (LVR + adverse selection)
2. The Bond + bid + election mechanism, narrated alongside live OKLink-verifiable txs
3. A live epoch with 3 mock agents competing, ending in slash + reward
4. The reusable infrastructure — any other agentic project can plug in

---

## 6. Continuity with Build X AI Season 2

This is **not a one-shot hackathon entry**. AgentArena Hook is the V4-protocol-layer evolution of YieldAgent's existing infrastructure:

| Build X AI S2 (already shipped) | Hook the Future (this submission) |
|---------------------------------|----------------------------------|
| 3-brain AI ensemble (Market + Pool + Risk) | Brains feed the agent's bond predictions |
| OnchainOS TEE signer for V3 LP | Same TEE signs the StrategyBond |
| DecisionLogger on-chain audit | Hook events extend the audit trail to per-swap granularity |
| FollowVault copy-trading | LPs in V4 pools auto-benefit from the slash-as-yield-floor |
| Real V3 NFT #962 on mainnet | First V4-native expression of the same agent |

**This is YieldAgent v3.5** — the multi-brain economy is now embedded into Uniswap's V4 protocol layer itself.

---

## 7. What We're Building Beyond This Submission

| Roadmap item | Status |
|--------------|--------|
| **Multi-pool arenas** — single registry serves N pools simultaneously | Architecture ready, just needs deployment |
| **Cross-protocol agent reputation** — agents can stake into AgentArena from any compatible registry | Designed |
| **x402 micropayments per spec check** — every enforcement event pays a relayer | Designed (v3 roadmap) |
| **Public agent leaderboard frontend** — real-time scoring + history | To do |
| **DAO governance of arena parameters** — community can tune slash %, bid scoring, etc. | Future |

---

## 8. License

MIT.

---

## 9. Contact

- **Twitter:** [@YieldAgent_Aiz](https://x.com/YieldAgent_Aiz)
- **GitHub:** [github.com/dddd86971-cloud/yield-agent](https://github.com/dddd86971-cloud/yield-agent)
- **Live demo (Build X AI S2 base):** [frontend-nine-theta-22.vercel.app](https://frontend-nine-theta-22.vercel.app)
- **Hackathon channel:** X Layer Builder Hub Telegram
