"use client";

import { Activity, Wifi, WifiOff, ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { useAgentState } from "@/lib/hooks";
import { useEffect, useState } from "react";
import { api, HealthInfo } from "@/lib/api";
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
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const h = await api.health();
        if (active) setHealth(h);
      } catch {}
    }
    load();
    const iv = setInterval(load, 30_000);
    return () => { active = false; clearInterval(iv); };
  }, []);

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

  const oc = health?.onchainos;
  const walletAddr = oc?.agenticWalletAddress;
  const shortAddr = walletAddr
    ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}`
    : null;
  const execMode = health?.executionMode;

  return (
    <div className="space-y-2">
      {/* Row 1: Agent status */}
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

      {/* Row 2: Agentic Wallet (TEE) status */}
      <div className="card flex items-center justify-between py-2.5 px-4">
        <div className="flex items-center gap-3">
          {oc?.loggedIn && walletAddr ? (
            <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-accent" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-danger" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white/80">
                Agentic Wallet
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono font-semibold">
                TEE
              </span>
              {execMode && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold",
                  execMode === "live"
                    ? "bg-green-500/15 text-green-400"
                    : execMode === "simulated"
                    ? "bg-yellow-500/15 text-yellow-400"
                    : "bg-white/10 text-white/50"
                )}>
                  {execMode.toUpperCase()}
                </span>
              )}
            </div>
            {oc?.loggedIn && walletAddr ? (
              <div className="flex items-center gap-2 mt-0.5">
                <a
                  href={`https://www.oklink.com/xlayer/address/${walletAddr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-accent/80 hover:text-accent hover:underline flex items-center gap-1"
                >
                  {shortAddr}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <span className="text-[10px] text-white/30">
                  All LP operations signed inside TEE — not your browser wallet
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-danger/70 mt-0.5">
                Not connected — OnchainOS login required on backend
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {oc?.loggedIn ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-[10px] text-green-400/80 font-mono">OnchainOS</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              <span className="text-[10px] text-danger/80 font-mono">Offline</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
