/**
 * PoolBrain Engine — Uniswap V3 Pool Analysis for X Layer
 *
 * Scans Uniswap V3 pools, analyzes liquidity distribution, computes fee APR
 * estimates, and recommends optimal tick ranges for LP positions.
 */

import { ethers, Contract, JsonRpcProvider, formatUnits } from "ethers";
import { config } from "../config";
import {
  getUniswapSkillsAdapter,
  LIQUIDITY_PLANNER_SKILL,
  PairType,
  UniswapRangeCandidate,
} from "../adapters/UniswapSkillsAdapter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendedRange {
  type: "wide" | "narrow" | "ultra_narrow";
  tickLower: number;
  tickUpper: number;
  priceRange: { lower: number; upper: number };
  allocationPercent: number;
  estimatedAPR: number;
  estimatedIL: number; // percent at max range edge
}

export interface PoolAnalysis {
  pool: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: number;
  currentTick: number;
  currentPrice: number;
  tvl: number;
  volume24h: number;
  feeAPR: number;
  tickSpacing: number;
  recommendedRanges: RecommendedRange[];
  reasoning: string;
}

export type RiskProfile = "conservative" | "moderate" | "aggressive";

// ---------------------------------------------------------------------------
// ABI fragments — only the functions we actually call
// ---------------------------------------------------------------------------

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function fee() external view returns (uint24)",
  "function tickSpacing() external view returns (int24)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
  "function observe(uint32[] calldata secondsAgos) external view returns (int56[] cumulativeTickValues, uint160[] secondsPerLiquidityCumulativeX128Values)",
];

const ERC20_ABI = [
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function balanceOf(address account) external view returns (uint256)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Uniswap V3 fee tiers in hundredths of a basis point. */
const FEE_TIERS: readonly number[] = [100, 500, 3000, 10000] as const;

/** Tick spacing per fee tier. */
const TICK_SPACING_MAP: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

/** Q96 constant used in sqrtPriceX96 math. */
const Q96 = 2n ** 96n;

/** Number of ticks to sample around the current tick for liquidity profiling. */
const TICK_SAMPLE_RADIUS = 20;

/** Seconds in 24 hours (for volume estimation). */
const SECONDS_24H = 86_400;

/** Seconds in one year. */
const SECONDS_1Y = 365.25 * 86_400;

// ---------------------------------------------------------------------------
// Helpers — tick / price math
// ---------------------------------------------------------------------------

/** Convert sqrtPriceX96 to a human-readable price (token1 per token0). */
function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number
): number {
  const numerator = Number(sqrtPriceX96) / Number(Q96);
  const rawPrice = numerator * numerator;
  return rawPrice * 10 ** (decimals0 - decimals1);
}

/**
 * Snap a tick value DOWN to the nearest multiple of tickSpacing.
 * Used by the liquidity profile sampler — range bounds are snapped inside
 * {@link UniswapSkillsAdapter.computeRangeCandidates}.
 */
function snapTickDown(tick: number, tickSpacing: number): number {
  return Math.floor(tick / tickSpacing) * tickSpacing;
}

/**
 * Estimate impermanent loss (IL) as a fraction for a given price move ratio.
 * Formula: IL = 2*sqrt(r) / (1+r) - 1  where r = pNew / pOld.
 * Returns a positive percentage value (e.g. 5.0 means 5%).
 */
function estimateImpermanentLoss(priceRatio: number): number {
  if (priceRatio <= 0) return 100;
  const sqrtR = Math.sqrt(priceRatio);
  const il = 2 * sqrtR / (1 + priceRatio) - 1;
  return Math.abs(il) * 100;
}

// ---------------------------------------------------------------------------
// PoolBrain
// ---------------------------------------------------------------------------

export class PoolBrain {
  private provider: JsonRpcProvider;
  private factory: Contract;

