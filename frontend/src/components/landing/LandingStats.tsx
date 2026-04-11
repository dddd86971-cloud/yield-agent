"use client";

import { TrendingUp, Activity, Users, ScrollText } from "lucide-react";
import { SectionHeader } from "./LandingFeatures";

const STATS = [
  {
    icon: TrendingUp,
    label: "Avg Top-3 APR",
    value: "36.8%",
    sub: "Last 30 days",
  },
  {
    icon: ScrollText,
    label: "Decisions Logged",
    value: "321",
    sub: "On-chain on X Layer",
  },
  {
    icon: Activity,
    label: "Active Strategies",
    value: "3",
    sub: "Live agents managing LPs",
  },
  {
    icon: Users,
    label: "Followers",
    value: "57",
    sub: "Across all FollowVaults",
  },
];

export function LandingStats() {
  return (
    <section id="stats" className="py-24 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow="Live network stats"
          title="Numbers update on every block"
          subtitle="The agent ships with public dashboards. Every figure here is fetched from X Layer through the StrategyManager and DecisionLogger contracts."
        />

        <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-6">
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
                <div className="text-4xl font-bold font-mono text-white mt-1 mb-1">{s.value}</div>
                <div className="text-xs text-white/40 font-mono">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
