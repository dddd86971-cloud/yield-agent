"use client";

import { useLatestEvaluation, useAgentState } from "@/lib/hooks";
import { useEffect, useState } from "react";
import { api, EvaluationLite } from "@/lib/api";
import { fetchBrainDataFromRpc, BrainSnapshot } from "@/lib/brainRpc";
import { TrendingUp, Activity, Shield, Zap } from "lucide-react";
import { cn, formatPercent, formatUSD, riskColor } from "@/lib/utils";

export function ThreeBrainPanel() {
  const latest = useLatestEvaluation();
  const { state } = useAgentState();
  const [directFetch, setDirectFetch] = useState<EvaluationLite | BrainSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  // Cascading data fetch: WS → /api/latest → /api/brains/snapshot → direct RPC
  useEffect(() => {
    if (latest) return; // Already have data from WS
    let cancelled = false;
    setLoading(true);

    const tryBackendApis = async () => {
      // 1. Try /api/latest
      try {
        const data = await api.latest();
        if (!cancelled && data && data.market) {
          setDirectFetch(data);
          setLoading(false);
          return;
        }
      } catch {}
      // 2. Try /api/brains/snapshot
      try {
        const snap = await api.brainsSnapshot();
        if (!cancelled && snap && snap.market?.currentPrice) {
          setDirectFetch(snap);
          setLoading(false);
          return;
        }
      } catch {}
      // 3. Final fallback: direct on-chain RPC read (works on Vercel!)
      try {
        const rpcData = await fetchBrainDataFromRpc();
        if (!cancelled) {
          setDirectFetch(rpcData);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("[ThreeBrainPanel] all data sources failed:", err);
      }
      if (!cancelled) setLoading(false);
    };

    tryBackendApis();
    return () => { cancelled = true; };
  }, [latest]);

  const data = latest || directFetch;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <BrainCard
        title="Market Brain"
        icon={TrendingUp}
        accent="from-blue-500/20 to-blue-500/0"
        iconBg="bg-blue-500/20 text-blue-400"
      >
        {data?.market && data.market.currentPrice ? (
          <div className="space-y-3">
            <Stat label="Current Price" value={`$${data.market.currentPrice?.toFixed(4) || "—"}`} />
            <Stat
              label="1h Change"
              value={formatPercent(data.market.priceChange1h)}
              valueClass={
                (data.market.priceChange1h ?? 0) >= 0 ? "text-accent" : "text-danger"
              }
            />
            <Stat label="Volatility" value={formatPercent(data.market.volatility)} />
            <div>
              <div className="stat-label mb-1">State</div>
              <div className="badge-neutral inline-block">{data.market.marketState}</div>
            </div>
          </div>
        ) : (
          <Skeleton label={loading ? "Fetching live data…" : "Start monitoring to activate"} />
        )}
      </BrainCard>

      <BrainCard
        title="Pool Brain"
        icon={Activity}
        accent="from-accent/20 to-accent/0"
        iconBg="bg-accent/20 text-accent"
      >
        {data?.pool && data.pool.token0Symbol ? (
          <div className="space-y-3">
            <Stat
              label="Pair"
              value={`${data.pool.token0Symbol || "—"}/${data.pool.token1Symbol || "—"}`}
            />
            <Stat
              label="Fee APR"
              value={formatPercent(data.pool.feeAPR)}
              valueClass="text-accent text-3xl"
            />
            <Stat label="TVL" value={formatUSD(data.pool.tvl)} />
            <Stat label="Current Tick" value={data.pool.currentTick?.toString() || "—"} />
          </div>
        ) : (
          <Skeleton label={loading ? "Fetching live data…" : "Start monitoring to activate"} />
        )}
      </BrainCard>

      <BrainCard
        title="Risk Brain"
        icon={Shield}
        accent="from-warn/20 to-warn/0"
        iconBg="bg-warn/20 text-warn"
      >
        {data?.risk ? (
          <div className="space-y-3">
            <Stat
              label="Position Health"
              value={`${data.risk.positionHealthPercent}/100`}
              valueClass={
                data.risk.positionHealthPercent > 60
                  ? "text-accent"
                  : data.risk.positionHealthPercent > 30
                  ? "text-warn"
                  : "text-danger"
              }
            />
            <Stat
              label="Impermanent Loss"
              value={formatPercent(data.risk.impermanentLoss * 100)}
            />
            <div>
              <div className="stat-label mb-1">In Range</div>
              <div className={cn("badge inline-block", data.risk.isInRange ? "badge-ok" : "badge-danger")}>
                {data.risk.isInRange ? "YES" : "OUT"}
              </div>
            </div>
            <div>
              <div className="stat-label mb-1">Risk Level</div>
              <div className={cn("badge inline-block", `bg-current/10`)}>
                <span className={riskColor(data.risk.riskLevel)}>
                  {data.risk.riskLevel.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Skeleton label={loading ? "Fetching live data…" : "No active position — deploy to assess risk"} />
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

function Skeleton({ label }: { label?: string }) {
  return (
    <div className="space-y-3">
      {label && (
        <div className="text-xs text-white/40 font-mono mb-2">{label}</div>
      )}
      <div className="h-5 bg-bg-border rounded animate-pulse" />
      <div className="h-5 bg-bg-border rounded animate-pulse w-3/4" />
      <div className="h-5 bg-bg-border rounded animate-pulse w-1/2" />
      <div className="h-5 bg-bg-border rounded animate-pulse w-2/3" />
    </div>
  );
}
