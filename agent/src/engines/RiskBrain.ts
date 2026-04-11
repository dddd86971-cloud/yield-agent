// ============================================================================
// RiskBrain - Pure-computation risk engine for Uniswap V3 LP positions
// ============================================================================
//
// Evaluates impermanent loss, drawdown risk, position concentration, and
// emergency-exit conditions. Every method is deterministic and requires no
// RPC calls - feed it ticks and it returns numbers.
//
// Uniswap V3 tick math refresher used throughout:
//   price = 1.0001^tick
//   sqrtPrice = 1.0001^(tick/2)
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskProfile = "conservative" | "moderate" | "aggressive";

export interface RiskParams {
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  entryTick: number;
  positionValueUSD: number;
  riskProfile: RiskProfile;
}

export interface RiskAnalysis {
  /** Realised impermanent loss as a fraction (e.g. 0.03 = 3 %). */
  impermanentLoss: number;
  /** IL if price moves to the nearest range boundary. */
  maxPotentialIL: number;
  /** 0-100: 100 means price is perfectly centred in the range. */
  positionHealthPercent: number;
  /** Whether the current price is inside [tickLower, tickUpper]. */
  isInRange: boolean;
  /** Where in the range the price sits (0 = lower edge, 100 = upper edge). */
  pricePositionPercent: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  emergencyExitTriggered: boolean;
  reasoning: string;
}

export interface RebalanceCheckParams {
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  /** Annualised volatility (decimal), e.g. 0.80 = 80 %. */
  volatility: number;
  /** Descriptive label from MarketBrain (e.g. "trending_up"). */
  marketState: string;
  riskProfile: RiskProfile;
  /** Fraction of half-range at which we trigger a rebalance (e.g. 0.75). */
  rebalanceThreshold: number;
}

