/**
 * AgentArena Hook contract config — V4 hook + registry deployed on X Layer mainnet.
 *
 * Built for the Hook the Future Hackathon (X Layer × Uniswap × Flap, 5/22–5/28 2026).
 *
 * Live addresses (broadcast 2026-05-24):
 *   - AgentRegistry:  0x93F88966879E2AcaE3FdDEC08DAb6CbD4ab8d141
 *   - AgentArenaHook: 0x25ff94A5E694343F2919A693E5ab9AFF2E825AC0
 *   - V4 Pool (USDT/WOKB, dynamic fee):
 *       PoolId 0xae2fec12631fc349f8d96e203f19f68d92f3d20eca53c5aee4dcb2ca4a9916e7
 *       bound to PoolManager 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32
 */

export const ARENA_HOOK_ADDRESS =
  "0x25ff94A5E694343F2919A693E5ab9AFF2E825AC0" as `0x${string}`;

export const ARENA_REGISTRY_ADDRESS =
  "0x93F88966879E2AcaE3FdDEC08DAb6CbD4ab8d141" as `0x${string}`;

export const ARENA_POOL_ID =
  "0xae2fec12631fc349f8d96e203f19f68d92f3d20eca53c5aee4dcb2ca4a9916e7" as `0x${string}`;

export const V4_POOL_MANAGER =
  "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32" as `0x${string}`;

export const ARENA_STAKE_TOKEN =
  "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" as `0x${string}`; // USD₮0

/** Block at which the AgentRegistry was deployed (for event-log scans) */
export const ARENA_DEPLOY_BLOCK = 60837000n;

/** First registered agent — YieldAgent's audit EOA */
export const ARENA_FIRST_AGENT =
  "0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838" as `0x${string}`;

/** Epoch / bid-phase durations as the contract sees them */
export const EPOCH_DURATION_SEC = 4 * 60 * 60; // 4h
export const BID_PHASE_DURATION_SEC = 5 * 60; // 5min

// ─────────────────────────────────────────────────────────────────────────
// AgentArenaHook ABI (only what we need for the dashboard)
// ─────────────────────────────────────────────────────────────────────────

export const ARENA_HOOK_ABI = [
  // ── Views ─────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getCurrentEpoch",
    inputs: [{ name: "pid", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEpochStartTime",
    inputs: [{ name: "pid", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getActiveManager",
    inputs: [{ name: "pid", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEpochCounters",
    inputs: [{ name: "pid", type: "bytes32" }],
    outputs: [
      { name: "rebalanceCount", type: "uint256" },
      { name: "accumulatedFees", type: "uint256" },
      { name: "startTVL", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBidderList",
    inputs: [
      { name: "pid", type: "bytes32" },
      { name: "epochId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getActiveBond",
    inputs: [{ name: "pid", type: "bytes32" }],
    outputs: [
      {
        components: [
          { name: "agent", type: "address" },
          { name: "poolId", type: "bytes32" },
          { name: "epochId", type: "uint256" },
          { name: "stakeAmount", type: "uint256" },
          { name: "promisedAPRBps", type: "uint256" },
          { name: "minFeeBps", type: "uint24" },
          { name: "maxFeeBps", type: "uint24" },
          { name: "maxRebalancesPerEpoch", type: "uint16" },
          { name: "maxTickRange", type: "int24" },
          { name: "nonce", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
  },

  // ── Events ────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "BidSubmitted",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "epochId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "promisedAPRBps", type: "uint256", indexed: false },
      { name: "bidScore", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ManagerElected",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "epochId", type: "uint256", indexed: true },
      { name: "manager", type: "address", indexed: true },
      { name: "winningScore", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EpochSettled",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "epochId", type: "uint256", indexed: true },
      { name: "manager", type: "address", indexed: true },
      { name: "actualAPRBps", type: "uint256", indexed: false },
      { name: "promisedAPRBps", type: "uint256", indexed: false },
      { name: "slashedAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ActionRecorded",
    inputs: [
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "epochId", type: "uint256", indexed: true },
      { name: "manager", type: "address", indexed: true },
      { name: "actionType", type: "bytes32", indexed: false },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// AgentRegistry ABI (just what the dashboard reads)
// ─────────────────────────────────────────────────────────────────────────

export const ARENA_REGISTRY_ABI = [
  {
    type: "function",
    name: "agents",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "registered", type: "bool" },
      { name: "name", type: "string" },
      { name: "strategyURI", type: "string" },
      { name: "stake", type: "uint256" },
      { name: "reputation", type: "uint256" },
      { name: "cooldownUntil", type: "uint256" },
      { name: "totalSlashed", type: "uint256" },
      { name: "totalEarned", type: "uint256" },
      { name: "epochsWon", type: "uint256" },
      { name: "epochsLost", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getStake",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getReputation",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isRegistered",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },

  // Events
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Slashed",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ReputationUpdated",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "delta", type: "int256", indexed: false },
      { name: "newReputation", type: "uint256", indexed: false },
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Convenience formatters
// ─────────────────────────────────────────────────────────────────────────

export function formatBps(bps: bigint | number | undefined, suffix = "%"): string {
  if (bps === undefined) return "—";
  const n = typeof bps === "bigint" ? Number(bps) : bps;
  return `${(n / 100).toFixed(2)}${suffix}`;
}

export function formatUSDT6(amount: bigint | undefined, digits = 2): string {
  if (amount === undefined) return "—";
  return (Number(amount) / 1_000_000).toFixed(digits);
}

export function formatRep(rep: bigint | undefined): string {
  if (rep === undefined) return "—";
  return Number(rep).toLocaleString();
}

export function shortAddr(addr?: string): string {
  if (!addr || addr.length < 10) return addr ?? "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortHash(hash?: string): string {
  if (!hash || hash.length < 10) return hash ?? "—";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function txOklink(hash: string): string {
  return `https://www.oklink.com/xlayer/tx/${hash}`;
}

export function addrOklink(addr: string): string {
  return `https://www.oklink.com/xlayer/address/${addr}`;
}
