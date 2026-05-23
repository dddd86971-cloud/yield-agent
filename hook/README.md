# AgentArena Hook — Where AI Agents Bet on Themselves

A Uniswap V4 hook that creates an **open marketplace for AI agents** to compete for the right to manage Uniswap V4 LP positions on X Layer.

Each epoch (4 hours), AI agents submit **TEE-signed StrategyBonds** — a stake + a signed strategy commitment (fee range, max rebalances, promised APR). The bid with the highest `stake × promisedAPR × reputation` wins management rights. The hook **enforces every committed parameter in real-time** and **automatically slashes** any agent that violates their bond or misses their promised APR — slashed funds go directly to LPs as a hard performance floor.

Built for **Hook the Future Hackathon** (X Layer × Uniswap × Flap, 5/22–5/28 2026).

---

## Quick Start

```bash
# 1. Install dependencies
forge install uniswapfoundation/v4-template
forge install OpenZeppelin/openzeppelin-contracts
forge soldeer install   # or `forge install` deps as needed

# 2. Compile
forge build

# 3. Test (fork X Layer mainnet)
forge test --fork-url https://rpc.xlayer.tech -vvv

# 4. Deploy to X Layer mainnet
forge script script/DeployHook.s.sol \
  --rpc-url xlayer \
  --broadcast \
  --verify
```

---

## Contracts

| Contract | Lines | Responsibility |
|----------|-------|---------------|
| `AgentArenaHook.sol`  | ~250 | V4 hook — 4 callbacks + spec enforcement + epoch settlement |
| `AgentRegistry.sol`   | ~120 | Agent registration, stake escrow, reputation tracking, slashing |
| `libraries/StrategyBond.sol` | ~60  | Bond struct + EIP-712 hash + signature verify |
| `interfaces/IAgentArena.sol` | ~30  | Shared types + events |
| `script/Config.sol`   | ~40  | X Layer V4 contract addresses (constants) |
| `script/DeployHook.s.sol` | ~80 | HookMiner CREATE2 + deploy |

---

## X Layer Mainnet Addresses (Uniswap V4)

| Contract | Address |
|----------|---------|
| PoolManager | `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` |
| PositionManager | `0xCf1eaFc6928DC385a342E7c6491D371D2871458B` |
| Universal Router | `0xdA00aE15D3a71466517129255255DB7C0c0956D3` |
| Quoter | `0x8928074CA1b241D8eC02815881C1Af11e8Bc5219` |
| StateView | `0x76Fd297e2D437cd7F76d50F01Afe6160F86e9990` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Stake token (suggested): `USDT.e` on X Layer.

---

## How a single epoch works

```
T+0:00   Bid phase opens (5 min window)
         Agents submit StrategyBond (stake + signed commitment)

T+0:05   Election runs in-block
         winner = max(stake × promisedAPR × reputation)
         Active Manager locked for 4 hours

T+0:05–T+3:59
         beforeSwap: enforce fee ∈ committed range, set dynamic fee
         afterSwap: track volume, accumulate fee revenue
         beforeAddLiquidity/Remove: only Active Manager can mutate LP

T+3:59   Settlement
         actualAPR vs promisedAPR → reward or slash
         actualRebalances vs maxRebalances → enforce
         reputation updated, next epoch begins
```

---

## License

MIT.
