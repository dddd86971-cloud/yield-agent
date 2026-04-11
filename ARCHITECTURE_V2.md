# YieldAgent v2 Architecture

**Target:** OKX Build X Hackathon Season 2 — X Layer mainnet
**Hackathon requirement:** "Call at least one OnchainOS module OR Uniswap AI Skill"

> **v2.1 addendum (2026-04-11):** the OnchainOS `defi invest` path for
> Uniswap V3 LP mint is not reachable from an ERC-4337 Agentic Wallet in
> CLI v2.2.7 — `defi search` finds the pool but `defi invest` never
> bundles the source-token approvals as a userOp, so the downstream
> NonfungiblePositionManager call reverts at `estimateGas`. The system
> pivoted to **swap-execute mode**: the Agentic Wallet routes rebalance /
> harvest actions through `onchainos swap execute`, which DOES handle
> ERC-4337 bundling correctly for native-source swaps. All references to
> `defi invest` below describe the original target; where the shipped code
> diverges, the text is marked **[swap-mode]**. See README §
> "How it actually broadcasts" and SUBMISSION § "Known limitations" for
> the full failure log.

## Why v2

v1 embedded Uniswap V3 execution logic directly in `StrategyManager.sol`
(`INonfungiblePositionManager.mint/collect/decreaseLiquidity`, `IUniswapV3Pool.slot0`,
`ISwapRouter.exactInputSingle`). None of those contracts are deployed on X Layer,
so v1 can't actually run on the target chain.

v2 decouples **planning, execution, and audit** into three layers so the protocol
actually ships on X Layer and qualifies for two special-prize categories:

- **Best Uniswap AI Skills Integration (400 USDT)** — planning layer
- **Most Active On-Chain Agent (400 USDT)** — execution layer (all txs through OnchainOS)

## Three-layer model

```
┌────────────────────────────────────────────────────────────┐
│  1. PLANNING — Uniswap AI Skills (off-chain helpers)       │
│     liquidity-planner → tick range + fee tier suggestions  │
│     swap-planner      → rebalance swap plans               │
│     v4-sdk-integration → SDK math for on-chain simulation  │
└────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│  2. EXECUTION — OnchainOS CLI (on-chain)                   │
│     Original target: `onchainos defi invest/withdraw       │
│       /collect/positions` → V3 NFT mint + fee harvest.     │
│     [swap-mode] Shipped path: `onchainos swap execute`     │
│       --from-token/--to-token/--amount --wallet $AGENT     │
│       drives DEPLOY, REBALANCE, EMERGENCY_EXIT and the     │
│       optional harvest hook. All userOps are bundled by    │
│       the OnchainOS Agentic Wallet (ERC-4337, EntryPoint   │
│       v0.7) so the source EOA is carried in calldata, not  │
│       as `msg.sender`, and the on-chain audit row records  │
│       the bundler tx hash.                                 │
│     → all transactions satisfy "Most Active Agent" anti-   │
│       gaming rule (must go through OnchainOS API)          │
└────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│  3. AUDIT & REGISTRY — Slim on-chain contracts on X Layer  │
│     StrategyManager v2 (no DEX deps, ~220 lines)           │
│       ├─ Strategy registry (metadata only)                 │
│       ├─ Agent authorization                               │
│       ├─ Execution records (tx hash, externalId)           │
│       └─ DecisionLogger hook (reasoning + confidence)      │
│     DecisionLogger (unchanged, 192 lines)                  │
│       └─ Every DEPLOY / REBALANCE / COMPOUND / HOLD / EXIT │
│          decision recorded with full reasoning chain       │
│     FollowVault + Factory (unchanged, 226 lines)           │
│       └─ ERC20 vault for copy-trading followers (USDT      │
│          default on X Layer mainnet — per-pool quote)      │
└────────────────────────────────────────────────────────────┘
```

## Contract changes

### Keep unchanged
- `DecisionLogger.sol` (192 lines) — already chain-agnostic, no DEX deps
- `FollowVault.sol` + `FollowVaultFactory` (226 lines) — only reads `Strategy.agent` and `Strategy.active`
- `interfaces/IYieldProtocol.sol` — struct layout unchanged (positionIds stays as `uint256[]` used for sequential execution counters)