  constructor(rpcUrl?: string) {
    this.provider = new JsonRpcProvider(rpcUrl ?? config.rpcUrl);
    this.factory = new Contract(
      config.uniswapV3.factory,
      FACTORY_ABI,
      this.provider
    );
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Run a full analysis on a single pool.
   *
   * @param poolAddress - The Uniswap V3 pool contract address.
   * @param riskProfile - Risk tolerance used for range recommendations.
   * @returns A complete {@link PoolAnalysis}.
   */
  async analyze(
    poolAddress: string,
    riskProfile: RiskProfile = "moderate"
  ): Promise<PoolAnalysis> {
    const pool = new Contract(poolAddress, POOL_ABI, this.provider);

    // Fetch base pool state in parallel.
    const [slot0, liquidityRaw, feeRaw, tickSpacingRaw, token0Addr, token1Addr] =
      await Promise.all([
        pool.slot0(),
        pool.liquidity(),
        pool.fee(),
        pool.tickSpacing(),
        pool.token0(),
        pool.token1(),
      ]);

    const sqrtPriceX96: bigint = slot0[0];
    const currentTick: number = Number(slot0[1]);
    const feeTier: number = Number(feeRaw);
    const tickSpacing: number = Number(tickSpacingRaw);
    const globalLiquidity: bigint = liquidityRaw;

    // Token metadata
    const token0 = new Contract(token0Addr, ERC20_ABI, this.provider);
    const token1 = new Contract(token1Addr, ERC20_ABI, this.provider);

    const [symbol0, symbol1, decimals0, decimals1, balance0, balance1] =
      await Promise.all([
        token0.symbol() as Promise<string>,
        token1.symbol() as Promise<string>,
        token0.decimals().then(Number) as Promise<number>,
        token1.decimals().then(Number) as Promise<number>,
        token0.balanceOf(poolAddress) as Promise<bigint>,
        token1.balanceOf(poolAddress) as Promise<bigint>,
      ]);

    const currentPrice = sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1);

    // TVL: sum of token balances priced in token1 terms.
    const balance0Num = Number(formatUnits(balance0, decimals0));
    const balance1Num = Number(formatUnits(balance1, decimals1));
    const tvl = balance0Num * currentPrice + balance1Num;

    // Estimate 24h volume via tick TWAP observation.
    const volume24h = await this.estimateVolume24h(
      pool,
      tvl,
      feeTier,
      globalLiquidity
    );

    // Fee APR = (annualised fee revenue) / TVL
    const feeRate = feeTier / 1_000_000; // e.g. 3000 => 0.003
    const dailyFees = volume24h * feeRate;
    const annualFees = dailyFees * 365;
    const feeAPR = tvl > 0 ? (annualFees / tvl) * 100 : 0;

    // Liquidity profile around current tick.
    const liquidityProfile = await this.sampleLiquidityProfile(
      pool,
      currentTick,
      tickSpacing
    );

    // Classify the pair using the Uniswap liquidity-planner@0.2.0 methodology
    // so the range math (below) cites the same rule set the official skill
    // would use.
    const uniswapAdapter = getUniswapSkillsAdapter();
    const pairType: PairType = uniswapAdapter.classifyPairType(symbol0, symbol1);

    // Compute recommended ranges using the ported Uniswap skill methodology.
    const recommendedRanges = computeRecommendedRanges(
      currentPrice,
      feeAPR,
      decimals0,
      decimals1,
      riskProfile,
      feeTier,
      pairType
    );

    const reasoning = this.buildReasoning(
      symbol0,
      symbol1,
      currentPrice,
      feeAPR,
      tvl,
      volume24h,
      liquidityProfile,
      riskProfile,
      pairType
    );

    return {
      pool: poolAddress,
      token0: token0Addr,
      token1: token1Addr,
      token0Symbol: symbol0,
      token1Symbol: symbol1,
      feeTier,
      currentTick,
      currentPrice,
      tvl,
      volume24h,
      feeAPR,
      tickSpacing,
      recommendedRanges,
      reasoning,
    };
  }

  /**
   * Scan all known token pairs across fee tiers and return pool addresses that
   * are deployed (i.e. non-zero address).
   */
  async discoverPools(): Promise<
    { address: string; token0: string; token1: string; feeTier: number }[]
  > {
    const pairs: [string, string, string, string][] = [
      ["WOKB", "USDC", config.tokens.WOKB, config.tokens.USDC],
      ["WOKB", "WETH", config.tokens.WOKB, config.tokens.WETH],
    ];

    const queries: Promise<{
      address: string;
      token0: string;
      token1: string;
      feeTier: number;
    } | null>[] = [];

    for (const [, , tokenA, tokenB] of pairs) {
      for (const fee of FEE_TIERS) {
        queries.push(
          this.factory
            .getPool(tokenA, tokenB, fee)
            .then((addr: string) =>
              addr !== ethers.ZeroAddress
                ? { address: addr, token0: tokenA, token1: tokenB, feeTier: fee }
                : null
            )
            .catch(() => null)
        );
      }
    }

    const results = await Promise.all(queries);
    return results.filter(
      (r): r is NonNullable<typeof r> => r !== null
    );
  }

