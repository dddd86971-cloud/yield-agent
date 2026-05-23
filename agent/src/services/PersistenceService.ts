/**
 * PersistenceService — file-based snapshot store for AgentCoordinator.
 *
 * Why file-based instead of SQLite:
 *   The hackathon demo runs a single process, strategies fit in memory, and
 *   we care about restart survival more than query performance. A JSON
 *   snapshot layer gives us durability without adding a native dep (SQLite
 *   would pull in better-sqlite3 and a rebuild step).
 *
 * Snapshots written:
 *   - strategies.json     : Map<strategyId, PersistedStrategy>
 *   - history.json        : EvaluationLite[]   (trimmed to last 500 entries)
 *   - pnl-snapshots.json  : PnLSnapshot[]      (per-strategy value points)
 *
 * All writes go through a debounced save loop so rapid state churn from
 * the monitoring loop doesn't hammer the disk. Reads happen once at boot.
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "../../data");
const STRATEGIES_FILE = path.join(DATA_DIR, "strategies.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const PNL_FILE = path.join(DATA_DIR, "pnl-snapshots.json");
const DEBOUNCE_MS = 2000;
const MAX_HISTORY_ENTRIES = 500;
const MAX_PNL_SNAPSHOTS = 2000;

export interface PersistedStrategy {
  strategyId: number;
  poolAddress: string;
  deployerWallet: string | null;
  status: string;
  intent: any;
  evaluationCount: number;
  lastEvaluation: number;
  lastFullEval: number;
  lastCompound: number;
  nftTokenId?: string;
  investmentId?: string;
  token0Symbol?: string;
  token1Symbol?: string;
  principalUSD?: number;
  deployedAt: number;
}

export interface PnLSnapshot {
  timestamp: number;
  strategyId: number;
  poolAddress: string;
  nftTokenId?: string;
  liquidity: string;
  feesOwed0: string;
  feesOwed1: string;
  priceOKB?: number;
  positionValueUSD?: number;
  feesValueUSD?: number;
  isInRange: boolean;
}

export class PersistenceService {
  private strategies = new Map<number, PersistedStrategy>();
  private history: any[] = [];
  private pnlSnapshots: PnLSnapshot[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor() {
    this.ensureDir();
    this.loadAll();
  }

  private ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadAll() {
    this.strategies = this.loadMap<number, PersistedStrategy>(STRATEGIES_FILE, (s) => s.strategyId);
    this.history = this.loadArray(HISTORY_FILE);
    this.pnlSnapshots = this.loadArray(PNL_FILE);
    console.log(
      `[Persistence] Loaded ${this.strategies.size} strategies, ` +
        `${this.history.length} evaluations, ${this.pnlSnapshots.length} PnL snapshots.`,
    );
  }

  private loadMap<K, V>(file: string, keyFn: (v: V) => K): Map<K, V> {
    const map = new Map<K, V>();
    if (!fs.existsSync(file)) return map;
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const arr: V[] = JSON.parse(raw);
      for (const item of arr) map.set(keyFn(item), item);
    } catch (err) {
      console.warn(`[Persistence] Failed to load ${file}:`, err);
    }
    return map;
  }

  private loadArray<T>(file: string): T[] {
    if (!fs.existsSync(file)) return [];
    try {
      const raw = fs.readFileSync(file, "utf-8");
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Persistence] Failed to load ${file}:`, err);
      return [];
    }
  }

  private scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, DEBOUNCE_MS);
  }

  /** Force-write all in-memory state to disk. Called on graceful shutdown. */
  public flush() {
    if (!this.dirty) return;
    try {
      fs.writeFileSync(
        STRATEGIES_FILE,
        JSON.stringify(Array.from(this.strategies.values()), null, 2),
      );
      fs.writeFileSync(
        HISTORY_FILE,
        JSON.stringify(this.history.slice(-MAX_HISTORY_ENTRIES), null, 2),
      );
      fs.writeFileSync(
        PNL_FILE,
        JSON.stringify(this.pnlSnapshots.slice(-MAX_PNL_SNAPSHOTS), null, 2),
      );
      this.dirty = false;
    } catch (err) {
      console.error("[Persistence] Flush failed:", err);
    }
  }

  // ============ Strategy records ============

  upsertStrategy(s: PersistedStrategy) {
    this.strategies.set(s.strategyId, s);
    this.scheduleSave();
  }

  getStrategy(strategyId: number): PersistedStrategy | undefined {
    return this.strategies.get(strategyId);
  }

  /** All strategies, newest first. */
  listStrategies(): PersistedStrategy[] {
    return Array.from(this.strategies.values()).sort((a, b) => b.deployedAt - a.deployedAt);
  }

  /** Strategies deployed by a given browser wallet. */
  listStrategiesByWallet(wallet: string): PersistedStrategy[] {
    const w = wallet.toLowerCase();
    return this.listStrategies().filter((s) => s.deployerWallet?.toLowerCase() === w);
  }

  removeStrategy(strategyId: number) {
    this.strategies.delete(strategyId);
    this.scheduleSave();
  }

  // ============ Evaluation history ============

  appendEvaluation(entry: any) {
    this.history.push(entry);
    if (this.history.length > MAX_HISTORY_ENTRIES * 2) {
      this.history = this.history.slice(-MAX_HISTORY_ENTRIES);
    }
    this.scheduleSave();
  }

  getHistory(): any[] {
    return this.history.slice();
  }

  /** Restore history into memory — used by AgentCoordinator on boot. */
  setHistory(h: any[]) {
    this.history = h.slice(-MAX_HISTORY_ENTRIES);
    this.scheduleSave();
  }

  // ============ PnL snapshots ============

  appendPnLSnapshot(snap: PnLSnapshot) {
    this.pnlSnapshots.push(snap);
    if (this.pnlSnapshots.length > MAX_PNL_SNAPSHOTS * 2) {
      this.pnlSnapshots = this.pnlSnapshots.slice(-MAX_PNL_SNAPSHOTS);
    }
    this.scheduleSave();
  }

  getPnLSnapshots(strategyId?: number): PnLSnapshot[] {
    if (strategyId === undefined) return this.pnlSnapshots.slice();
    return this.pnlSnapshots.filter((p) => p.strategyId === strategyId);
  }

  /** Per-wallet PnL: all snapshots whose strategy's deployerWallet matches. */
  getPnLSnapshotsByWallet(wallet: string): PnLSnapshot[] {
    const w = wallet.toLowerCase();
    const strategyIds = new Set(
      this.listStrategiesByWallet(w).map((s) => s.strategyId),
    );
    return this.pnlSnapshots.filter((p) => strategyIds.has(p.strategyId));
  }
}

// Singleton
let _instance: PersistenceService | null = null;
export function getPersistence(): PersistenceService {
  if (!_instance) _instance = new PersistenceService();
  return _instance;
}