### Rewrite
- `StrategyManager.sol`: 783 → ~220 lines
  - **Remove:** `INonfungiblePositionManager`, `IUniswapV3Pool`, `ISwapRouter` interfaces
  - **Remove:** `TickMath` import
  - **Remove:** `tx.origin` usage
  - **Remove:** `deposit` / `withdraw` / `userShares` / `totalShares` (moved to FollowVault which already had its own accounting)
  - **Repurpose:** `compoundFees` — the solidity entry point stays (it still writes a COMPOUND DecisionLogger row), but the agent only calls it when a real harvest tx was broadcast by OnchainOS. In **[swap-mode]** the shipped code currently has no harvest path and instead calls `logHold` on the periodic heartbeat so the audit trail does not accumulate fake COMPOUND rows. See `AgentCoordinator.runCompound()`.
  - **Keep:** strategy registry, agent auth, decision logging, event signatures
  - **Add:** `Execution` struct + `recordExecution()` to log OnchainOS tx hashes and externalIds
  - **Add:** `strategy.agent = msg.sender`, `strategy.owner = msg.sender` (agent owns its own strategies; users interact through FollowVault)

### Delete
- `libraries/TickMath.sol` — no longer needed on-chain

## ABI changes

External methods keep the same name and return shape so frontends and the
existing `ExecutionEngine.ts` can be updated in place:

| Method | v1 | v2 |
|---|---|---|
| `deployStrategy` | `(pool, positions, risk, thesis)` → pulls tokens & mints NFT | `(pool, token0, token1, fee, positions, risk, thesis)` → pure registration |
| `rebalance` | `(id, newPositions, reasoning, conf)` → closes old NFTs, mints new | `(id, newPositions, reasoning, conf)` → just logs decision |
| `compoundFees` | collects & reinvests | removed (agent calls off-chain) |
| `emergencyExit` | closes NFTs, returns tokens | marks inactive, logs decision |
| `logHold` | unchanged | unchanged |
| `deposit` / `withdraw` | on-chain share accounting | removed (FollowVault owns this) |
| `recordExecution` | — | **NEW**: log OnchainOS tx hash + external id |
| `getStrategy` | unchanged | unchanged |
| `getExecutions` | — | **NEW**: return execution history |

## Constructor signature

```solidity
// v1
constructor(address _positionManager, address _swapRouter, address _decisionLogger)

// v2
constructor(address _decisionLogger)
```

→ `scripts/deploy.ts` no longer needs the hardcoded Ethereum mainnet addresses.

## Agent layer changes

`agent/src/engines/ExecutionEngine.ts`:
- Update `STRATEGY_MANAGER_ABI` to match v2 methods
- Add `recordExecution` helper that is called after each successful OnchainOS broadcast (historically `defi invest/withdraw/collect`, currently `swap execute`)
- Remove direct pool queries (use OnchainOS CLI's own pool data or a chain RPC read fallback)

Shipped wrapper `agent/src/services/OnchainOSAdapter.ts`:
- **[shipped]** `swap({ fromToken, toToken, wallet, chain, readableAmount, slippage })` → spawns `onchainos swap execute` and parses the `swapTxHash` / `fromAmount` / `toAmount` fields. Used by DEPLOY (native-source, stable-target), REBALANCE, and EMERGENCY_EXIT.
- **[shipped]** `getBalance(walletAddress, chain)`, `getTokens(chain)`, `getAddresses()` — read-only helpers.
- **[deferred]** `invest({ chainId, productId, amountUsd, tickLower, tickUpper })` — blocked on ERC-4337 approve-bundling bug, stub kept in code so V3-reentry slots in cleanly once the upstream CLI is fixed.
- **[deferred]** `withdraw({ positionId })`, `collect({ positionId })`, `positions()` — same blocker.

For the first deployment we can leave the agent's `deployStrategy` etc.
unwired — the priority is contracts on-chain first.

## Deployment flow

1. Set `PRIVATE_KEY` in `.env` (real deployer wallet)
2. Fund deployer with ~1–2 OKB on X Layer
3. Compile: `npx hardhat compile`
4. Deploy to testnet (chain 195): `npx hardhat run scripts/deploy.ts --network xlayerTestnet`
5. Verify basic flow (register agent, log a DEPLOY decision)
6. Confirm with user before mainnet
7. Deploy to mainnet (chain 196): `npx hardhat run scripts/deploy.ts --network xlayer`
8. Write `yield-agent/deployment.json` with contract addresses
9. Create `frontend/src/config/contracts.ts` pointing at real addresses
10. Submit to m/buildx on Moltbook

## Scope discipline

Out of scope for this iteration (post-hackathon work):
- Full on-chain yield accounting (v2 delegates to external OnchainOS bookkeeping)
- Permissionless user `deposit()` into StrategyManager (go through FollowVault)
- On-chain rebalance execution (OnchainOS does it, StrategyManager just records)
- Multi-position strategies with cross-tick rebalancing