  /**
   * Analyse every discovered pool and return all results sorted by feeAPR
   * descending.
   */
  async analyzeAll(
    riskProfile: RiskProfile = "moderate"
  ): Promise<PoolAnalysis[]> {
    const pools = await this.discoverPools();
    const analyses = await Promise.all(
      pools.map((p) =>
        this.analyze(p.address, riskProfile).catch((err) => {
          console.error(
            `[PoolBrain] Failed to analyze pool ${p.address}: ${err}`
          );
          return null;
        })
      )
    );
    return analyses
      .filter((a): a is PoolAnalysis => a !== null)
      .sort((a, b) => b.feeAPR - a.feeAPR);
  }

  // -----------------------------------------------------------------------
  // Volume estimation
  // -----------------------------------------------------------------------

  /**
   * Estimate 24-hour volume using the oracle's tick movement as a volatility
   * proxy combined with TVL. Falls back to a liquidity-derived heuristic if
   * the oracle observation window is unavailable.
   *
   * Approach:
   *   1. Read two cumulative-tick observations 24 h apart (or the widest
   *      window available).
   *   2. Derive average absolute tick velocity => implied volatility.
   *   3. volume ~ TVL * volatility_factor * constant.
   *
   * This is an on-chain-only approximation. A production system should
   * supplement with subgraph or indexer data for precise volume.
   */
  private async estimateVolume24h(
    pool: Contract,
    tvl: number,
    feeTier: number,
    liquidity: bigint
  ): Promise<number> {
    try {
      // Try to observe ticks 24h ago and now.
      const secondsAgos = [SECONDS_24H, 0];
      const [cumulativeTicks]: [bigint[]] = await pool.observe(secondsAgos);
      const tickDelta = Math.abs(
        Number(cumulativeTicks[1] - cumulativeTicks[0])
      );
      const avgTickMove = tickDelta / SECONDS_24H;

      // Each tick is ~0.01% price change. Convert to daily volatility.
      const dailyVolatility = avgTickMove * 0.0001 * Math.sqrt(SECONDS_24H);

      // Heuristic: volume correlates with TVL * volatility.
      // The scaling factor is calibrated so that a 2% daily vol on a $1M pool
      // yields roughly $500k volume — comparable to typical Uni V3 pools.
      const volumeEstimate = tvl * dailyVolatility * 25;
      return Math.max(volumeEstimate, 0);
    } catch {
      // Oracle not available (insufficient observations). Fall back to a
      // simple heuristic: assume volume = multiple of TVL based on fee tier.
      // Lower fee tiers attract more volume relative to TVL.
      const volumeMultiplier: Record<number, number> = {
        100: 2.0,   // 1 bps pool — very high volume / TVL (stables)
        500: 0.8,   // 5 bps
        3000: 0.3,  // 30 bps — standard
        10000: 0.1, // 100 bps — exotic
      };
      const mult = volumeMultiplier[feeTier] ?? 0.3;
      return tvl * mult;
    }
  }

  // -----------------------------------------------------------------------
  // Liquidity profiling
  // -----------------------------------------------------------------------

  /**
   * Sample initialized ticks around the current tick to build a liquidity
   * density profile. Returns an array of { tick, liquidityNet } entries.
   */
  private async sampleLiquidityProfile(
    pool: Contract,
    currentTick: number,
    tickSpacing: number
  ): Promise<{ tick: number; liquidityNet: bigint }[]> {
    const centerTick = snapTickDown(currentTick, tickSpacing);
    const ticksToSample: number[] = [];

    for (let i = -TICK_SAMPLE_RADIUS; i <= TICK_SAMPLE_RADIUS; i++) {
      ticksToSample.push(centerTick + i * tickSpacing);
    }

    // Batch RPC calls. We use Promise.allSettled to tolerate individual
    // tick read failures (uninitialised ticks revert on some implementations).
    const results = await Promise.allSettled(
      ticksToSample.map(async (tick) => {
        const data = await pool.ticks(tick);
        return { tick, liquidityNet: BigInt(data[1]) };
      })
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<{ tick: number; liquidityNet: bigint }> =>
          r.status === "fulfilled" && r.value.liquidityNet !== 0n
      )
      .map((r) => r.value);
  }

  // -----------------------------------------------------------------------
  // Reasoning
  // -----------------------------------------------------------------------

