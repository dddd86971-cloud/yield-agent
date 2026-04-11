"use client";

import { useLatestEvaluation } from "@/lib/hooks";
import { TrendingUp, Activity, Shield, Zap } from "lucide-react";
import { cn, formatPercent, formatUSD, riskColor } from "@/lib/utils";

export function ThreeBrainPanel() {
  const latest = useLatestEvaluation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <BrainCard
        title="Market Brain"
        icon={TrendingUp}
        accent="from-blue-500/20 to-blue-500/0"
        iconBg="bg-blue-500/20 text-blue-400"
      >
        {latest?.market ? (
          <div className="space-y-3">
            <Stat label="Current Price" value={`$${latest.market.currentPrice?.toFixed(4) || "—"}`} />
            <Stat
              label="1h Change"
              value={formatPercent(latest.market.priceChange1h)}
              valueClass={
                (latest.market.priceChange1h ?? 0) >= 0 ? "text-accent" : "text-danger"
              }
            />
            <Stat label="Volatility" value={formatPercent(latest.market.volatility)} />
            <div>
              <div className="stat-label mb-1">State</div>
              <div className="badge-neutral inline-block">{latest.market.marketState}</div>
            </div>
          </div>
        ) : (
          <Skeleton />
        )}
      </BrainCard>

      <BrainCard
        title="Pool Brain"
        icon={Activity}
        accent="from-accent/20 to-accent/0"
        iconBg="bg-accent/20 text-accent"
      >
        {latest?.pool ? (
          <div className="space-y-3">
            <Stat
              label="Pair"
              value={`${latest.pool.token0Symbol || "—"}/${latest.pool.token1Symbol || "—"}`}
            />
            <Stat
              label="Fee APR"
              value={formatPercent(latest.pool.feeAPR)}
              valueClass="text-accent text-3xl"
            />
            <Stat label="TVL" value={formatUSD(latest.pool.tvl)} />
            <Stat label="Current Tick" value={latest.pool.currentTick?.toString() || "—"} />
          </div>
        ) : (
          <Skeleton />
        )}
      </BrainCard>

      <BrainCard
        title="Risk Brain"
        icon={Shield}
        accent="from-warn/20 to-warn/0"
        iconBg="bg-warn/20 text-warn"
      >
        {latest?.risk ? (
          <div className="space-y-3">
            <Stat
              label="Position Health"
              value={`${latest.risk.positionHealthPercent}/100`}
              valueClass={
                latest.risk.positionHealthPercent > 60
                  ? "text-accent"
                  : latest.risk.positionHealthPercent > 30
                  ? "text-warn"
                  : "text-danger"
              }
            />
            <Stat
              label="Impermanent Loss"
              value={formatPercent(latest.risk.impermanentLoss * 100)}
            />
            <div>
              <div className="stat-label mb-1">In Range</div>
              <div className={cn("badge inline-block", latest.risk.isInRange ? "badge-ok" : "badge-danger")}>
                {latest.risk.isInRange ? "YES" : "OUT"}
              </div>
            </div>
            <div>
              <div className="stat-label mb-1">Risk Level</div>
              <div className={cn("badge inline-block", `bg-current/10`)}>
                <span className={riskColor(latest.risk.riskLevel)}>
                  {latest.risk.riskLevel.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Skeleton />
        )}
      </BrainCard>
    </div>
  );
}

function BrainCard({
  title,
  icon: Icon,
  accent,
  iconBg,
  children,
}: {
  title: string;
  icon: any;
  accent: string;
  iconBg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card relative overflow-hidden card-hover">
      <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", accent)} />
      <div className="relative">
        <div className="flex items-center gap-3 mb-5">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold">{title}</div>
            <div className="text-xs text-white/40 font-mono">analysis</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={cn("text-xl font-bold font-mono", valueClass || "text-white")}>{value}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 bg-bg-border rounded animate-pulse" />
      <div className="h-5 bg-bg-border rounded animate-pulse w-3/4" />
      <div className="h-5 bg-bg-border rounded animate-pulse w-1/2" />
      <div className="h-5 bg-bg-border rounded animate-pulse w-2/3" />
    </div>
  );
}
