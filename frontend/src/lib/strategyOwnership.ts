/**
 * Per-wallet strategy ownership tracking via localStorage.
 *
 * When a user deploys a strategy through the dashboard, we record
 * { walletAddress → strategyId[] } so that only the deployer can
 * see their LP positions, monitor status, and decision history.
 *
 * Other users' strategies are only visible on the Agent Leaderboard.
 */

const STORAGE_KEY = "yieldagent_strategy_owners";

type OwnershipMap = Record<string, number[]>; // lowercase address → strategyIds

function readMap(): OwnershipMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMap(map: OwnershipMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage unavailable (SSR, private mode, etc.)
  }
}

/** Record that `walletAddress` deployed `strategyId`. */
export function recordDeployment(walletAddress: string, strategyId: number): void {
  const map = readMap();
  const key = walletAddress.toLowerCase();
  const list = map[key] ?? [];
  if (!list.includes(strategyId)) {
    list.push(strategyId);
  }
  map[key] = list;
  writeMap(map);
}

/** Get all strategy IDs deployed by `walletAddress`. */
export function getOwnedStrategies(walletAddress: string): number[] {
  const map = readMap();
  return map[walletAddress.toLowerCase()] ?? [];
}

/** Check if `walletAddress` owns `strategyId`. */
export function ownsStrategy(walletAddress: string, strategyId: number): boolean {
  return getOwnedStrategies(walletAddress).includes(strategyId);
}
