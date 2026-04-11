"use client";

import { Activity, Wifi, WifiOff } from "lucide-react";
import { useAgentState } from "@/lib/hooks";
import { cn, formatTimeAgo } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-white/10 text-white/60",
  analyzing: "bg-blue-500/20 text-blue-400",
  deploying: "bg-accent/20 text-accent",
  monitoring: "bg-accent/20 text-accent",
  rebalancing: "bg-warn/20 text-warn",
  exited: "bg-danger/20 text-danger",
};

export function StatusBar() {
  const { state, connected } = useAgentState();
  if (!state) {
    return (
      <div className="card flex items-center gap-3 py-3">
        <WifiOff className="w-4 h-4 text-white/40" />
        <span className="text-sm text-white/40 font-mono">Connecting to agent...</span>
      </div>
    );
  }

  const status = state.status;
  const colors = STATUS_COLORS[status] || STATUS_COLORS.idle;
  const isLive = connected && (status === "monitoring" || status === "analyzing");

  return (
    <div className="card flex items-center justify-between py-3">
      <div className="flex items-center gap-4">
        <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono uppercase", colors)}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
          {status}
        </div>
        <div className="text-sm text-white/60 font-mono">
          {state.strategyId !== null
            ? `Strategy #${state.strategyId}`
            : "No active strategy"}
        </div>
        {state.evaluationCount > 0 && (
          <div className="text-xs text-white/40 font-mono">
            {state.evaluationCount} evaluations
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-white/50 font-mono">
        {state.lastEvaluation > 0 && (
          <span>last check {formatTimeAgo(state.lastEvaluation)}</span>
        )}
        {connected ? (
          <Wifi className="w-3.5 h-3.5 text-accent" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-danger" />
        )}
      </div>
    </div>
  );
}
