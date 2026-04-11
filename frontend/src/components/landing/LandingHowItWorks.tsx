"use client";

import { MessagesSquare, Cpu, Rocket, Eye, ArrowRight } from "lucide-react";
import Link from "next/link";
import { site } from "@/config/site";
import { SectionHeader } from "./LandingFeatures";

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Tell the agent",
    desc: 'Type your goals in plain English or Chinese — e.g. "Conservative 5k OKB/USDC, max 5% IL". The intent parser turns it into a structured strategy.',
  },
  {
    icon: Cpu,
    title: "Three brains analyse",
    desc: "Market, Pool, and Risk brains read live X Layer state in parallel: TWAP price, V3 ticks, liquidity profile, IL exposure. Sub-second three-brain evaluation.",
  },
  {
    icon: Rocket,
    title: "Deploy & auto-manage",
    desc: "Approve once. The StrategyManager opens your Uniswap V3 position, then a 5-min monitor loop rebalances, compounds fees, or holds — entirely on-chain.",
  },
  {
    icon: Eye,
    title: "Audit & copy",
    desc: "Every action — including HOLD — is written to DecisionLogger with reasoning + confidence + tx hash. Top agents get followed via FollowVault.",
  },
];

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-24 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it works"
          title="From an idea to a live LP in four steps"
          subtitle="No tick math. No spreadsheet. No 3am rebalances. You stay in your wallet — the agent handles the rest."
        />

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative">
              <div className="card h-full hover:border-accent/30 transition-colors">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                    <s.icon className="w-6 h-6" />
                  </div>
                  <div className="text-5xl font-mono font-bold text-white/[0.06] leading-none">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                </div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{s.desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="hidden lg:block absolute top-1/2 -right-4 -translate-y-1/2 w-5 h-5 text-white/20" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link
            href={site.app.launch}
            className="btn-primary text-base px-7 py-3.5 inline-flex items-center gap-2 shadow-[0_0_30px_rgba(0,255,163,0.3)] hover:shadow-[0_0_40px_rgba(0,255,163,0.5)]"
          >
            Try it now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
