import { Contract, EventLog, JsonRpcProvider } from "ethers";
import { config } from "../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarketAnalysis {
  currentPrice: number;
  priceChange1h: number;
  priceChange24h: number;
  volatility: number;
  marketState: "trending_up" | "trending_down" | "ranging" | "high_volatility";
  trendStrength: number;
  reasoning: string;
}

interface PriceSnapshot {
  price: number;
  timestamp: number; // unix ms
}

interface WhaleEvent {
  txHash: string;
  amountUsd: number;
  direction: "buy" | "sell";
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Minimal ABIs
// ---------------------------------------------------------------------------

const POOL_ABI = [
  // slot0 returns the current price state
  "function slot0() external view returns ("
    + "uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, "
    + "uint16 observationCardinality, uint16 observationCardinalityNext, "
    + "uint8 feeProtocol, bool unlocked)",

  // observe lets us query historical cumulative tick values
  "function observe(uint32[] calldata secondsAgos) external view returns ("
    + "int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)",

  // token ordering — needed to orient the price
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",

  // Swap event for whale detection
  "event Swap(address indexed sender, address indexed recipient, "
    + "int256 amount0, int256 amount1, uint160 sqrtPriceX96, "
    + "uint128 liquidity, int24 tick)",
] as const;

const ERC20_ABI = [
  "function decimals() external view returns (uint8)",
] as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const Q96 = 2n ** 96n;

/** Thresholds (all in percentage) */
const TREND_THRESHOLD = 0.5;        // >0.5 % move in 1 h = trending
const HIGH_VOL_THRESHOLD = 3.0;     // >3 % ATR-like vol = high volatility
const RANGING_TREND_CAP = 0.3;      // <0.3 % = ranging
const WHALE_USD_THRESHOLD = 10_000; // swaps > $10 k are "whale" on X Layer

/** How many snapshots we keep in the ring buffer (one per evaluation). */
const MAX_HISTORY_LEN = 2016; // ~7 days at 5-minute intervals

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Uniswap V3 sqrtPriceX96 into a human-readable price ratio,
 * properly adjusted for the decimals of token0 and token1.
 *
 *   price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
 *
 * The returned value is expressed as "how many token1 per 1 token0".
 */
function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): number {
  // Work in floating point after we have extracted the ratio to avoid
  // precision loss from enormous BigInt exponents.
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const rawPrice = sqrtPrice * sqrtPrice;
  const decimalAdjustment = 10 ** (decimals0 - decimals1);
  return rawPrice * decimalAdjustment;
}

/**
 * Derive an approximate tick-based price from the Uniswap tick.
 *   price = 1.0001^tick  (before decimal adjustment)
 */
function tickToPrice(tick: number, decimals0: number, decimals1: number): number {
  const rawPrice = 1.0001 ** tick;
  return rawPrice * 10 ** (decimals0 - decimals1);
}

/**
 * Percentage change helper.  Returns `NaN` when `base` is zero.
 */
function pctChange(current: number, base: number): number {
  if (base === 0) return NaN;
  return ((current - base) / base) * 100;
}

