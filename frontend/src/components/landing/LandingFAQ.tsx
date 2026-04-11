"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./LandingFeatures";
import { site } from "@/config/site";

const FAQ = [
  {
    q: "Is YieldAgent custodial?",
    a: "No. The agent address you authorise can only call StrategyManager functions on positions you opened. Funds sit in the StrategyManager contract or your own FollowVault — never in a centralised custodian. You can revoke the agent or emergency-exit at any time from the dashboard.",
  },
  {
    q: "How does the AI actually work?",
    a: "Three deterministic engines (Market, Pool, Risk) read on-chain state in parallel and produce structured analysis: TWAP price, realised volatility, current ticks, liquidity profile, IL exposure, range health. An LLM is only used for two things: parsing natural-language intent into a structured strategy, and writing a short human-readable reasoning string for the on-chain DecisionLogger.",
  },
  {
    q: "What's logged on-chain exactly?",
    a: "Every action — DEPLOY, REBALANCE, COMPOUND, HOLD, EMERGENCY_EXIT — is written to the DecisionLogger contract with: action type, confidence (0–100), reasoning text (≤200 chars), block timestamp, and the tx hash of the underlying execution. You can audit any agent's full history on OKLink.",
  },
  {
    q: "What are the fees?",
    a: "Zero protocol fee on the strategy itself. If someone follows your strategy through a FollowVault, the agent that runs the strategy collects 10% of realised profit only — high-water-mark style, so you never pay performance fee on losses.",
  },
  {
    q: "Why X Layer?",
    a: "OKX X Layer is a zkEVM L2 with sub-cent gas (~0.05 gwei), native OKB gas, deep OKB/USDC liquidity, and direct access from the OKX exchange. That makes 5-minute monitoring loops + frequent rebalances economically viable in a way they aren't on mainnet.",
  },
  {
    q: "Are the contracts open-source / audited?",
    a: "All four contracts (StrategyManager, DecisionLogger, FollowVault, FollowVaultFactory) are open-source and verified on OKLink. Pre-mainnet they will have an external audit; check the Docs for the latest report.",
  },
];

export function LandingFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow="Frequently asked"
          title="Questions you should be asking"
          subtitle={
            <>
              If we don&apos;t have a good answer, you shouldn&apos;t be using us. If we missed
              yours,{" "}
              <a
                href={site.links.twitter}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                ping us on X
              </a>
              .
            </>
          }
        />

        <div className="mt-14 max-w-3xl mx-auto space-y-3">
          {FAQ.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className={cn(
                  "card !p-0 overflow-hidden transition-all",
                  isOpen
                    ? "border-accent/40 bg-accent/[0.03] shadow-[0_0_0_1px_rgba(0,255,163,0.15),0_8px_32px_-8px_rgba(0,255,163,0.18)]"
                    : "hover:border-white/15"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left gap-4 group"
                  aria-expanded={isOpen}
                >
                  <span
                    className={cn(
                      "font-bold transition-colors",
                      isOpen ? "text-white" : "text-white/90 group-hover:text-white"
                    )}
                  >
                    {item.q}
                  </span>
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all",
                      isOpen
                        ? "bg-accent/15 text-accent"
                        : "bg-bg-border text-white/40 group-hover:text-white/70"
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </span>
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 -mt-1 text-sm text-white/65 leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
