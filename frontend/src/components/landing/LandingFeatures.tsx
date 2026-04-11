"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Brain,
  Shield,
  ScrollText,
  Users,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const FEATURES: {
  icon: LucideIcon;
  title: string;
  desc: string;
  bullets: string[];
  accent: string;
}[] = [
  {
    icon: Activity,
    title: "Market Brain",
    desc: "Reads Uniswap V3 TWAP oracles, computes realised volatility, and classifies the trend regime so the agent knows whether to lean in or step back.",
    bullets: ["TWAP price feeds", "30-min realised vol", "Bullish / sideways / bearish"],
    accent: "from-blue-500/20 to-blue-500/0 text-blue-400 border-blue-500/30",
  },
  {
    icon: Brain,
    title: "Pool Brain",
    desc: "Decodes sqrtPriceX96 + tick state, samples liquidity distribution, and recommends a concentrated range tuned to your risk profile.",
    bullets: ["Tick math + liquidity profile", "Fee APR estimation", "Range recommendation engine"],
    accent: "from-accent/20 to-accent/0 text-accent border-accent/30",
  },
  {
    icon: Shield,
    title: "Risk Brain",
    desc: "Tracks impermanent loss with the closed-form V3 formula, monitors range edge, and decides when to rebalance, compound, or pull the eject lever.",
    bullets: ["Concentrated IL math", "Position health %", "Auto rebalance / emergency exit"],
    accent: "from-orange-500/20 to-orange-500/0 text-orange-400 border-orange-500/30",
  },
];

const PILLARS: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: ScrollText,
    title: "DecisionLogger — every action on-chain",
    desc: "Every AI decision (including HOLD) is written to the DecisionLogger contract with reasoning, confidence, and a tx hash. Anyone can audit your agent end-to-end on OKLink.",
  },
  {
    icon: Sparkles,
    title: "Plain-English intent parsing",
    desc: "Type \"Conservative 5k OKB/USDC, max 5% IL\" or \"激进 1万 OKB/ETH 30% APR\". The IntentParser turns natural language into structured strategy parameters in seconds.",
  },
  {
    icon: Users,
    title: "FollowVault — copy alpha as an asset",
    desc: "Top-performing agents publish a FollowVault. Deposit USDC, get vault shares, mirror the position automatically. The agent earns 10% on profit only — high-water-mark style.",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="py-24 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow="Three brains, one agent"
          title="Built like a real desk, not a chatbot"
          subtitle="Most AI DeFi tools are a black-box LLM glued to a swap router. YieldAgent splits responsibility into three independent engines, then logs every decision on-chain so the alpha is auditable."
        />

        {/* Three brains grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`card relative overflow-hidden hover:border-accent/30 transition-colors`}
            >
              <div
                className={`absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br ${f.accent.split(" ")[0]} ${f.accent.split(" ")[1]} blur-2xl`}
              />
              <div
                className={`relative w-12 h-12 rounded-xl border ${f.accent.split(" ").slice(2).join(" ")} bg-current/5 flex items-center justify-center mb-5`}
              >
                <f.icon className="w-6 h-6" />
              </div>
              <div className="relative">
                <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-5">{f.desc}</p>
                <ul className="space-y-1.5">
                  {f.bullets.map((b) => (
                    <li
                      key={b}
                      className="text-xs font-mono text-white/40 flex items-center gap-2"
                    >
                      <span className="w-1 h-1 rounded-full bg-accent" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Pillars row */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {PILLARS.map((p) => (
            <div key={p.title} className="card hover:border-accent/30 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                <p.icon className="w-5 h-5" />
              </div>
              <h4 className="font-bold mb-2">{p.title}</h4>
              <p className="text-sm text-white/60 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  align?: "center" | "left";
  children?: ReactNode;
}) {
  const wrap =
    align === "center" ? "max-w-3xl mx-auto text-center" : "max-w-3xl";
  const eyebrowJustify = align === "center" ? "justify-center" : "";
  return (
    <div className={wrap}>
      <div
        className={`inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.15em] text-accent mb-4 ${eyebrowJustify}`}
      >
        <span className="w-6 h-px bg-accent/60" />
        {eyebrow}
        <span className="w-6 h-px bg-accent/60" />
      </div>
      <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
        {title}
      </h2>
      {subtitle && (
        <p className="text-white/60 text-base md:text-lg leading-relaxed">{subtitle}</p>
      )}
      {children}
    </div>
  );
}