  private buildReasoning(
    symbol0: string,
    symbol1: string,
    currentPrice: number,
    feeAPR: number,
    tvl: number,
    volume24h: number,
    liquidityProfile: { tick: number; liquidityNet: bigint }[],
    riskProfile: RiskProfile,
    pairType: PairType
  ): string {
    const activeLiquidityTicks = liquidityProfile.filter(
      (t) => t.liquidityNet > 0n
    ).length;
    const totalSampled = liquidityProfile.length;
    const concentrationRatio =
      totalSampled > 0
        ? ((activeLiquidityTicks / totalSampled) * 100).toFixed(1)
        : "N/A";

    const parts: string[] = [
      `Pool ${symbol0}/${symbol1} analysis (${riskProfile} profile, ${pairType} pair):`,
      `Current price: ${formatNum(currentPrice)} ${symbol1} per ${symbol0}.`,
      `TVL: $${formatNum(tvl)} | 24h volume (est.): $${formatNum(volume24h)} | Fee APR: ${feeAPR.toFixed(2)}%.`,
      `Liquidity concentration: ${concentrationRatio}% of sampled ticks have active liquidity (${activeLiquidityTicks}/${totalSampled}).`,
    ];

    if (feeAPR > 50) {
      parts.push(
        "High fee APR suggests strong volume relative to TVL — narrower ranges can capture outsized yields but face higher rebalance frequency."
      );
    } else if (feeAPR > 15) {
      parts.push(
        "Moderate fee APR. A balanced range width offers good risk/reward."
      );
    } else {
      parts.push(
        "Low fee APR. Consider wider ranges to minimize rebalancing costs, or evaluate whether this pool justifies active management."
      );
    }

    if (riskProfile === "aggressive") {
      parts.push(
        "Aggressive profile: ranges are tighter for maximum capital efficiency. Expect frequent rebalancing."
      );
    } else if (riskProfile === "conservative") {
      parts.push(
        "Conservative profile: wider ranges reduce rebalancing frequency and IL exposure."
      );
    }

    // Cite the upstream Uniswap methodology so on-chain audit logs can be
    // traced back to the exact skill version that produced the tick bounds.
    parts.push(
      `Range math via ${LIQUIDITY_PLANNER_SKILL.name}@${LIQUIDITY_PLANNER_SKILL.version} (${LIQUIDITY_PLANNER_SKILL.source}).`
    );

    // Tell the operator how the ranges are actually consumed downstream.
    // YieldAgent currently executes through OnchainOS `swap execute` (the V3
    // `defi invest` path routes through a permit-based Entrance contract that
    // is incompatible with direct EOA broadcast). So the ranges above are
    // used as **directional trigger bands**: when spot price crosses the
    // main range upper bound the agent sells the non-stable side back to
    // USDT; when it crosses below, the agent buys. This preserves the
    // mean-reversion thesis of concentrated LP without requiring the V3
    // position NFT, while keeping every tx signed inside the Agentic Wallet
    // TEE (anti-gaming guarantee for the Most Active On-Chain Agent prize).
    parts.push(
      "Execution mode: swap-based directional rebalance around these bands via OnchainOS `swap execute` (TEE-signed)."
    );

    return parts.join(" ");
  }
}

// ---------------------------------------------------------------------------
// Range recommendation engine
//
// Range math is delegated to `UniswapSkillsAdapter`, which is a verbatim port
// of the `liquidity-planner@0.2.0` Claude Code skill from Uniswap's official
// uniswap-ai repo. PoolBrain keeps only the parts that are truly pool-specific
// (APR / IL projection from on-chain TVL and volume, plus risk-profile
// allocation weights).
// ---------------------------------------------------------------------------

interface BandAllocation {
  type: RecommendedRange["type"];
  allocationPercent: number;
}

/**
 * Risk-profile → allocation weights. Width comes from the Uniswap skill;
 * this table only controls how the user's principal is split across the
 * narrow / mid / wide candidates the skill emits.
 */
const PROFILE_ALLOCATIONS: Record<RiskProfile, BandAllocation[]> = {
  conservative: [
    { type: "ultra_narrow", allocationPercent: 10 },
    { type: "narrow", allocationPercent: 30 },
    { type: "wide", allocationPercent: 60 },
  ],
  moderate: [
    { type: "ultra_narrow", allocationPercent: 25 },
    { type: "narrow", allocationPercent: 45 },
    { type: "wide", allocationPercent: 30 },
  ],
  aggressive: [
    { type: "ultra_narrow", allocationPercent: 50 },
    { type: "narrow", allocationPercent: 35 },
    { type: "wide", allocationPercent: 15 },
  ],
};

/**
 * Compute recommended ranges for a given risk profile, using the Uniswap
 * `liquidity-planner@0.2.0` methodology for tick bounds and PoolBrain's
 * on-chain stats for APR / IL projection.
 *
 * Flow:
 *   1. Ask {@link UniswapSkillsAdapter.computeRangeCandidates} for three
 *      candidates (narrow / mid / wide) derived from the pair type + fee
 *      tier (ported verbatim from the skill's Step 6 width table).
 *   2. Map each candidate to one of PoolBrain's bands, preserving the
 *      existing `RecommendedRange` shape so downstream consumers (frontend,
 *      AgentCoordinator) don't need to change.
 *   3. Attach risk-profile-aware allocation weights.
 *   4. Estimate APR boost from capital concentration and IL at the range
 *      edge using the snapped tick bounds emitted by the adapter.
 */
