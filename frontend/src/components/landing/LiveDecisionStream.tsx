"use client";

/**
 * LiveDecisionStream — landing-page widget that surfaces *real* on-chain
 * decisions logged by YieldAgent's TEE Agentic Wallet on X Layer mainnet.
 *
 * Wired directly to `DecisionLogger.DecisionRecorded` events at
 * `0x5989f764bC20072e6554860547CfEC474877892C` (chainId 196). Every row's
 * tx hash resolves on OKLink — no mocks, no seed values, no shortHash
 * generators. If the RPC is unreachable or the contract has zero events,
 * the widget renders an honest empty state instead of fake data.
 *
 * The "no fakery" rule for this submission: every visible number, hash,
 * and reasoning string in this component originates from a real
 * `logDecision()` call broadcast by the agent.
 */

import { useEffect, useState } from "react";
import {
  Activity,
  Repeat,
  Zap,
  Pause,
  AlertTriangle,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchRecentDecisions,
  poolLabelForStrategy,
  type DecisionAction,
  type OnchainDecision,
} from "@/lib/onchainDecisions";
import { CONTRACTS, DEFAULT_CHAIN_ID, explorerUrl } from "@/config/contracts";

const ACTIONS: Record<
  DecisionAction,
  { icon: LucideIcon; color: string; bg: string; border: string; label: string }
> = {
  DEPLOY: {
    icon: Zap,
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/30",
    label: "DEPLOY",
  },
  COMPOUND: {
    icon: Repeat,
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/30",
    label: "COMPOUND",
  },
  REBALANCE: {
    icon: Activity,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    label: "REBALANCE",
  },
  HOLD: {
    icon: Pause,
    color: "text-white/55",
    bg: "bg-white/[0.04]",
    border: "border-white/15",
    label: "HOLD",
  },
  EMERGENCY_EXIT: {
    icon: AlertTriangle,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    label: "EXIT",
  },
};

const VISIBLE = 5;
const POLL_INTERVAL_MS = 30_000;

function formatAgo(now: number, ms: number): string {
  const sec = Math.max(1, Math.floor((now - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; rows: OnchainDecision[]; total: number }
  | { kind: "error"; message: string };

export function LiveDecisionStream() {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [now, setNow] = useState<number>(0);

  // Initial fetch + poll. Strict-mode double-mount in dev is harmless because
  // each effect cleans up its own interval.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const rows = await fetchRecentDecisions(VISIBLE);
        if (cancelled) return;
        // `total` reflects the number of rows we actually loaded. The full
        // history is read from on-chain via `getDecisionCount` per strategy
        // and shown on the /app dashboard, not here.
        setState({ kind: "ready", rows, total: rows.length });
        setNow(Date.now());
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Tick clock every 1s so the "Xs ago" label stays live between polls.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const decisionLoggerHref = explorerUrl(
    DEFAULT_CHAIN_ID,
    CONTRACTS[DEFAULT_CHAIN_ID].decisionLogger,
    "address",
  );

  return (
    <div className="relative">
      {/* Glow halo */}
      <div className="pointer-events-none absolute -inset-6 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1/2 bg-accent/15 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-blue-500/10 blur-[100px] rounded-full" />
      </div>

      <div className="card !p-0 overflow-hidden bg-bg-card/90 backdrop-blur-xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,255,163,0.08)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-bg-border bg-gradient-to-r from-accent/[0.04] to-transparent">
          <div className="flex items-center gap-2.5">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-accent opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-accent" />
            </span>
            <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/70">
              DecisionLogger · X Layer 196
            </div>
          </div>
          <div className="text-[10px] font-mono text-white/35 uppercase tracking-wider">
            {state.kind === "ready" ? `${state.rows.length} on-chain` : "—"}
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-bg-border">
          {state.kind === "loading" && (
            <div className="px-5 py-10 text-center text-xs font-mono text-white/30">
              Reading DecisionLogger storage from X Layer…
            </div>
          )}

          {state.kind === "error" && (
            <div className="px-5 py-10 text-center text-xs font-mono text-orange-400/70">
              RPC unreachable: {state.message.slice(0, 80)}
            </div>
          )}

          {state.kind === "ready" && state.rows.length === 0 && (
            <div className="px-5 py-10 text-center text-xs font-mono text-white/30">
              No decisions anchored yet. Deploy a strategy to populate the log.
            </div>
          )}

          {state.kind === "ready" &&
            state.rows.map((row, idx) => {
              const a = ACTIONS[row.action];
              const ts = row.timestampMs;
              return (
                <div
                  key={`${row.strategyId}-${ts}-${idx}`}
                  className="px-5 py-3.5 flex items-start gap-3 transition-colors hover:bg-white/[0.015]"
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border",
                      a.bg,
                      a.border,
                    )}
                  >
                    <a.icon className={cn("w-4 h-4", a.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold tracking-[0.1em]",
                          a.color,
                        )}
                      >
                        {a.label}
                      </span>
                      <span className="text-[10px] font-mono text-white/40 truncate">
                        {poolLabelForStrategy(row.strategyId)}
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-white/30 shrink-0">
                        {ts && now ? formatAgo(now, ts) : "—"}
                      </span>
                    </div>
                    <div className="text-xs text-white/65 leading-snug truncate">
                      {row.reasoning}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-mono text-white/30">
                        strategy #{row.strategyId.toString()}
                      </span>
                      <span className="text-[10px] text-white/20">·</span>
                      <span className="text-[10px] font-mono text-accent/70">
                        {row.confidence}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <a
          href={decisionLoggerHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-3 border-t border-bg-border flex items-center justify-between text-[10px] font-mono text-white/40 hover:text-white/70 hover:bg-white/[0.02] transition-colors group"
        >
          <span>Every decision verifiable on OKLink</span>
          <span className="text-accent inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
            View contract <ExternalLink className="w-2.5 h-2.5" />
          </span>
        </a>
      </div>
    </div>
  );
}