export interface RebalanceDecision {
  shouldRebalance: boolean;
  urgency: "none" | "low" | "medium" | "high" | "critical";
  suggestedAction:
    | "hold"
    | "rebalance"
    | "narrow"
    | "widen"
    | "shift_up"
    | "shift_down"
    | "emergency_exit";
  /** 0-100 confidence score. */
  confidence: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Per-profile thresholds
// ---------------------------------------------------------------------------

interface ProfileThresholds {
  /** Maximum acceptable IL before we consider the position unhealthy. */
  maxIL: number;
  /** Fraction of half-range before we suggest rebalance (0-1). */
  rebalanceEdgeFraction: number;
  /** IL level that triggers an emergency exit. */
  emergencyIL: number;
}

const PROFILE_THRESHOLDS: Record<RiskProfile, ProfileThresholds> = {
  conservative: { maxIL: 0.02, rebalanceEdgeFraction: 0.65, emergencyIL: 0.05 },
  moderate:     { maxIL: 0.05, rebalanceEdgeFraction: 0.75, emergencyIL: 0.10 },
  aggressive:   { maxIL: 0.15, rebalanceEdgeFraction: 0.85, emergencyIL: 0.20 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a tick to its corresponding sqrtPrice (= 1.0001^(tick/2)). */
function tickToSqrtPrice(tick: number): number {
  return Math.pow(1.0001, tick / 2);
}

/**
 * Clamp `value` into [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Standard Uniswap V3 impermanent loss for a concentrated liquidity position.
 *
 * For a position with range [pa, pb] entered at price p0 and now at price p1,
 * the value ratio vs. simply holding is:
 *
 *   V_lp / V_hold
 *
 * IL = 1 - (V_lp / V_hold)
 *
 * When the current price is inside the range:
 *   V_lp  ~ 2 * sqrt(p1) - p1/sqrt(pb) - sqrt(pa)
 *   V_hold = (token0_at_entry * p1) + token1_at_entry
 *
 * We normalise with L = 1 and compute the ratio directly.
 */
function computeConcentratedIL(
  sqrtPa: number,
  sqrtPb: number,
  sqrtP0: number,
  sqrtP1: number,
): number {
  // --- value of the LP position at the current price (per unit liquidity) ---
  // Clamp both entry and current sqrtPrice to the range boundaries.
  const clampedSqrt0 = clamp(sqrtP0, sqrtPa, sqrtPb);
  const clampedSqrt1 = clamp(sqrtP1, sqrtPa, sqrtPb);

  // Token amounts per unit liquidity at entry:
  //   x0 = 1/clampedSqrt0 - 1/sqrtPb
  //   y0 = clampedSqrt0 - sqrtPa
  const x0 = 1 / clampedSqrt0 - 1 / sqrtPb;
  const y0 = clampedSqrt0 - sqrtPa;

  // Token amounts per unit liquidity now:
  //   x1 = 1/clampedSqrt1 - 1/sqrtPb
  //   y1 = clampedSqrt1 - sqrtPa
  const x1 = 1 / clampedSqrt1 - 1 / sqrtPb;
  const y1 = clampedSqrt1 - sqrtPa;

  const p1 = sqrtP1 * sqrtP1; // current price

  // Value of LP now (in token1 terms)
  const vLP = x1 * p1 + y1;
  // Value of simply holding the initial tokens (in token1 terms)
  const vHold = x0 * p1 + y0;

  if (vHold <= 0) {
    return 0;
  }

  const ratio = vLP / vHold;
  // IL is the loss: 1 - ratio.  Can be slightly negative due to float; clamp.
  return Math.max(0, 1 - ratio);
}

// ---------------------------------------------------------------------------
// RiskBrain
// ---------------------------------------------------------------------------

export class RiskBrain {
  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Full risk analysis for a single LP position.
   */
  analyze(params: RiskParams): RiskAnalysis {
    const {
      tickLower,
      tickUpper,
      currentTick,
      entryTick,
      positionValueUSD,
      riskProfile,
    } = params;

    const thresholds = PROFILE_THRESHOLDS[riskProfile];

    // 1. Where in the range is the current price?
    const rangeWidth = tickUpper - tickLower;
    const rawPosition = (currentTick - tickLower) / rangeWidth;
    const pricePositionPercent = clamp(rawPosition * 100, 0, 100);
    const isInRange = currentTick >= tickLower && currentTick <= tickUpper;

    // 2. Position health: 100 when centred, falling toward 0 at edges or out
    //    of range.
    const distFromCentre = Math.abs(rawPosition - 0.5); // 0 = centre, 0.5 = edge
    const positionHealthPercent = isInRange
      ? clamp(Math.round((1 - distFromCentre * 2) * 100), 0, 100)
      : 0;

    // 3. Impermanent loss
    const impermanentLoss = this.calculateIL(tickLower, tickUpper, currentTick, entryTick);

    // 4. Max potential IL: price moves to whichever range edge is closer
    const worstEdgeTick = rawPosition >= 0.5 ? tickUpper : tickLower;
    const maxPotentialIL = this.calculateIL(tickLower, tickUpper, worstEdgeTick, entryTick);

    // 5. Risk level & emergency
    const { riskLevel, emergencyExitTriggered } = this.classifyRisk(
      impermanentLoss,
      pricePositionPercent,
      isInRange,
      positionValueUSD,
      thresholds,
    );

    // 6. Build human-readable reasoning
    const reasoning = this.buildAnalysisReasoning(
      impermanentLoss,
      maxPotentialIL,
      pricePositionPercent,
      isInRange,
      riskLevel,
      emergencyExitTriggered,
      riskProfile,
      positionValueUSD,
    );

    return {
      impermanentLoss,
      maxPotentialIL,
      positionHealthPercent,
      isInRange,
      pricePositionPercent: Math.round(pricePositionPercent * 100) / 100,
      riskLevel,
      emergencyExitTriggered,
      reasoning,
    };
  }

  /**
   * Determine whether a rebalance is advisable right now.
   */
  shouldRebalance(params: RebalanceCheckParams): RebalanceDecision {
    const {
      tickLower,
      tickUpper,
      currentTick,
      volatility,
      marketState,
      riskProfile,
      rebalanceThreshold,
    } = params;

    const thresholds = PROFILE_THRESHOLDS[riskProfile];

    const rangeWidth = tickUpper - tickLower;
    const rawPosition = (currentTick - tickLower) / rangeWidth; // 0-1
    const distFromEdge = Math.min(rawPosition, 1 - rawPosition); // 0 at edge, 0.5 at centre

    const isInRange = currentTick >= tickLower && currentTick <= tickUpper;
    const isOutOfRange = !isInRange;

    // Effective rebalance edge fraction: take the tighter of the param and
    // the profile default.
    const effectiveEdgeFraction = Math.min(
      rebalanceThreshold,
      thresholds.rebalanceEdgeFraction,
    );

    // ---- Out-of-range: always rebalance, urgency depends on how far out ----
    if (isOutOfRange) {
      const ticksBeyond = currentTick < tickLower
        ? tickLower - currentTick
        : currentTick - tickUpper;
      const fractionBeyond = ticksBeyond / rangeWidth;

      if (fractionBeyond > 0.5) {
        return {
          shouldRebalance: true,
          urgency: "critical",
          suggestedAction: "emergency_exit",
          confidence: 95,
          reasoning:
            `Price is ${(fractionBeyond * 100).toFixed(1)}% of range width beyond ` +
            `the boundary. Position is earning zero fees and suffering maximum IL. ` +
            `Emergency exit recommended.`,
        };
      }

      const direction = currentTick < tickLower ? "shift_down" : "shift_up";
      return {
        shouldRebalance: true,
        urgency: fractionBeyond > 0.25 ? "high" : "medium",
        suggestedAction: direction,
        confidence: 85,
        reasoning:
          `Price has moved out of range (${(fractionBeyond * 100).toFixed(1)}% beyond ` +
          `boundary). Position is not earning fees. Suggest ${direction.replace("_", " ")} ` +
          `to re-centre around current price.`,
      };
    }

    // ---- In range: check edge proximity ----
    // distFromEdge < (1 - effectiveEdgeFraction) / 2 means we're beyond the
    // threshold toward an edge.
    const edgeProximityTrigger = (1 - effectiveEdgeFraction) / 2;
    const pastThreshold = distFromEdge < edgeProximityTrigger;

    // Volatility adjustment: high vol in a trending market makes narrow ranges
    // riskier.
    const isTrending =
      marketState.includes("trending") ||
      marketState.includes("breakout");
    const isHighVol = volatility > 0.8;
    const volAdjustedPastThreshold =
      pastThreshold || (isHighVol && isTrending && distFromEdge < edgeProximityTrigger * 1.5);

    if (!volAdjustedPastThreshold) {
      // Price is comfortably within range.
      // Still check: should we narrow for more fee income in low-vol?
      if (volatility < 0.3 && distFromEdge > 0.35) {
        return {
          shouldRebalance: false,
          urgency: "low",
          suggestedAction: "narrow",
          confidence: 55,
          reasoning:
            `Price is well-centred and volatility is low (${(volatility * 100).toFixed(0)}%). ` +
            `Narrowing the range could increase fee capture. Not urgent.`,
        };
      }

      return {
        shouldRebalance: false,
        urgency: "none",
        suggestedAction: "hold",
        confidence: 90,
        reasoning:
          `Price is at ${(rawPosition * 100).toFixed(1)}% of range ` +
          `(${(distFromEdge * 100).toFixed(1)}% from nearest edge). ` +
          `Within comfortable bounds for ${riskProfile} profile. Hold.`,
      };
    }

    // ---- Past threshold: decide action & urgency ----
    const urgency = this.computeUrgency(distFromEdge, edgeProximityTrigger, isHighVol, isTrending);
    const suggestedAction = this.suggestAction(
      rawPosition,
      volatility,
      marketState,
      riskProfile,
    );

    const confidence = this.computeRebalanceConfidence(
      distFromEdge,
      edgeProximityTrigger,
      volatility,
      isTrending,
    );

    const reasoning = this.buildRebalanceReasoning(
      rawPosition,
      distFromEdge,
      edgeProximityTrigger,
      volatility,
      marketState,
      suggestedAction,
      riskProfile,
    );

    return {
      shouldRebalance: true,
      urgency,
      suggestedAction,
      confidence,
      reasoning,
    };
  }

  /**
   * Calculate impermanent loss for a concentrated-liquidity position.
   *
   * @param tickLower  Lower tick of the range.
   * @param tickUpper  Upper tick of the range.
   * @param currentTick  Tick corresponding to the current pool price.
   * @param entryTick  Tick at which the position was opened.
   * @returns IL as a non-negative fraction (0.03 = 3 %).
   */
  calculateIL(
    tickLower: number,
    tickUpper: number,
    currentTick: number,
    entryTick: number,
  ): number {
    if (tickLower >= tickUpper) {
      return 0; // degenerate range
    }

    const sqrtPa = tickToSqrtPrice(tickLower);
    const sqrtPb = tickToSqrtPrice(tickUpper);
    const sqrtP0 = tickToSqrtPrice(entryTick);
    const sqrtP1 = tickToSqrtPrice(currentTick);

    return computeConcentratedIL(sqrtPa, sqrtPb, sqrtP0, sqrtP1);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private classifyRisk(
    il: number,
    positionPercent: number,
    isInRange: boolean,
    positionValueUSD: number,
    thresholds: ProfileThresholds,
  ): { riskLevel: RiskAnalysis["riskLevel"]; emergencyExitTriggered: boolean } {
    // Emergency check first
    if (il >= thresholds.emergencyIL) {
      return { riskLevel: "critical", emergencyExitTriggered: true };
    }

    // Out of range is always at least high risk
    if (!isInRange) {
      return { riskLevel: il > thresholds.maxIL ? "critical" : "high", emergencyExitTriggered: false };
    }

    // Edge proximity (how close to 0 or 100 is the position percent)
    const distFromEdge = Math.min(positionPercent, 100 - positionPercent);

    if (il > thresholds.maxIL || distFromEdge < 5) {
      return { riskLevel: "high", emergencyExitTriggered: false };
    }
    if (il > thresholds.maxIL * 0.5 || distFromEdge < 15) {
      return { riskLevel: "medium", emergencyExitTriggered: false };
    }
    return { riskLevel: "low", emergencyExitTriggered: false };
  }

  private computeUrgency(
    distFromEdge: number,
    trigger: number,
    isHighVol: boolean,
    isTrending: boolean,
  ): RebalanceDecision["urgency"] {
    // distFromEdge is 0 at the edge, trigger is the threshold that was crossed
    const ratio = distFromEdge / trigger; // < 1 means past threshold
    if (ratio < 0.25) return "critical";
    if (ratio < 0.5 || (isHighVol && isTrending)) return "high";
    if (ratio < 0.75) return "medium";
    return "low";
  }

  private suggestAction(
    rawPosition: number,
    volatility: number,
    marketState: string,
    riskProfile: RiskProfile,
  ): RebalanceDecision["suggestedAction"] {
    const isNearLower = rawPosition < 0.5;
    const isTrending =
      marketState.includes("trending") || marketState.includes("breakout");

    // In a strong trend the price is likely to keep going - shift in that
    // direction rather than just rebalancing around centre.
    if (isTrending) {
      return isNearLower ? "shift_down" : "shift_up";
    }

    // High volatility - widen the range for safety (conservative/moderate).
    if (volatility > 1.0 && riskProfile !== "aggressive") {
      return "widen";
    }

    // Default: standard rebalance
    return "rebalance";
  }

  private computeRebalanceConfidence(
    distFromEdge: number,
    trigger: number,
    volatility: number,
    isTrending: boolean,
  ): number {
    // Base confidence from how far past the threshold we are
    let confidence = 60 + (1 - distFromEdge / trigger) * 30; // 60-90

    // High vol + trending increases confidence that rebalance is right
    if (isTrending) confidence += 5;
    if (volatility > 0.8) confidence += 3;

    // Extremely low vol - less confident we need to act
    if (volatility < 0.2) confidence -= 10;

    return clamp(Math.round(confidence), 0, 100);
  }

  // -----------------------------------------------------------------------
  // Reasoning builders
  // -----------------------------------------------------------------------

  private buildAnalysisReasoning(
    il: number,
    maxIL: number,
    positionPercent: number,
    isInRange: boolean,
    riskLevel: RiskAnalysis["riskLevel"],
    emergency: boolean,
    profile: RiskProfile,
    valueUSD: number,
  ): string {
    const parts: string[] = [];

    if (emergency) {
      parts.push(
        `EMERGENCY: IL of ${(il * 100).toFixed(2)}% exceeds the ${profile} ` +
        `emergency threshold. Immediate exit recommended to protect ` +
        `$${valueUSD.toLocaleString()} position value.`,
      );
      return parts.join(" ");
    }

    if (!isInRange) {
      parts.push(
        `Position is OUT OF RANGE. No fees are being earned.`,
      );
    } else {
      parts.push(
        `Price is at ${positionPercent.toFixed(1)}% of the tick range.`,
      );
    }

    parts.push(
      `Current IL is ${(il * 100).toFixed(2)}%; worst-case IL to nearest edge is ` +
      `${(maxIL * 100).toFixed(2)}%.`,
    );

    const thresholds = PROFILE_THRESHOLDS[profile];
    if (il > thresholds.maxIL) {
      parts.push(
        `IL exceeds the ${profile} profile limit of ${(thresholds.maxIL * 100).toFixed(0)}%.`,
      );
    }

    parts.push(`Overall risk: ${riskLevel}.`);

    return parts.join(" ");
  }

  private buildRebalanceReasoning(
    rawPosition: number,
    distFromEdge: number,
    trigger: number,
    volatility: number,
    marketState: string,
    action: RebalanceDecision["suggestedAction"],
    profile: RiskProfile,
  ): string {
    const parts: string[] = [];

    parts.push(
      `Price is at ${(rawPosition * 100).toFixed(1)}% of range ` +
      `(${(distFromEdge * 100).toFixed(1)}% from nearest edge, ` +
      `threshold ${(trigger * 100).toFixed(1)}%).`,
    );

    if (volatility > 0.8) {
      parts.push(`Volatility is elevated at ${(volatility * 100).toFixed(0)}%.`);
    }

    if (marketState.includes("trending")) {
      parts.push(`Market is in a trending state; price may continue moving.`);
    }

    parts.push(
      `Recommended action for ${profile} profile: ${action.replace(/_/g, " ")}.`,
    );

    return parts.join(" ");
  }
}