function computeRecommendedRanges(
  currentPrice: number,
  poolFeeAPR: number,
  decimals0: number,
  decimals1: number,
  riskProfile: RiskProfile,
  feeTier: number,
  pairType: PairType
): RecommendedRange[] {
  const adapter = getUniswapSkillsAdapter();
  const candidates = adapter.computeRangeCandidates({
    pairType,
    currentPrice,
    feeAmount: feeTier,
    decimals0,
    decimals1,
  });

  if (candidates.length === 0) {
    return [];
  }

  // candidates[] is ordered narrow → wide.
  // Map to PoolBrain's three bands. If the adapter ever returns fewer
  // candidates we fall back to whichever candidate exists.
  const narrowIdx = 0;
  const midIdx = Math.min(1, candidates.length - 1);
  const wideIdx = candidates.length - 1;

  const bandMap: Array<{
    candidate: UniswapRangeCandidate;
    type: RecommendedRange["type"];
  }> = [
    { candidate: candidates[narrowIdx], type: "ultra_narrow" },
    { candidate: candidates[midIdx], type: "narrow" },
    { candidate: candidates[wideIdx], type: "wide" },
  ];

  // Use the widest candidate as the "full range" reference for concentration
  // math. This keeps the APR projection proportional to how tight the range
  // is within the skill's own candidate set, rather than relative to an
  // arbitrary multiplier of tickSpacing.
  const widestWidth =
    candidates[wideIdx].tickUpper - candidates[wideIdx].tickLower;

  const allocations = PROFILE_ALLOCATIONS[riskProfile];

  return bandMap.map(({ candidate, type }) => {
    const allocation =
      allocations.find((a) => a.type === type)?.allocationPercent ?? 0;

    const rangeWidth = candidate.tickUpper - candidate.tickLower;

    // Capital efficiency multiplier: narrower range → more fees per dollar.
    // Capped at 20x to match the previous PoolBrain ceiling.
    const concentrationMultiplier =
      rangeWidth > 0 && widestWidth > 0
        ? Math.min(widestWidth / rangeWidth, 20)
        : 1;

    // Approximate time-in-range as sqrt(rangeWidth / widest). Narrower
    // ranges are less likely to stay active.
    const timeInRange =
      widestWidth > 0
        ? Math.min(1, 0.95 * Math.sqrt(rangeWidth / widestWidth))
        : 0.95;

    const estimatedAPR = poolFeeAPR * concentrationMultiplier * timeInRange;

    // IL at the range edge: compute IL if price moves from center to the
    // farther edge, using the skill's snapped prices.
    const edgeRatioLower =
      currentPrice > 0 ? candidate.minPrice / currentPrice : 1;
    const edgeRatioUpper =
      currentPrice > 0 ? candidate.maxPrice / currentPrice : 1;
    const worstRatio =
      Math.abs(edgeRatioLower - 1) > Math.abs(edgeRatioUpper - 1)
        ? edgeRatioLower
        : edgeRatioUpper;
    const estimatedIL = estimateImpermanentLoss(worstRatio);

    return {
      type,
      tickLower: candidate.tickLower,
      tickUpper: candidate.tickUpper,
      priceRange: {
        lower: candidate.minPrice,
        upper: candidate.maxPrice,
      },
      allocationPercent: allocation,
      estimatedAPR: round2(estimatedAPR),
      estimatedIL: round2(estimatedIL),
    };
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(4);
}

/**
 * Standalone helper: compute recommended tick ranges for a given price,
 * fee tier, and risk profile without needing to run the full analysis.
 * Useful for quick what-if calculations.
 *
 * Range math is delegated to `UniswapSkillsAdapter` — same methodology the
 * `liquidity-planner@0.2.0` skill uses, ported verbatim.
 */
export function computeRangesForPrice(
  price: number,
  _tickSpacing: number,
  decimals0: number,
  decimals1: number,
  feeAPR: number,
  riskProfile: RiskProfile,
  feeTier: number = 3000,
  pairType: PairType = "major"
): RecommendedRange[] {
  return computeRecommendedRanges(
    price,
    feeAPR,
    decimals0,
    decimals1,
    riskProfile,
    feeTier,
    pairType
  );
}
