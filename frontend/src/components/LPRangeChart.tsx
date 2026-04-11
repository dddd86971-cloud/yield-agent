"use client";

import { useLatestEvaluation } from "@/lib/hooks";
import { cn, formatPercent } from "@/lib/utils";

/**
 * LP Range Chart - shows the position range, current price, and how
 * "in range" we are. The dot pulses to indicate the agent is alive.
 */
export function LPRangeChart() {
  const latest = useLatestEvaluation();

  // Without real position data we still show a structural placeholder.
  const inRange = latest?.risk?.isInRange ?? true;
  const health = latest?.risk?.positionHealthPercent ?? 50;
  const price = latest?.market?.currentPrice ?? 0;

  // Position percent across the bar (0-100). When out of range we clip to edges.
  const positionPercent = inRange ? health : health > 50 ? 5 : 95;

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/40 font-mono mb-1">
            LP Position
          </div>
          <div className="font-bold text-lg">
            {latest?.pool?.token0Symbol || "TOKEN"}/{latest?.pool?.token1Symbol || "TOKEN"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-white/40 font-mono mb-1">
            Current Price
          </div>
          <div className="font-mono text-xl font-bold">
            ${price.toFixed(4)}
          </div>
        </div>
      </div>

      {/* The range bar */}
      <div className="relative mb-3">
        <div className="h-16 rounded-xl bg-gradient-to-r from-bg-border via-bg-border to-bg-border relative overflow-hidden">
          {/* In-range zone (gradient highlight) */}
          <div
            className={cn(
              "absolute inset-y-0 transition-all duration-500",
              inRange
                ? "bg-gradient-to-r from-accent/0 via-accent/30 to-accent/0"
                : "bg-gradient-to-r from-warn/0 via-warn/20 to-warn/0"
            )}
            style={{ left: "10%", right: "10%" }}
          />

          {/* Range markers (vertical lines) */}
          <div className="absolute inset-y-2 left-[10%] w-0.5 bg-white/30" />
          <div className="absolute inset-y-2 right-[10%] w-0.5 bg-white/30" />

          {/* Current price indicator */}
          <div
            className="absolute inset-y-0 transition-all duration-1000 ease-out"
            style={{ left: `${positionPercent}%` }}
          >
            <div className="relative h-full">
              <div className="absolute inset-y-0 w-0.5 bg-accent" />
              <div
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full",
                  inRange ? "bg-accent shadow-[0_0_15px_rgba(0,255,163,0.8)] animate-pulse" : "bg-warn"
                )}
              />
            </div>
          </div>
        </div>

        {/* Range labels */}
        <div className="flex justify-between mt-2 text-xs font-mono text-white/40">
          <span>Tick Lower</span>
          <span>Tick Upper</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-bg-border">
        <div>
          <div className="stat-label">Health</div>
          <div
            className={cn(
              "text-lg font-bold font-mono",
              health > 60 ? "text-accent" : health > 30 ? "text-warn" : "text-danger"
            )}
          >
            {health}%
          </div>
        </div>
        <div>
          <div className="stat-label">IL</div>
          <div className="text-lg font-bold font-mono text-white">
            {formatPercent((latest?.risk?.impermanentLoss ?? 0) * 100)}
          </div>
        </div>
        <div>
          <div className="stat-label">Status</div>
          <div className={cn("badge inline-block", inRange ? "badge-ok" : "badge-warn")}>
            {inRange ? "IN RANGE" : "OUT"}
          </div>
        </div>
      </div>
    </div>
  );
}