/**
 * Clamp a number to a given range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// MarketBrain
// ---------------------------------------------------------------------------

export class MarketBrain {
  private provider: JsonRpcProvider;

  /**
   * In-memory price history keyed by pool address (lower-cased).
   * Each entry is ordered oldest-first.
   */
  private history: Map<string, PriceSnapshot[]> = new Map();

  /** Recent whale-sized swap events per pool. */
  private whaleEvents: Map<string, WhaleEvent[]> = new Map();

  /** Cache of ERC-20 decimals so we only fetch once per token. */
  private decimalsCache: Map<string, number> = new Map();

  constructor() {
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Run a full market analysis for a Uniswap V3 pool.
   *
   * The method:
   *   1. Reads current price from slot0.
   *   2. Attempts to derive historical prices via the pool's `observe` oracle.
   *   3. Falls back to the internal price buffer when on-chain history is
   *      insufficient (common for low-cardinality pools).
   *   4. Scans recent Swap events for whale activity.
   *   5. Classifies the market state and returns a full MarketAnalysis.
   */
  async analyze(poolAddress: string): Promise<MarketAnalysis> {
    const pool = new Contract(poolAddress, POOL_ABI, this.provider);
    const key = poolAddress.toLowerCase();

    // -- 1. Current price ---------------------------------------------------
    const [slot0Result, token0Addr, token1Addr] = await Promise.all([
      pool.slot0(),
      pool.token0() as Promise<string>,
      pool.token1() as Promise<string>,
    ]);

    const sqrtPriceX96: bigint = slot0Result[0];
    const observationCardinality: number = Number(slot0Result[3]);

    const [decimals0, decimals1] = await Promise.all([
      this.getDecimals(token0Addr),
      this.getDecimals(token1Addr),
    ]);

    const currentPrice = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);
    const now = Date.now();

    // Push into history buffer
    this.pushSnapshot(key, { price: currentPrice, timestamp: now });

    // -- 2. Historical prices via on-chain oracle ---------------------------
    let price1hAgo: number | null = null;
    let price24hAgo: number | null = null;
    let oraclePrices: number[] = []; // for volatility from oracle

    const SECONDS_1H = 3600;

    // We request multiple observation points for a richer volatility estimate.
    // 24 points at 1-hour intervals covering the last 24 h.
    const observeSeconds: number[] = [];
    for (let i = 0; i <= 24; i++) {
      observeSeconds.push(i * SECONDS_1H);
    }

    if (observationCardinality > 1) {
      try {
        const [tickCumulatives] = await pool.observe(
          observeSeconds.map((s) => s),
        );

        // Convert cumulative ticks into time-weighted average prices.
        // TWAP between interval [i] and [i+1]:
        //   avgTick = (cumTick[i] - cumTick[i+1]) / (seconds[i+1] - seconds[i])
        //
        // Note: secondsAgos are sorted 0..N meaning index 0 = now,
        //       index N = furthest in the past.  tickCumulatives follow
        //       the same ordering.
        for (let i = 0; i < observeSeconds.length - 1; i++) {
          const dt = observeSeconds[i + 1] - observeSeconds[i];
          if (dt === 0) continue;
          const tickDiff =
            Number(tickCumulatives[i + 1]) - Number(tickCumulatives[i]);
          const avgTick = Math.round(tickDiff / dt);
          oraclePrices.push(tickToPrice(avgTick, decimals0, decimals1));
        }

        // oraclePrices[0] ~ now, oraclePrices[last] ~ 24 h ago
        if (oraclePrices.length >= 1) price1hAgo = oraclePrices[0]; // ~1 h TWAP
        if (oraclePrices.length >= 24) price24hAgo = oraclePrices[23];
      } catch {
        // Oracle may revert if cardinality is too low for the requested
        // window.  Fall through to buffer-based estimation.
      }
    }

    // -- 3. Fall back to buffer history if oracle was insufficient -----------
    const history = this.getHistory(key);

    if (price1hAgo === null) {
      price1hAgo = this.priceAtAgo(history, now, 60 * 60 * 1000);
    }
    if (price24hAgo === null) {
      price24hAgo = this.priceAtAgo(history, now, 24 * 60 * 60 * 1000);
    }

    const priceChange1h = price1hAgo !== null ? pctChange(currentPrice, price1hAgo) : 0;
    const priceChange24h = price24hAgo !== null ? pctChange(currentPrice, price24hAgo) : 0;

    // -- 4. Volatility (ATR-like) -------------------------------------------
    const volatility = this.computeVolatility(oraclePrices, history);

    // -- 5. Whale detection -------------------------------------------------
    await this.scanWhaleSwaps(pool, key, currentPrice, decimals0, decimals1);
    const recentWhales = this.recentWhaleEvents(key, now, 60 * 60 * 1000);

    // -- 6. Classify market state -------------------------------------------
    const { state, strength, reasoning } = this.classify(
      priceChange1h,
      priceChange24h,
      volatility,
      recentWhales,
    );

    return {
      currentPrice,
      priceChange1h: roundTo(priceChange1h, 4),
      priceChange24h: roundTo(priceChange24h, 4),
      volatility: roundTo(volatility, 4),
      marketState: state,
      trendStrength: Math.round(strength),
      reasoning,
    };
  }

  // -----------------------------------------------------------------------
  // Price history buffer
  // -----------------------------------------------------------------------

  private pushSnapshot(key: string, snap: PriceSnapshot): void {
    let arr = this.history.get(key);
    if (!arr) {
      arr = [];
      this.history.set(key, arr);
    }
    arr.push(snap);
    // Trim oldest entries when we exceed the ring buffer limit.
    if (arr.length > MAX_HISTORY_LEN) {
      arr.splice(0, arr.length - MAX_HISTORY_LEN);
    }
  }

  private getHistory(key: string): PriceSnapshot[] {
    return this.history.get(key) ?? [];
  }

  /**
   * Find the closest snapshot to `(now - agoMs)` in the buffer.
   * Returns `null` when the buffer has no data old enough.
   */
  private priceAtAgo(
    history: PriceSnapshot[],
    now: number,
    agoMs: number,
  ): number | null {
    const target = now - agoMs;
    if (history.length === 0) return null;
    // If the oldest snapshot is still more recent than target, we have no data.
    if (history[0].timestamp > target) return null;

    // Binary search for the closest entry.
    let lo = 0;
    let hi = history.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (history[mid].timestamp <= target) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return history[lo].price;
  }

  // -----------------------------------------------------------------------
  // Volatility
  // -----------------------------------------------------------------------

  /**
   * Compute an ATR-like volatility measure.
   *
   * When we have on-chain oracle prices (hourly TWAPs) we use those; otherwise
   * we fall back to the in-memory buffer.  The volatility is expressed as a
   * percentage of the mean price over the sample window.
   *
   * ATR-like:  mean( |p[i] - p[i-1]| ) / mean(p) * 100
   */
  private computeVolatility(
    oraclePrices: number[],
    bufferHistory: PriceSnapshot[],
  ): number {
    // Prefer oracle prices when we have at least a few data points.
    let prices: number[];
    if (oraclePrices.length >= 4) {
      prices = oraclePrices;
    } else if (bufferHistory.length >= 4) {
      prices = bufferHistory.map((s) => s.price);
    } else {
      return 0; // not enough data
    }

    let sumAbsDiff = 0;
    let sumPrice = 0;
    for (let i = 1; i < prices.length; i++) {
      sumAbsDiff += Math.abs(prices[i] - prices[i - 1]);
      sumPrice += prices[i];
    }
    sumPrice += prices[0];

    const meanAbsDiff = sumAbsDiff / (prices.length - 1);
    const meanPrice = sumPrice / prices.length;

    if (meanPrice === 0) return 0;
    return (meanAbsDiff / meanPrice) * 100;
  }

  // -----------------------------------------------------------------------
  // Whale / large-transaction scanner
  // -----------------------------------------------------------------------

  /**
   * Query recent Swap events on the pool contract and record any swaps
   * that exceed the whale threshold.
   *
   * We look back a modest number of blocks (~300, roughly 10 minutes on
   * X Layer at ~2 s block time) to keep RPC load reasonable.
   */
  private async scanWhaleSwaps(
    pool: Contract,
    key: string,
    currentPrice: number,
    decimals0: number,
    decimals1: number,
  ): Promise<void> {
    try {
      const latestBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 300);

      const swapFilter = pool.filters.Swap();
      const logs = await pool.queryFilter(swapFilter, fromBlock, latestBlock);

      const events: WhaleEvent[] = [];

      for (const log of logs) {
        if (!("args" in log)) continue;
        const args = (log as EventLog).args;
        const amount0 = BigInt(args[2]);
        const amount1 = BigInt(args[3]);

        // Estimate USD value from the token amounts.
        // Positive amount0 = pool received token0 (user sold token0).
        const abs0 = amount0 < 0n ? -amount0 : amount0;
        const abs1 = amount1 < 0n ? -amount1 : amount1;

        // Use token1 value if it looks like a stablecoin (6 decimals),
        // otherwise derive from token0 * currentPrice.
        let usdEstimate: number;
        if (decimals1 === 6) {
          usdEstimate = Number(abs1) / 10 ** decimals1;
        } else if (decimals0 === 6) {
          usdEstimate = Number(abs0) / 10 ** decimals0;
        } else {
          // Neither is a stablecoin -- estimate via price.
          usdEstimate =
            (Number(abs0) / 10 ** decimals0) * currentPrice;
        }

        if (usdEstimate >= WHALE_USD_THRESHOLD) {
          // direction: if pool receives token0 (amount0 > 0), that is a
          //            sell of token0 (buy of token1).
          const direction: "buy" | "sell" = amount0 > 0n ? "sell" : "buy";
          events.push({
            txHash: log.transactionHash,
            amountUsd: usdEstimate,
            direction,
            timestamp: Date.now(), // block timestamp would be better but costs extra RPC calls
          });
        }
      }

      // Merge into existing whale events, de-duplicate by txHash.
      const existing = this.whaleEvents.get(key) ?? [];
      const knownTxs = new Set(existing.map((e) => e.txHash));
      for (const ev of events) {
        if (!knownTxs.has(ev.txHash)) {
          existing.push(ev);
          knownTxs.add(ev.txHash);
        }
      }

      // Prune events older than 24 h.
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      this.whaleEvents.set(
        key,
        existing.filter((e) => e.timestamp >= cutoff),
      );
    } catch {
      // Non-critical: if event scanning fails (e.g. RPC limits) we
      // simply proceed without whale data.
    }
  }

  private recentWhaleEvents(
    key: string,
    now: number,
    windowMs: number,
  ): WhaleEvent[] {
    const all = this.whaleEvents.get(key) ?? [];
    const cutoff = now - windowMs;
    return all.filter((e) => e.timestamp >= cutoff);
  }

  // -----------------------------------------------------------------------
  // Decimals cache
  // -----------------------------------------------------------------------

  private async getDecimals(tokenAddress: string): Promise<number> {
    const addr = tokenAddress.toLowerCase();
    const cached = this.decimalsCache.get(addr);
    if (cached !== undefined) return cached;

    try {
      const token = new Contract(tokenAddress, ERC20_ABI, this.provider);
      const decimals: number = Number(await token.decimals());
      this.decimalsCache.set(addr, decimals);
      return decimals;
    } catch {
      // Default to 18 if the call fails (e.g. non-standard token).
      this.decimalsCache.set(addr, 18);
      return 18;
    }
  }

  // -----------------------------------------------------------------------
  // Classification
  // -----------------------------------------------------------------------

  private classify(
    change1h: number,
    change24h: number,
    volatility: number,
    whaleEvents: WhaleEvent[],
  ): {
    state: MarketAnalysis["marketState"];
    strength: number;
    reasoning: string;
  } {
    const reasons: string[] = [];

    // -- High volatility overrides other states when extreme ----------------
    if (volatility >= HIGH_VOL_THRESHOLD) {
      const strength = clamp(
        ((volatility - HIGH_VOL_THRESHOLD) / HIGH_VOL_THRESHOLD) * 100,
        50,
        100,
      );
      reasons.push(
        `Volatility is elevated at ${volatility.toFixed(2)}% (threshold: ${HIGH_VOL_THRESHOLD}%).`,
      );
      if (whaleEvents.length > 0) {
        reasons.push(
          `${whaleEvents.length} whale swap(s) detected in the last hour, likely contributing to volatility.`,
        );
      }
      return {
        state: "high_volatility",
        strength,
        reasoning: reasons.join(" "),
      };
    }

    // -- Trending -----------------------------------------------------------
    if (Math.abs(change1h) >= TREND_THRESHOLD) {
      const direction = change1h > 0 ? "trending_up" : "trending_down";
      // Strength: map the 1 h change magnitude into 0-100.
      // A 2 % move in 1 h is considered strong (100).
      const rawStrength = (Math.abs(change1h) / 2) * 100;
      const strength = clamp(rawStrength, 20, 100);

      const dirLabel = direction === "trending_up" ? "upward" : "downward";
      reasons.push(
        `Price moved ${change1h > 0 ? "+" : ""}${change1h.toFixed(2)}% in the last hour, indicating an ${dirLabel} trend.`,
      );
      if (Math.abs(change24h) >= 1) {
        reasons.push(
          `24 h change of ${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}% reinforces the ${dirLabel} bias.`,
        );
      }
      if (whaleEvents.length > 0) {
        const netDirection =
          whaleEvents.filter((e) => e.direction === "buy").length >
          whaleEvents.filter((e) => e.direction === "sell").length
            ? "buy"
            : "sell";
        reasons.push(
          `Whale activity is net-${netDirection} (${whaleEvents.length} large swap(s)).`,
        );
      }
      return { state: direction, strength, reasoning: reasons.join(" ") };
    }

    // -- Ranging (default) --------------------------------------------------
    const strength = clamp(
      ((RANGING_TREND_CAP - Math.abs(change1h)) / RANGING_TREND_CAP) * 60 +
        20,
      20,
      80,
    );
    reasons.push(
      `Price is relatively stable with a 1 h change of ${change1h > 0 ? "+" : ""}${change1h.toFixed(2)}% and volatility at ${volatility.toFixed(2)}%.`,
    );
    reasons.push("Market appears to be ranging -- suited for tighter LP ranges.");

    if (whaleEvents.length > 0) {
      reasons.push(
        `Note: ${whaleEvents.length} whale-sized swap(s) in the last hour; watch for a breakout.`,
      );
    }

    return { state: "ranging", strength, reasoning: reasons.join(" ") };
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
