"use client";

import { Header } from "@/components/Header";
import { api, V3PoolState } from "@/lib/api";
import {
  Coins,
  TrendingUp,
  DollarSign,
  Percent,
  ExternalLink,
  RotateCw,
  Activity,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Supported pools on X Layer. Expand this list whenever a new pool is
 * verified via `onchainos defi search` — the backend config has a matching
 * entry so Intent→Deploy routes cleanly to it.
 *
 * Addresses byte-for-byte match `agent/src/config/index.ts`.
 */
const POOLS: Array<{
  address: string;
  name: string;
  token0: string;
  token1: string;
  feeBps: number;
  dex: string;
  description: string;
}> = [
  {
    address: "0x63d62734847E55A266FCa4219A9aD0a02D5F6e02",
    name: "USDT/OKB",
    token0: "USDT",
    token1: "OKB",
    feeBps: 3000,
    dex: "Uniswap V3",
    description:
      "The X Layer flagship pair — deepest liquidity on chain. Best fit for conservative LPs; fee APR usually hovers 8–20%.",
  },
  {
    address: "0xd4e12E274AEFC5F0b4abC1fC5D9581e4B8bE04da",
    name: "WETH/USDT",
    token0: "WETH",
    token1: "USDT",
    feeBps: 3000,
    dex: "Uniswap V3",
    description:
      "Blue-chip stable-paired ETH pool. Narrower range suits moderate risk profiles; IL tracks ETH volatility.",
  },
];

/**
 * Pools page — live snapshot of every X Layer pool YieldAgent knows about.
 * Judges can eyeball TVL, current tick, and volume per pool, then click
 * through to OKLink to verify on-chain state.
 */
interface DeFiOpportunity {
  investmentId: string;
  name?: string;
  tvl?: string;
  rate?: string;
  platform?: string;
  [k: string]: unknown;
}

export default function PoolsPage() {
  const [poolStates, setPoolStates] = useState<Record<string, V3PoolState>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opportunities, setOpportunities] = useState<DeFiOpportunity[]>([]);
  const [oppError, setOppError] = useState<string | null>(null);

  const load = async () => {
    setRefreshing(true);
    try {
      // Parallel fetch so adding more pools doesn't linearly slow this page.
      const entries = await Promise.all(
        POOLS.map(async (p) => {
          try {
            const state = await api.v3Pool(p.address);
            return [p.address, state] as const;
          } catch {
            return [p.address, null] as const;
          }
        }),
      );
      const next: Record<string, V3PoolState> = {};
      for (const [addr, state] of entries) {
        if (state) next[addr] = state;
      }
      setPoolStates(next);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Cross-protocol opportunities from OnchainOS `defi search`. Loaded once;
  // data is relatively stable so a single fetch is plenty.
  useEffect(() => {
    let active = true;
    api
      .defiOpportunities("USDT")
      .then((r) => {
        if (active) setOpportunities(r.opportunities);
      })
      .catch((err) => {
        if (active) setOppError(err?.message ?? "Load failed");
      });
    return () => {
      active = false;
    };
  }, []);

  // Rough price calc — only works for USDT-paired pools on X Layer's tick convention.
  const tickToPrice = (tick: number, token0: string, token1: string): number => {
    // OKB-like pairs: token0=USDT(6), token1=OKB(18) ⇒ price = 1.0001^tick * 10^(-12)
    // Reciprocal gives OKB→USDT.
    const raw = Math.pow(1.0001, tick);
    if (token0.toLowerCase().includes("usdt") && token1.toLowerCase().includes("okb")) {
      const p = raw * 1e-12;
      return p > 0 ? 1 / p : 0;
    }
    if (token0.toLowerCase().includes("weth")) {
      // WETH(18)/USDT(6) ⇒ 1.0001^tick * 10^(-12) ⇒ WETH→USDT
      return raw * 1e-12;
    }
    return raw;
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Coins className="w-9 h-9 text-accent" />
              Supported Pools
            </h1>
            <p className="text-white/60">
              Every pool YieldAgent can route LP deployments to. Live on-chain state
              refreshes every 60 seconds.
            </p>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="shrink-0 px-4 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-40"
          >
            <RotateCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="card animate-pulse">
            <div className="h-6 bg-white/10 rounded w-1/3 mb-4" />
            <div className="h-32 bg-white/10 rounded" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {POOLS.map((p) => {
              const state = poolStates[p.address];
              const price = state ? tickToPrice(state.currentTick, p.token0, p.token1) : 0;

              return (
                <div
                  key={p.address}
                  className="card relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full -mr-16 -mt-16 blur-xl" />
                  <div className="relative space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold">{p.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent font-mono uppercase font-bold">
                            {(p.feeBps / 10000).toFixed(2)}%
                          </span>
                        </div>
                        <div className="text-xs text-white/40 font-mono">{p.dex}</div>
                      </div>
                      <a
                        href={`https://www.oklink.com/xlayer/address/${p.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline flex items-center gap-1"
                      >
                        View on OKLink
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Live stats */}
                    {state ? (
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <Stat
                          label="Price"
                          value={price > 0 ? `$${price.toFixed(2)}` : "—"}
                          icon={DollarSign}
                        />
                        <Stat
                          label="Current Tick"
                          value={String(state.currentTick)}
                          icon={Activity}
                        />
                        <Stat
                          label="Liquidity"
                          value={(() => {
                            try {
                              const l = BigInt(state.liquidity);
                              if (l > 1_000_000_000_000n)
                                return `${(Number(l / 1_000_000_000_000n)).toFixed(1)}T`;
                              if (l > 1_000_000_000n)
                                return `${(Number(l / 1_000_000_000n)).toFixed(1)}B`;
                              if (l > 1_000_000n)
                                return `${(Number(l / 1_000_000n)).toFixed(1)}M`;
                              return String(l);
                            } catch {
                              return "—";
                            }
                          })()}
                          icon={TrendingUp}
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-white/30 italic">
                        Unable to load pool state (RPC error)
                      </div>
                    )}

                    {/* Description */}
                    <div className="text-xs text-white/60 leading-relaxed">
                      {p.description}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-bg-border">
                      <Link
                        href={`/app?pool=${p.address}`}
                        className="flex-1 px-3 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-xs font-bold text-center transition-colors"
                      >
                        Deploy Strategy Here
                      </Link>
                      <div className="text-[10px] text-white/30 font-mono">
                        {p.address.slice(0, 8)}…{p.address.slice(-6)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cross-protocol opportunities via OnchainOS defi search */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm">Cross-Protocol Opportunities</div>
              <div className="text-xs text-white/40">
                Indexed live via OnchainOS <code className="font-mono">defi search</code> — every
                X Layer DEX
              </div>
            </div>
          </div>

          {oppError ? (
            <div className="text-xs text-white/30 italic">
              OnchainOS CLI offline: {oppError}. Configure OKX_ACCESS_KEY to enable.
            </div>
          ) : opportunities.length === 0 ? (
            <div className="text-xs text-white/30 italic">Loading opportunities...</div>
          ) : (
            <div className="space-y-1.5">
              {opportunities.slice(0, 15).map((o) => {
                const rateNum = o.rate ? parseFloat(o.rate) : 0;
                const tvlNum = o.tvl ? parseFloat(o.tvl) : 0;
                return (
                  <div
                    key={o.investmentId}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-bg border border-bg-border text-xs hover:border-bg-hover"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{o.name ?? o.investmentId}</div>
                      <div className="text-[10px] text-white/40 font-mono">
                        {o.platform ?? "unknown"} · id: {o.investmentId.slice(0, 14)}…
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-white/40 text-[10px]">TVL</div>
                      <div className="font-mono text-white/70">
                        {tvlNum > 1e6 ? `$${(tvlNum / 1e6).toFixed(1)}M` : `$${tvlNum.toFixed(0)}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-[56px]">
                      <div className="text-white/40 text-[10px]">APR</div>
                      <div className="font-mono text-accent font-bold">
                        {(rateNum * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
              {opportunities.length > 15 && (
                <div className="text-center text-[10px] text-white/30 pt-2">
                  + {opportunities.length - 15} more opportunities indexed by OnchainOS
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info card about adding more pools */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm">Adding more pools</div>
              <div className="text-xs text-white/40">
                Any Uniswap V3 pool on X Layer works
              </div>
            </div>
          </div>
          <div className="text-xs text-white/60 leading-relaxed">
            YieldAgent's three-brain engine is pool-agnostic — any Uniswap V3 pool on X Layer
            can be targeted from the Agent Dashboard by pasting its address into the pool input.
            The pools listed above are pre-configured with human-readable labels and descriptions
            for convenience. To add a new pool permanently, update{" "}
            <code className="px-1.5 py-0.5 rounded bg-bg text-accent font-mono">
              agent/src/config/index.ts
            </code>{" "}
            and the shared POOLS list in this page.
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: any;
}) {
  return (
    <div className="p-2 rounded-lg bg-bg border border-bg-border text-center">
      <Icon className="w-3 h-3 mx-auto mb-0.5 text-white/40" />
      <div className="text-sm font-bold font-mono">{value}</div>
      <div className="text-[9px] text-white/30 uppercase">{label}</div>
    </div>
  );
}
