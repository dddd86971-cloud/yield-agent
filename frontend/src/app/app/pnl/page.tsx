"use client";

import { Header } from "@/components/Header";
import { PnLChart } from "@/components/PnLChart";
import { api, PersistedStrategy, PnLSnapshot } from "@/lib/api";
import { useAccount } from "wagmi";
import {
  LineChart,
  Lock,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  RotateCw,
  Coins,
  Activity,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatTimeAgo, cn } from "@/lib/utils";

/**
 * PnL dashboard — per-wallet historical performance view.
 *
 * Pulls strategies + snapshots from the server (NOT localStorage) keyed by
 * the connected browser wallet — every user sees only their own positions.
 * Auto-refreshes every 30s and on manual click.
 */
export default function PnLPage() {
  const { isConnected, address } = useAccount();
  const [strategies, setStrategies] = useState<PersistedStrategy[]>([]);
  const [snapshots, setSnapshots] = useState<PnLSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | "all">("all");

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }
    let active = true;

    const load = async () => {
      try {
        const [strat, pnl] = await Promise.all([
          api.strategiesByWallet(address),
          api.pnlByWallet(address),
        ]);
        if (!active) return;
        setStrategies(strat.strategies);
        setSnapshots(pnl.snapshots);
      } catch (err) {
        console.warn("[PnL] load failed:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [address, isConnected]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.pnlRefresh();
      if (address) {
        const pnl = await api.pnlByWallet(address);
        setSnapshots(pnl.snapshots);
      }
    } catch (err) {
      console.warn("[PnL] refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredSnapshots =
    selectedId === "all"
      ? snapshots
      : snapshots.filter((s) => s.strategyId === selectedId);

  // Aggregate stats
  const latestBy = new Map<number, PnLSnapshot>();
  for (const s of snapshots) {
    const prev = latestBy.get(s.strategyId);
    if (!prev || s.timestamp > prev.timestamp) latestBy.set(s.strategyId, s);
  }
  const latestSnaps = Array.from(latestBy.values());

  const totalPrincipal = strategies.reduce((sum, s) => sum + (s.principalUSD ?? 0), 0);
  const totalFees = latestSnaps.reduce((sum, s) => sum + (s.feesValueUSD ?? 0), 0);
  const totalPositionValue = latestSnaps.reduce(
    (sum, s) => sum + (s.positionValueUSD ?? 0),
    0,
  );
  const totalPnL = totalPositionValue + totalFees - totalPrincipal;
  const roi = totalPrincipal > 0 ? (totalPnL / totalPrincipal) * 100 : 0;
  const inRangeCount = latestSnaps.filter((s) => s.isInRange).length;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <LineChart className="w-9 h-9 text-accent" />
              PnL Dashboard
            </h1>
            <p className="text-white/60">
              Track every strategy's historical value, fees earned, and range health.
              Snapshots auto-capture on each evaluation cycle.
            </p>
          </div>
          {isConnected && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="shrink-0 px-4 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-40"
            >
              <RotateCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
              Refresh
            </button>
          )}
        </div>

        {!isConnected ? (
          <div className="card text-center py-16">
            <Lock className="w-10 h-10 text-white/15 mx-auto mb-4" />
            <div className="text-lg font-bold text-white/40 mb-2">
              Connect Wallet to View PnL
            </div>
            <div className="text-sm text-white/30 max-w-md mx-auto">
              The PnL dashboard is scoped per-wallet. Connect to see strategies you've deployed.
            </div>
          </div>
        ) : loading ? (
          <div className="card animate-pulse">
            <div className="h-6 bg-white/10 rounded w-1/3 mb-4" />
            <div className="h-48 bg-white/10 rounded" />
          </div>
        ) : strategies.length === 0 ? (
          <div className="card text-center py-16">
            <Activity className="w-10 h-10 text-white/15 mx-auto mb-4" />
            <div className="text-lg font-bold text-white/40 mb-2">No strategies yet</div>
            <div className="text-sm text-white/30 max-w-md mx-auto">
              Deploy a strategy from the Agent Dashboard to start building your PnL history.
            </div>
          </div>
        ) : (
          <>
            {/* Aggregate stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                label="Total Principal"
                value={`$${totalPrincipal.toFixed(2)}`}
                icon={DollarSign}
                color="text-white"
              />
              <StatCard
                label="Position Value"
                value={`$${totalPositionValue.toFixed(2)}`}
                icon={Activity}
                color="text-blue-400"
              />
              <StatCard
                label="Fees Earned"
                value={`$${totalFees.toFixed(4)}`}
                icon={Coins}
                color="text-accent"
              />
              <StatCard
                label="Net PnL"
                value={`${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(4)}`}
                icon={totalPnL >= 0 ? TrendingUp : TrendingDown}
                color={totalPnL >= 0 ? "text-accent" : "text-danger"}
              />
              <StatCard
                label="ROI"
                value={`${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%`}
                icon={roi >= 0 ? TrendingUp : TrendingDown}
                color={roi >= 0 ? "text-accent" : "text-danger"}
              />
            </div>

            {/* Range health */}
            <div className="card py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-accent" />
                  <div>
                    <div className="font-bold">
                      {inRangeCount} / {latestSnaps.length} positions in range
                    </div>
                    <div className="text-xs text-white/50">
                      Positions out of range earn zero fees until rebalanced.
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/40 uppercase">Uptime</div>
                  <div className="text-xl font-mono font-bold text-accent">
                    {latestSnaps.length > 0
                      ? `${((inRangeCount / latestSnaps.length) * 100).toFixed(0)}%`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* Strategy picker */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedId("all")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  selectedId === "all"
                    ? "bg-accent/10 text-accent border-accent/40"
                    : "bg-white/5 text-white/60 border-white/10 hover:border-white/20",
                )}
              >
                All strategies ({strategies.length})
              </button>
              {strategies.map((s) => (
                <button
                  key={s.strategyId}
                  onClick={() => setSelectedId(s.strategyId)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5",
                    selectedId === s.strategyId
                      ? "bg-accent/10 text-accent border-accent/40"
                      : "bg-white/5 text-white/60 border-white/10 hover:border-white/20",
                  )}
                >
                  #{s.strategyId}
                  <span className="text-white/30 font-mono">
                    {s.token0Symbol ?? "?"}/{s.token1Symbol ?? "?"}
                  </span>
                  <span className="text-white/30">
                    ${(s.principalUSD ?? 0).toFixed(0)}
                  </span>
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-bold">Value & Fees Over Time</div>
                  <div className="text-xs text-white/40">
                    {filteredSnapshots.length} snapshots ·{" "}
                    {selectedId === "all" ? "all strategies combined" : `strategy #${selectedId}`}
                  </div>
                </div>
                {filteredSnapshots.length > 0 && (
                  <div className="text-right text-xs text-white/40 font-mono">
                    Last captured: {formatTimeAgo(filteredSnapshots[filteredSnapshots.length - 1].timestamp)}
                  </div>
                )}
              </div>
              <PnLChart snapshots={filteredSnapshots} />
            </div>

            {/* Strategy table */}
            <div className="card">
              <div className="font-bold mb-3">My Strategies</div>
              <div className="space-y-2">
                {strategies.map((s) => {
                  const latest = latestBy.get(s.strategyId);
                  const pnl = latest
                    ? (latest.positionValueUSD ?? 0) +
                      (latest.feesValueUSD ?? 0) -
                      (s.principalUSD ?? 0)
                    : 0;
                  return (
                    <div
                      key={s.strategyId}
                      className="p-3 rounded-xl bg-bg border border-bg-border flex items-center gap-3 text-sm"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-mono text-xs font-bold">
                        #{s.strategyId}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {s.token0Symbol ?? "?"} / {s.token1Symbol ?? "?"}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase",
                              s.status === "monitoring" || s.status === "analyzing"
                                ? "bg-accent/10 text-accent"
                                : s.status === "exited"
                                  ? "bg-danger/10 text-danger"
                                  : "bg-white/5 text-white/40",
                            )}
                          >
                            {s.status}
                          </span>
                          {latest && (
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1",
                                latest.isInRange
                                  ? "bg-green-500/10 text-green-400"
                                  : "bg-orange-500/10 text-orange-400",
                              )}
                            >
                              {latest.isInRange ? (
                                <>
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  IN RANGE
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  OUT
                                </>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/40 flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(s.deployedAt)} · {s.evaluationCount} evaluations
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-white/40">Principal</div>
                        <div className="font-mono font-bold">${(s.principalUSD ?? 0).toFixed(2)}</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-white/40">Fees</div>
                        <div className="font-mono text-accent">
                          ${(latest?.feesValueUSD ?? 0).toFixed(4)}
                        </div>
                      </div>
                      <div className="text-right text-xs min-w-[72px]">
                        <div className="text-white/40">PnL</div>
                        <div
                          className={cn(
                            "font-mono font-bold",
                            pnl >= 0 ? "text-accent" : "text-danger",
                          )}
                        >
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="card py-4">
      <div className="flex items-center justify-between mb-1">
        <div className="stat-label">{label}</div>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <div className={cn("text-2xl font-bold font-mono", color)}>{value}</div>
    </div>
  );
}
