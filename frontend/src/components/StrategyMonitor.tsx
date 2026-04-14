"use client";

import { useAgentState, useLatestEvaluation } from "@/lib/hooks";
import { formatTimeAgo, cn } from "@/lib/utils";
import {
  Activity,
  Brain,
  Clock,
  TrendingUp,
  Shield,
  Zap,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
  RotateCw,
  LogOut,
} from "lucide-react";
import { useState, useEffect } from "react";

const ACTION_CONFIG: Record<
  string,
  { icon: typeof Activity; color: string; label: string }
> = {
  hold: { icon: CheckCircle2, color: "text-accent", label: "HOLD" },
  deploy: { icon: Zap, color: "text-accent", label: "DEPLOY" },
  rebalance: { icon: RotateCw, color: "text-warn", label: "REBALANCE" },
  compound: { icon: TrendingUp, color: "text-blue-400", label: "COMPOUND" },
  emergency_exit: { icon: AlertTriangle, color: "text-danger", label: "EXIT" },
};

export function StrategyMonitor() {
  const { state, history, connected } = useAgentState();
  const latest = useLatestEvaluation();
  const [nextEvalSec, setNextEvalSec] = useState<number | null>(null);

  // Countdown to next evaluation
  useEffect(() => {
    if (!state || state.status !== "monitoring") {
      setNextEvalSec(null);
      return;
    }
    const intervalMs = 5 * 60 * 1000; // 5 min
    const tick = () => {
      const elapsed = Date.now() - (state.lastEvaluation || Date.now());
      const remaining = Math.max(0, Math.floor((intervalMs - elapsed) / 1000));
      setNextEvalSec(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.status, state?.lastEvaluation]);

  // Don't render if no strategy
  if (!state || state.strategyId === null) return null;

  const isMonitoring = state.status === "monitoring" || state.status === "analyzing" || state.status === "rebalancing";
  const recentDecisions = [...history].reverse().slice(0, 5);

  // Action breakdown
  const actionCounts = history.reduce(
    (acc, e) => {
      acc[e.action] = (acc[e.action] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              isMonitoring ? "bg-accent/20 text-accent" : "bg-white/10 text-white/40"
            )}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold flex items-center gap-2">
              Strategy #{state.strategyId}
              <span
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider",
                  isMonitoring
                    ? "bg-accent/20 text-accent"
                    : state.status === "exited"
                    ? "bg-danger/20 text-danger"
                    : "bg-white/10 text-white/50"
                )}
              >
                {state.status === "analyzing" ? "ANALYZING" : state.status.toUpperCase()}
              </span>
            </div>
            <div className="text-xs text-white/40 font-mono">
              {state.evaluationCount} evaluations ·{" "}
              {isMonitoring ? "auto-managing your LP" : "monitoring paused"}
            </div>
          </div>
        </div>

        {/* Next eval countdown */}
        {isMonitoring && nextEvalSec !== null && (
          <div className="text-right">
            <div className="text-[10px] text-white/40 uppercase">Next Check</div>
            <div className="text-lg font-bold font-mono text-accent">
              {formatCountdown(nextEvalSec)}
            </div>
          </div>
        )}
      </div>

      {/* What the agent is doing */}
      {isMonitoring && (
        <div className="p-3 rounded-xl bg-accent/5 border border-accent/20 mb-4">
          <div className="text-xs text-accent font-bold mb-1 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            Agent is actively managing your position
          </div>
          <div className="text-[11px] text-white/50 leading-relaxed">
            Every 5 min: quick price check · Every 30 min: full three-brain analysis ·
            Every 6 hours: auto fee collection. Rebalance triggers when position health drops below threshold.
          </div>
        </div>
      )}

      {/* Latest Decision */}
      {latest && (
        <div className="mb-4">
          <div className="text-[10px] text-white/40 uppercase mb-2">Latest Decision</div>
          <div className="p-3 rounded-xl bg-bg border border-bg-border">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {(() => {
                  const cfg = ACTION_CONFIG[latest.action] || ACTION_CONFIG.hold;
                  const Icon = cfg.icon;
                  return (
                    <>
                      <Icon className={cn("w-4 h-4", cfg.color)} />
                      <span className={cn("text-sm font-bold", cfg.color)}>{cfg.label}</span>
                    </>
                  );
                })()}
                <span className="text-[10px] text-white/30 font-mono">
                  {formatTimeAgo(latest.timestamp)}
                </span>
              </div>
              <span className="text-xs font-mono text-white/50">
                conf {latest.confidence}%
              </span>
            </div>
            <div className="text-[11px] text-white/50 leading-relaxed">
              {latest.reasoning?.slice(0, 150)}
              {(latest.reasoning?.length ?? 0) > 150 ? "..." : ""}
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <MiniStat
          label="Total Evals"
          value={String(state.evaluationCount || 0)}
          icon={Clock}
        />
        <MiniStat
          label="HOLD"
          value={String(actionCounts["hold"] || 0)}
          icon={CheckCircle2}
          accent
        />
        <MiniStat
          label="REBALANCE"
          value={String(actionCounts["rebalance"] || 0)}
          icon={RotateCw}
          warn={Number(actionCounts["rebalance"] || 0) > 0}
        />
        <MiniStat
          label="COMPOUND"
          value={String(actionCounts["compound"] || 0)}
          icon={TrendingUp}
        />
      </div>

      {/* Recent Decisions */}
      {recentDecisions.length > 0 && (
        <div>
          <div className="text-[10px] text-white/40 uppercase mb-2">Recent Activity</div>
          <div className="space-y-1">
            {recentDecisions.map((d, i) => {
              const cfg = ACTION_CONFIG[d.action] || ACTION_CONFIG.hold;
              const Icon = cfg.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 text-[11px] py-1 px-2 rounded-lg hover:bg-white/5"
                >
                  <Icon className={cn("w-3 h-3 flex-shrink-0", cfg.color)} />
                  <span className={cn("font-bold w-20 flex-shrink-0", cfg.color)}>
                    {cfg.label}
                  </span>
                  <span className="text-white/40 flex-shrink-0 w-14 font-mono">
                    {formatTimeAgo(d.timestamp)}
                  </span>
                  <span className="text-white/30 truncate">
                    {d.reasoning?.slice(0, 60)}...
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  accent,
  warn,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="p-2 rounded-lg bg-bg border border-bg-border text-center">
      <Icon
        className={cn(
          "w-3 h-3 mx-auto mb-0.5",
          accent ? "text-accent" : warn ? "text-warn" : "text-white/30"
        )}
      />
      <div
        className={cn(
          "text-base font-bold font-mono",
          accent ? "text-accent" : warn ? "text-warn" : "text-white"
        )}
      >
        {value}
      </div>
      <div className="text-[9px] text-white/30 uppercase">{label}</div>
    </div>
  );
}
