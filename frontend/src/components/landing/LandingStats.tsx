"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Activity, ScrollText, Loader2 } from "lucide-react";
import { SectionHeader } from "./LandingFeatures";
import { createPublicClient, http, type PublicClient } from "viem";
import { xLayer } from "@/app/providers";
import { CONTRACTS, DEFAULT_CHAIN_ID } from "@/config/contracts";

const SM_ABI = [
  {
    name: "nextStrategyId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const DL_ABI = [
  {
    name: "getDecisionCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "strategyId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface LiveStats {
  strategies: number;
  totalDecisions: number;
}

function useOnchainStats(): LiveStats | null {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = createPublicClient({
          chain: xLayer,
          transport: http(),
        }) as PublicClient;
        const { strategyManager, decisionLogger } = CONTRACTS[DEFAULT_CHAIN_ID];

        const nextId = (await client.readContract({
          address: strategyManager,
          abi: SM_ABI,
          functionName: "nextStrategyId",
        })) as bigint;

        let totalDecisions = 0;
        for (let i = 0n; i < nextId; i++) {
          try {
            const count = (await client.readContract({
              address: decisionLogger,
              abi: DL_ABI,
              functionName: "getDecisionCount",
              args: [i],
            })) as bigint;
            totalDecisions += Number(count);
          } catch { /* skip */ }
        }

        if (!cancelled) {
          setStats({ strategies: Number(nextId), totalDecisions });
        }
      } catch {
        // RPC down — we'll show "—"
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return stats;
}

export function LandingStats() {
  const stats = useOnchainStats();

  const STATS = [
    {
      icon: ScrollText,
      label: "Decisions Logged",
      value: stats ? String(stats.totalDecisions) : null,
      sub: "On-chain on X Layer",
    },
    {
      icon: Activity,
      label: "Active Strategies",
      value: stats ? String(stats.strategies) : null,
      sub: "Deployed via StrategyManager",
    },
    {
      icon: TrendingUp,
      label: "Chain ID",
      value: "196",
      sub: "X Layer mainnet (zkEVM)",
    },
  ];

  return (
    <section id="stats" className="py-24 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow="On-chain stats"
          title="Read directly from X Layer"
          subtitle="Decision counts and strategy totals are fetched from the deployed DecisionLogger and StrategyManager contracts. No caching, no backend — your browser reads the chain."
        />

        <div className="mt-14 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="card relative overflow-hidden hover:border-accent/30 transition-colors"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-accent/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                  <s.icon className="w-5 h-5" />
                </div>
                <div className="stat-label">{s.label}</div>
                <div className="text-4xl font-bold font-mono text-white mt-1 mb-1">
                  {s.value ?? (
                    <Loader2 className="w-8 h-8 animate-spin text-white/30" />
                  )}
                </div>
                <div className="text-xs text-white/40 font-mono">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
