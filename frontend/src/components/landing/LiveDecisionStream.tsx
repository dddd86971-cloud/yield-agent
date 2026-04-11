"use client";

import { useEffect, useRef, useState } from "react";
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

type ActionKey = "DEPLOY" | "COMPOUND" | "REBALANCE" | "HOLD" | "EMERGENCY_EXIT";

const ACTIONS: Record<
  ActionKey,
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

const POOL_DECISIONS: { action: ActionKey; pool: string; reasoning: string; confidence: number }[] = [
  {
    action: "COMPOUND",
    pool: "OKB/USDC 0.3%",
    reasoning: "Fee APR 38.2% beats gas+slippage 4×. Compound, stay in range.",
    confidence: 92,
  },
  {
    action: "HOLD",
    pool: "ETH/USDC 0.05%",
    reasoning: "30-min vol +180bps. IL 2.1%, still inside ±5% band.",
    confidence: 76,
  },
  {
    action: "REBALANCE",
    pool: "OKB/ETH 0.3%",
    reasoning: "Price drifted to range edge. Re-center ±8% on TWAP.",
    confidence: 88,
  },
  {
    action: "DEPLOY",
    pool: "OKB/USDC 0.3%",
    reasoning: 'Intent: "Conservative 5k OKB/USDC max 5% IL". Strategy v1.',
    confidence: 95,
  },
  {
    action: "HOLD",
    pool: "OKB/USDC 0.3%",
    reasoning: "Trend regime: sideways. Range 92% utilised — no edit.",
    confidence: 81,
  },
  {
    action: "REBALANCE",
    pool: "ETH/USDC 0.05%",
    reasoning: "TWAP shifted +1.2%. Tighten to capture velocity.",
    confidence: 87,
  },
  {
    action: "COMPOUND",
    pool: "OKB/ETH 0.3%",
    reasoning: "Accumulated fees > $24. Auto-compound to LP.",
    confidence: 90,
  },
  {
    action: "EMERGENCY_EXIT",
    pool: "stETH/USDC",
    reasoning: "IL exposure 7.8% > 5% cap. Pull liquidity to stables.",
    confidence: 99,
  },
];

const HEX = "0123456789abcdef";
function shortTx(seed: number): string {
  // Deterministic short hash so SSR ↔ CSR match before first tick.
  let s = "0x";
  let x = seed;
  for (let i = 0; i < 4; i++) {
    x = (x * 9301 + 49297) % 233280;
    s += HEX[x % 16];
  }
  s += "...";
  for (let i = 0; i < 4; i++) {
    x = (x * 9301 + 49297) % 233280;
    s += HEX[x % 16];
  }
  return s;
}

type Row = {
  id: number;
  action: ActionKey;
  pool: string;
  reasoning: string;
  confidence: number;
  txHash: string;
  bornAt: number;
};

const VISIBLE = 5;

function formatAgo(now: number, ms: number): string {
  const sec = Math.max(1, Math.floor((now - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

export function LiveDecisionStream() {
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState<number>(0);
  const counterRef = useRef(0);

  // Seed initial rows on mount (client-only, avoids hydration mismatch)
  useEffect(() => {
    const t0 = Date.now();
    setNow(t0);
    const seed: Row[] = Array.from({ length: VISIBLE }).map((_, i) => {
      const d = POOL_DECISIONS[i % POOL_DECISIONS.length];
      return {
        id: i,
        action: d.action,
        pool: d.pool,
        reasoning: d.reasoning,
        confidence: d.confidence,
        txHash: shortTx(1000 + i),
        bornAt: t0 - (i + 1) * (8 + i * 6) * 1000,
      };
    });
    counterRef.current = VISIBLE;
    setRows(seed);
  }, []);

  // Tick clock every 1s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Add a new row every 4.5s
  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => {
        const next = POOL_DECISIONS[counterRef.current % POOL_DECISIONS.length];
        const newRow: Row = {
          id: counterRef.current,
          action: next.action,
          pool: next.pool,
          reasoning: next.reasoning,
          confidence: next.confidence,
          txHash: shortTx(2000 + counterRef.current),
          bornAt: Date.now(),
        };
        counterRef.current += 1;
        return [newRow, ...prev].slice(0, VISIBLE);
      });
    }, 4500);
    return () => clearInterval(id);
  }, []);

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
              DecisionLogger · Live
            </div>
          </div>
          <div className="text-[10px] font-mono text-white/35 uppercase tracking-wider">
            5 / 321 latest
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-bg-border">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs font-mono text-white/30">
              Connecting to X Layer…
            </div>
          ) : (
            rows.map((row, idx) => {
              const a = ACTIONS[row.action];
              return (
                <div
                  key={row.id}
                  className={cn(
                    "px-5 py-3.5 flex items-start gap-3 transition-colors hover:bg-white/[0.015]",
                    idx === 0 && "animate-slide-down-in"
                  )}
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border",
                      a.bg,
                      a.border
                    )}
                  >
                    <a.icon className={cn("w-4 h-4", a.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold tracking-[0.1em]",
                          a.color
                        )}
                      >
                        {a.label}
                      </span>
                      <span className="text-[10px] font-mono text-white/40 truncate">
                        {row.pool}
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-white/30 shrink-0">
                        {now ? formatAgo(now, row.bornAt) : "—"}
                      </span>
                    </div>
                    <div className="text-xs text-white/65 leading-snug truncate">
                      {row.reasoning}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-mono text-white/30">{row.txHash}</span>
                      <span className="text-[10px] text-white/20">·</span>
                      <span className="text-[10px] font-mono text-accent/70">
                        {row.confidence}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <a
          href="/app/decisions"
          className="px-5 py-3 border-t border-bg-border flex items-center justify-between text-[10px] font-mono text-white/40 hover:text-white/70 hover:bg-white/[0.02] transition-colors group"
        >
          <span>Every decision verifiable on OKLink</span>
          <span className="text-accent inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
            View all <ExternalLink className="w-2.5 h-2.5" />
          </span>
        </a>
      </div>
    </div>
  );
}
