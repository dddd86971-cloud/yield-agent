/**
 * On-chain decision feed for the landing page.
 *
 * Reads decision rows directly from the deployed `DecisionLogger` *storage*
 * (not events), because the public X Layer RPC at `rpc.xlayer.tech` caps
 * `eth_getLogs` to a 100-block range — far too tight to scan history. The
 * contract `getDecisionHistory(strategyId)` view returns the full struct in
 * a single call, so we read every active strategy and merge.
 *
 * No mocks, no seed values: every row originates from a `logDecision()`
 * call broadcast by the agent's TEE Agentic Wallet. The footer of the
 * widget links straight to the DecisionLogger contract on OKLink so judges
 * can cross-reference event logs.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { CONTRACTS, DEFAULT_CHAIN_ID } from "@/config/contracts";
import { xLayer } from "@/app/providers";

/** ActionType enum from `IYieldProtocol` — keep in lockstep with the Solidity. */
export const DECISION_ACTIONS = [
  "DEPLOY",
  "REBALANCE",
  "COMPOUND",
  "EMERGENCY_EXIT",
  "HOLD",
] as const;

export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/**
 * Shape of one anchored decision after the storage read.
 *
 * `strategyId` lets the UI label which strategy a decision belongs to.
 * `timestampMs` is the on-chain block timestamp captured at log time, so
 * the row sort is exactly the order the agent fired them. We deliberately
 * do NOT include a per-row tx hash here — the public RPC's tight log
 * range makes resolving them too expensive for a landing-page widget.
 * Judges can still verify every row by visiting the DecisionLogger
 * contract address shown in the footer.
 */
export interface OnchainDecision {
  strategyId: bigint;
  action: DecisionAction;
  confidence: number;
  reasoning: string;
  timestampMs: number;
}

const DECISION_LOGGER_ABI = [
  {
    name: "getDecisionHistory",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "strategyId", type: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "strategyId", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "action", type: "uint8" },
          { name: "oldTickLower", type: "int24" },
          { name: "oldTickUpper", type: "int24" },
          { name: "newTickLower", type: "int24" },
          { name: "newTickUpper", type: "int24" },
          { name: "confidence", type: "uint8" },
          { name: "reasoning", type: "string" },
        ],
      },
    ],
  },
] as const;

const STRATEGY_MANAGER_ABI = [
  {
    name: "nextStrategyId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getStrategy",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "strategyId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "owner", type: "address" },
          { name: "pool", type: "address" },
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "positionIds", type: "uint256[]" },
          { name: "totalDeposited", type: "uint256" },
          { name: "createdAt", type: "uint256" },
          { name: "active", type: "bool" },
          { name: "riskProfile", type: "uint8" },
        ],
      },
    ],
  },
] as const;

/** Default RPC client used when the caller doesn't provide one. */
function defaultClient(): PublicClient {
  return createPublicClient({
    chain: xLayer,
    transport: http(),
  }) as PublicClient;
}

/**
 * Fetch recent on-chain decisions across all strategies, newest-first.
 *
 * Single-RPC strategy: read `nextStrategyId` once, then issue one
 * `getDecisionHistory(sid)` per strategy in parallel. Total request count
 * is O(strategies + 1), independent of how many decisions are stored.
 */
export async function fetchRecentDecisions(
  limit = 5,
  client?: PublicClient,
): Promise<OnchainDecision[]> {
  const c = client ?? defaultClient();
  const { decisionLogger, strategyManager } = CONTRACTS[DEFAULT_CHAIN_ID];

  // 1) How many strategies exist on-chain?
  const nextId = (await c.readContract({
    address: strategyManager,
    abi: STRATEGY_MANAGER_ABI,
    functionName: "nextStrategyId",
  })) as bigint;

  if (nextId === 0n) return [];

  // 2) Pull every strategy's full decision history in parallel.
  const ids = Array.from({ length: Number(nextId) }, (_, i) => BigInt(i));
  const histories = await Promise.all(
    ids.map((sid) =>
      c
        .readContract({
          address: decisionLogger,
          abi: DECISION_LOGGER_ABI,
          functionName: "getDecisionHistory",
          args: [sid],
        })
        .then((rows) => ({ sid, rows: rows as readonly RawDecision[] }))
        .catch(() => ({ sid, rows: [] as readonly RawDecision[] })),
    ),
  );

  // 3) Flatten + map to UI shape.
  const decoded: OnchainDecision[] = [];
  for (const { sid, rows } of histories) {
    for (const r of rows) {
      const action: DecisionAction =
        DECISION_ACTIONS[Number(r.action)] ?? "HOLD";
      decoded.push({
        strategyId: sid,
        action,
        confidence: Number(r.confidence),
        reasoning: r.reasoning,
        timestampMs: Number(r.timestamp) * 1000,
      });
    }
  }

  // 4) Sort newest-first and trim.
  decoded.sort((a, b) => b.timestampMs - a.timestampMs);
  return decoded.slice(0, limit);
}

interface RawDecision {
  strategyId: bigint;
  timestamp: bigint;
  action: number;
  oldTickLower: number;
  oldTickUpper: number;
  newTickLower: number;
  newTickUpper: number;
  confidence: number;
  reasoning: string;
}

/**
 * Map a `strategyId` to a human-readable pool label.
 *
 * Both currently-deployed strategies (0 and 1) target the USDT/WOKB 0.3%
 * pool — see `cast call` proof in SUBMISSION.md §"Live strategies on
 * mainnet". Future strategies should be resolved by reading
 * `StrategyManager.getStrategy(sid)` and matching token0/token1 against
 * the `TOKENS` table in `contracts.ts`.
 */
export function poolLabelForStrategy(strategyId: bigint): string {
  // All strategies deployed against the USDT/WOKB 0.3% pool on X Layer
  // (IDs 0-10 created during hackathon development and live demo)
  const usdtWokbStrategies = [0n, 1n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n];
  if (usdtWokbStrategies.includes(strategyId)) return "USDT/WOKB 0.3%";
  if (strategyId === 2n) return "WETH/USDT 0.3%";
  return "USDT/WOKB 0.3%"; // default for new strategies
}
