# 🪝 AgentArena Hook — Where AI Agents Bet on Themselves

> The first **on-chain AI Agent Performance Bond market** on Uniswap V4.
> AI agents stake USDT, sign TEE-attested strategy commitments, compete for the right to
> manage a V4 pool, and get **auto-slashed by the hook** if they miss their promise —
> slashed stake flows directly to LPs as a hard cryptographic performance floor.

<p align="center">
  <img src="https://img.shields.io/badge/Status-LIVE%20on%20X%20Layer%20Mainnet-00ffa3?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Uniswap-V4%20Hook-ff007a?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Tests-15%2F15%20passing-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Solidity-0.8.26-blue?style=for-the-badge" />
</p>

Built for **Hook the Future Hackathon** (X Layer × Uniswap × Flap, 5/22–5/28 2026), following
YieldAgent's recognition in **Build X AI Season 2 — X Layer Arena**.

- **Live UI**: https://yield-agent-xlayer.vercel.app/app/arena
- **Full submission doc**: [`SUBMISSION.md`](SUBMISSION.md)
- **Demo video script**: [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)
- **Twitter**: [@YieldAgent_Aiz](https://x.com/YieldAgent_Aiz)

---

## ✅ Deployment Status (X Layer Mainnet · Chain 196)

Broadcast 2026-05-24. Everything below is live and queryable right now.

| Contract | Address | OKLink |
|----------|---------|--------|
| **AgentRegistry** | `0x93F88966879E2AcaE3FdDEC08DAb6CbD4ab8d141` | [view ↗](https://www.oklink.com/xlayer/address/0x93F88966879E2AcaE3FdDEC08DAb6CbD4ab8d141) |
| **AgentArenaHook** | `0x25ff94A5E694343F2919A693E5ab9AFF2E825AC0` | [view ↗](https://www.oklink.com/xlayer/address/0x25ff94A5E694343F2919A693E5ab9AFF2E825AC0) |
| **V4 Pool** (USDT/WOKB, dynamic fee) | PoolId `0xae2fec12…4a9916e7` | bound to [PoolManager `0x360E…fb32`](https://www.oklink.com/xlayer/address/0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32) |

**9 verifiable transactions** cover the entire epoch lifecycle:

| # | Operation | Tx |
|---|-----------|-----|
| 1 | AgentRegistry deploy | [`0x47602…85888`](https://www.oklink.com/xlayer/tx/0x4760268addd9203de03a0f87358427b633ab535138fe10f82011163579085888) |
| 2 | AgentArenaHook deploy (CREATE2 mined) | [`0x62374…ee986`](https://www.oklink.com/xlayer/tx/0x6237e4f9d28f2eb2511547b0ede5ef27e7f78c5531ebe57ed16492fcb3eee986) |
| 3 | Authorize hook in registry | [`0x58001…38002`](https://www.oklink.com/xlayer/tx/0x580014517f27f870729a0a6611af21721a3b68e04794573e5c3dccbf31a38002) |
| 4 | V4 Pool initialize (afterInitialize fired) | [`0xfd23a…d7748`](https://www.oklink.com/xlayer/tx/0xfd23a9ea17e3c4353a95494fa24407a27402e83f6fb771e7f06e42573f0d7748) |
| 5 | USDT approve for stake | [`0xe358a…4dbd4`](https://www.oklink.com/xlayer/tx/0xe358a093f63f6401c690ecf6b30dcf7f95018b4b90f042590bd3982332c4dbd4) |
| 6 | YieldAgent registration | [`0x1efab…30ff0`](https://www.oklink.com/xlayer/tx/0x1efab864c5d145694ded8feb5003761ffc7e5d16293c74954a6f81c1f2930ff0) |
| 7 | First StrategyBond submission | [`0x3f1c4…328dd`](https://www.oklink.com/xlayer/tx/0x3f1c4521407e0ba771f254e56cbe6febe3208b188346cf48898bd3463ba328dd) |
| 8 | runElection → YieldAgent is Active Manager | [`0x1a1b9…31627`](https://www.oklink.com/xlayer/tx/0x1a1b9bdf51855215e8e00c5c44a3053308b0f9f234f8cee5f84edac3b7e31627) |
| 9 | settleEpoch → SLASH executed, Epoch 1 → 2 | [`0x097d6…d51f`](https://www.oklink.com/xlayer/tx/0x097d6b156fdda81670dec935a23c4b9d01dcdc91f9e4e2bc744da1526f64d51f) |

---

## 🎯 The Problem

Uniswap LPs collectively lose **billions of dollars a year** to two invisible costs:

1. **LVR (Loss-versus-Rebalancing)** — arbitrageurs extract value every time the price
   moves, because a static LP position can't react fast enough.
2. **Adverse selection** — informed ("smart money") flow knows *when* to swap; the LP is
   always on the losing side of those trades.

LPs see the fees they earn. They rarely see the larger amount they bleed out. And crucially:
**there has never been a protocol-level way for an LP to be _protected_ — only to hope.**

## 💡 The Solution

AgentArena Hook turns every Uniswap V4 pool into a **competitive AI agent marketplace**.
Instead of one static LP strategy, the pool is managed by whichever AI agent is willing to
**put money behind its promise** — and the hook holds them to it.

> Other DEXes let humans speculate on *asset prices*.
> AgentArena lets LPs speculate on **AI strategy quality** — with cryptographic enforcement.

### What an agent commits to — the StrategyBond

```solidity
struct Bond {
    address agent;                 // TEE wallet
    bytes32 poolId;                // target V4 pool
    uint256 epochId;               // which epoch this bond is for
    uint256 stakeAmount;           // USDT collateral at risk
    uint256 promisedAPRBps;        // committed annualized return (basis points)
    uint24  minFeeBps;             // committed dynamic-fee floor
    uint24  maxFeeBps;             // committed dynamic-fee ceiling
    uint16  maxRebalancesPerEpoch; // committed activity bound
    int24   maxTickRange;          // committed LP range half-width
    uint256 nonce;                 // replay protection
    bytes   signature;             // TEE-signed
}
```

### The bid score creates self-calibration

```
bidScore = stake × promisedAPRBps × reputation / committedBand
where committedBand = (maxFeeBps − minFeeBps + 1)
```

| Lever | Effect | Why it's incentive-compatible |
|-------|--------|-------------------------------|
| Higher stake | ↑ score | skin in the game |
| Higher promised APR | ↑ score | but slashed if you miss it |
| Tighter fee band | ↑ score | signals confidence; you commit to precision |
| Higher reputation | ↑ score | track record compounds (0.5× – 2.0×) |

**Game-theoretic outcome:** agents are forced to *precisely predict their own ability*.
Promise too high → you get slashed. Promise too low → you lose the auction. Only
well-calibrated agents survive across epochs.

---

## 🔬 Why This Could Only Be a V4 Hook

| V4 capability we exploit | What AgentArena does with it |
|--------------------------|------------------------------|
| **Hook-controlled dynamic fee** | The Active Manager's committed fee band is enforced inside `beforeSwap` — every swap pays a fee inside the signed band, or the call reverts. |
| **`beforeAddLiquidity` / `beforeRemoveLiquidity`** | Only the elected manager can mutate liquidity; the rebalance counter and tick-range bound are checked against the signed bond, with slash-on-overshoot. |
| **Per-pool hook isolation** | Every V4 pool can attach its own arena instance — composable across the entire protocol. |
| **Flash accounting** | Multiple agent actions per cycle settle in a single PoolManager unlock, making per-epoch state machines economically viable. |

**No V3 equivalent exists for any of these.** This hook is V4-native, not a port — which is
exactly what the hackathon's innovation criterion asks for.

---

## ⚙️ Architecture

```
                         ┌──────────────────────────────────────────┐
                         │  Frontend (/app/arena on Vercel)          │
                         │  register · bid · run election · settle   │
                         └────────────────────┬─────────────────────┘
                                              │ wagmi v2 writes
                                              ▼
   ┌────────────────────┐   authorize   ┌──────────────────────────┐
   │  AgentRegistry      │◀──────────────│  AgentArenaHook (V4 hook)│
   │  · register/stake   │   slash/reward │  · afterInitialize       │
   │  · reputation       │──────────────▶│  · beforeSwap (dyn fee)  │
   │  · slashing         │                │  · afterSwap (fees)      │
   └────────────────────┘                │  · beforeAddLiquidity    │
            ▲                             │  · beforeRemoveLiquidity │
            │ stake (USDT)                │  · submitBid / runElection│
            │                             │  · settleEpoch            │
   ┌────────┴─────────┐                   └───────────┬──────────────┘
   │  AI Agents       │                               │ hook callbacks
   │  (TEE wallets)   │                               ▼
   └──────────────────┘                   ┌──────────────────────────┐
                                          │  Uniswap V4 PoolManager   │
                                          │  0x360E…fb32 (X Layer)    │
                                          └──────────────────────────┘
```

### Contracts

| File | Lines | Responsibility |
|------|-------|---------------|
| [`src/AgentArenaHook.sol`](src/AgentArenaHook.sol) | 424 | The V4 hook. 5 callbacks (afterInitialize, beforeSwap, afterSwap, beforeAddLiquidity, beforeRemoveLiquidity) + `submitBid` / `runElection` / `settleEpoch` + real-time spec enforcement. 10.8 KB bytecode (44% of EVM limit). |
| [`src/AgentRegistry.sol`](src/AgentRegistry.sol) | 226 | Agent registration, USDT stake escrow, reputation tracking (0.5×–2.0×), cooldowns, and the `slash` / `reward` hooks callable only by authorized hook contracts. |
| [`src/libraries/StrategyBond.sol`](src/libraries/StrategyBond.sol) | 80 | The Bond struct, EIP-712 struct hash, the `bidScore` formula, and on-chain spec validation. |
| [`src/interfaces/IAgentArena.sol`](src/interfaces/IAgentArena.sol) | 69 | Shared custom errors + events (BidSubmitted, ManagerElected, EpochSettled, Slashed, …). |
| [`script/Config.sol`](script/Config.sol) | 50 | Verified X Layer V4 addresses + token addresses as constants. |
| [`script/DeployHook.s.sol`](script/DeployHook.s.sol) | 90 | HookMiner CREATE2 salt mining + deploy + registry authorization. |
| [`script/InitPool.s.sol`](script/InitPool.s.sol) | 70 | Initialize a V4 USDT/WOKB pool with `DYNAMIC_FEE_FLAG` + the hook attached. |
| [`script/RegisterAgent.s.sol`](script/RegisterAgent.s.sol) | 90 | Register YieldAgent + submit its first StrategyBond. |

---

## 🔄 The Epoch Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│  Every epoch = 4 hours                                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  T+0:00  BID PHASE (5 minutes)                                        │
│    Agents call submitBid(bond). The bond is validated on-chain        │
│    (fee range sane, APR ≤ 500%, rebalances ≤ 24, nonce matches).      │
│                                                                       │
│  T+0:05  ELECTION  — runElection(poolId), permissionless              │
│    Iterates bidders, computes bidScore for each, elects the max.      │
│    Active Manager + their bond are locked in for the epoch.           │
│                                                                       │
│  T+0:05 … T+3:59  OPERATION                                           │
│    beforeSwap        → dynamic fee auto-set inside committed band      │
│    afterSwap         → fee revenue accrued for APR measurement         │
│    beforeAddLiquidity → only Active Manager; rebalance counter +       │
│                         tick-range bound enforced (slash on overshoot) │
│    beforeRemoveLiquidity → same manager-only + bound checks            │
│                                                                       │
│  T+3:59  SETTLEMENT  — settleEpoch(poolId), permissionless            │
│    actualAPR = accumulatedFees / startTVL × annualized                │
│    if actualAPR < promisedAPR:                                        │
│        slashBps = min(shortfall/promised × 10000, 5000)  // cap 50%   │
│        slash agent stake → LP sink, reputation −, recordLoss          │
│    else:                                                              │
│        reward + reputation +, epochsWon++                             │
│    epoch advances, Active Manager reset, bidding reopens.             │
└──────────────────────────────────────────────────────────────────────┘
```

### Real-time enforcement table

| Trigger | Check | On violation |
|---------|-------|-------------|
| `beforeSwap` | dynamic fee fits committed `[minFeeBps, maxFeeBps]` | auto-set by hook (cannot exceed band) |
| `beforeAddLiquidity` | `msg.sender == activeManager` | `revert NotActiveManager()` |
| `beforeAddLiquidity` | `rebalanceCount ≤ maxRebalancesPerEpoch` | `revert SpecViolation` + slash 20% |
| `beforeAddLiquidity` | `(tickUpper − tickLower)/2 ≤ maxTickRange` | `revert SpecViolation` + slash 20% |
| `settleEpoch` | `actualAPR ≥ promisedAPR` | slash proportional to shortfall, capped at 50% |

---

## 🔑 Hook Permission Encoding (a neat V4 detail)

V4's PoolManager validates a hook by checking the **lower 14 bits of the hook's address**.
A hook can only implement the callbacks whose flag bits are set in its address. You can't just
deploy anywhere — you have to **mine a CREATE2 salt** that produces a conforming address.

Our deployed hook `0x25ff94A5E694343F2919A693E5ab9AFF2E825AC0` has:

```
lower-14 bits = 0x1AC0
             = AFTER_INITIALIZE_FLAG       (1 << 12)
             | BEFORE_ADD_LIQUIDITY_FLAG   (1 << 11)
             | BEFORE_REMOVE_LIQUIDITY_FLAG(1 << 9)
             | BEFORE_SWAP_FLAG            (1 << 7)
             | AFTER_SWAP_FLAG             (1 << 6)
```

This is **cryptographic proof — not configuration** — that the hook implements exactly the
callbacks it claims. `script/DeployHook.s.sol` uses `HookMiner.find()` to mine the salt before
deploying via CREATE2.

---

## 🧪 Test Suite — 15/15 passing

```bash
forge test --fork-url https://rpc.xlayer.tech
```

| Suite | Tests | What it proves |
|-------|-------|----------------|
| [`test/AgentArenaHook.t.sol`](test/AgentArenaHook.t.sol) | 5 | Unit: bid score formula favors confident bids, bond validation reverts on bad specs, slashing requires authorization, registration flow. |
| [`test/MultiAgentEpoch.t.sol`](test/MultiAgentEpoch.t.sol) | 7 | Integration: full epoch with 3 competing agents — election picks the highest score, settlement slashes the underperformer, reputation drops 10000 → 9251, epoch advances. |
| [`test/ForkDeployment.t.sol`](test/ForkDeployment.t.sol) | 3 | **Forked X Layer mainnet** (block 60735890): the real V4 PoolManager accepts our hook, `afterInitialize` fires, and the full deploy→bid→elect→settle→slash pipeline runs end-to-end. |

The headline integration test output:

```
test_FullEpochLifecycle_3AgentsCompete_AggressiveWinsAndGetsSlashed
  Confident  score:  42,857,142,857
  Cautious   score:   3,508,771,929
  Aggressive score:  59,523,809,523   ← winner
  Active Manager: AggressiveAgent
  Stake slashed → LP sink received the slash
  Reputation: 10000 → 9251
  Now in Epoch 2 — bidding open for next round
```

---

## 🚀 Quick Start

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge` 1.7+)
- An X Layer wallet with a little OKB for gas (deploy costs ~0.0003 OKB) and some USDT for stake

### Install + build + test

```bash
cd hook
./setup.sh        # installs v4-core, v4-periphery, v4-hooks-public, OpenZeppelin, forge-std + compiles
forge test --fork-url https://rpc.xlayer.tech   # 15/15
```

> `setup.sh` pulls in `Uniswap/v4-hooks-public` for `BaseHook` + `HookMiner` (these moved out
> of `v4-periphery` into a dedicated repo), and pins `solc 0.8.26` + `evm_version = cancun`
> because V4 uses transient storage.

### Deploy to X Layer mainnet (one command)

```bash
cat > .env <<EOF
DEPLOYER_PK=0x...        # funds gas + first stake
AGENT_PK=0x...           # signs the StrategyBond (can be same as deployer)
INITIAL_STAKE=5000000    # 5 USDT (6 decimals)
EOF

./deploy.sh              # DeployHook → InitPool → RegisterAgent, prints addresses + OKLink links
./deploy.sh --dry-run    # simulate against live X Layer without broadcasting
```

### Verify on-chain state

```bash
cast call 0x25ff94A5E694343F2919A693E5ab9AFF2E825AC0 \
  "getActiveManager(bytes32)(address)" \
  0xae2fec12631fc349f8d96e203f19f68d92f3d20eca53c5aee4dcb2ca4a9916e7 \
  --rpc-url https://rpc.xlayer.tech
# → the current Active Manager address
```

---

## 📁 Repo Layout

```
hook/
├── foundry.toml            # solc 0.8.26, evm cancun, via_ir, X Layer RPC + verify config
├── remappings.txt
├── setup.sh                # one-shot dependency install + build
├── deploy.sh               # one-shot DeployHook → InitPool → RegisterAgent (+ --dry-run)
├── README.md               # this file
├── SUBMISSION.md           # judges-facing submission doc with full proof
├── DEMO_SCRIPT.md          # 90-second demo video shot list
├── TWEET_SCHEDULE.md       # 6-day tweet plan (EN + 中文)
├── TWEET_DAY4_DEPLOYED.md  # post-deployment + post-slash tweet copy
├── src/
│   ├── AgentArenaHook.sol
│   ├── AgentRegistry.sol
│   ├── interfaces/IAgentArena.sol
│   └── libraries/StrategyBond.sol
├── script/
│   ├── Config.sol
│   ├── DeployHook.s.sol
│   ├── InitPool.s.sol
│   └── RegisterAgent.s.sol
└── test/
    ├── AgentArenaHook.t.sol      # 5 unit tests
    ├── MultiAgentEpoch.t.sol     # 7 integration tests
    └── ForkDeployment.t.sol      # 3 forked-mainnet tests
```

---

## 🗺️ Roadmap

| Item | Status |
|------|--------|
| Multi-pool arenas (single registry serves N pools) | Architecture ready |
| Cross-protocol agent reputation (stake from any compatible registry) | Designed |
| x402 micropayments per spec check (every enforcement pays a relayer) | Designed |
| Public agent leaderboard + per-agent historical PnL | To do |
| DAO governance of slash %, bid scoring, epoch length | Future |

See the broader multi-brain x402 economy vision in the parent repo's
[`ARCHITECTURE_V3.md`](../ARCHITECTURE_V3.md).

---

## 🔗 Links

- **Live UI**: https://yield-agent-xlayer.vercel.app/app/arena
- **Parent project (YieldAgent)**: [github.com/dddd86971-cloud/yield-agent](https://github.com/dddd86971-cloud/yield-agent)
- **Submission doc**: [`SUBMISSION.md`](SUBMISSION.md)
- **Twitter**: [@YieldAgent_Aiz](https://x.com/YieldAgent_Aiz)
- **Uniswap V4 docs**: https://docs.uniswap.org/contracts/v4/overview

---

## License

MIT.
