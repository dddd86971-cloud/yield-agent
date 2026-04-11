"use client";

import { Check, X, Minus } from "lucide-react";
import { SectionHeader } from "./LandingFeatures";
import { cn } from "@/lib/utils";

type Cell = "yes" | "no" | "partial";

const ROWS: { feature: string; diy: Cell; blackbox: Cell; yieldagent: Cell; note?: string }[] = [
  {
    feature: "Plain-English intent → strategy",
    diy: "no",
    blackbox: "yes",
    yieldagent: "yes",
  },
  {
    feature: "Sub-second three-brain analysis",
    diy: "no",
    blackbox: "partial",
    yieldagent: "yes",
  },
  {
    feature: "Reasoning written on-chain (auditable)",
    diy: "no",
    blackbox: "no",
    yieldagent: "yes",
  },
  {
    feature: "Non-custodial — funds stay in your contract",
    diy: "yes",
    blackbox: "partial",
    yieldagent: "yes",
  },
  {
    feature: "Concentrated IL math + auto rebalance",
    diy: "partial",
    blackbox: "yes",
    yieldagent: "yes",
  },
  {
    feature: "Copy-trading via FollowVault",
    diy: "no",
    blackbox: "no",
    yieldagent: "yes",
  },
  {
    feature: "5-min monitoring loop with sub-cent gas",
    diy: "no",
    blackbox: "no",
    yieldagent: "yes",
  },
  {
    feature: "Performance fee on profit only (HWM)",
    diy: "yes",
    blackbox: "no",
    yieldagent: "yes",
  },
];

const CellIcon = ({ value }: { value: Cell }) => {
  if (value === "yes")
    return (
      <span className="inline-flex w-7 h-7 rounded-full bg-accent/15 items-center justify-center">
        <Check className="w-4 h-4 text-accent" strokeWidth={3} />
      </span>
    );
  if (value === "partial")
    return (
      <span className="inline-flex w-7 h-7 rounded-full bg-white/[0.06] items-center justify-center">
        <Minus className="w-4 h-4 text-white/40" strokeWidth={3} />
      </span>
    );
  return (
    <span className="inline-flex w-7 h-7 rounded-full bg-white/[0.04] items-center justify-center">
      <X className="w-4 h-4 text-white/25" strokeWidth={3} />
    </span>
  );
};

export function LandingComparison() {
  return (
    <section id="compare" className="py-24 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <SectionHeader
          eyebrow="How we compare"
          title="The difference is auditability"
          subtitle="Most AI DeFi tools are a black-box LLM glued to a swap router. Manual LP management is a part-time job. YieldAgent is the only one where every decision lives on-chain."
        />

        <div className="mt-14 max-w-5xl mx-auto">
          {/* Desktop table */}
          <div className="hidden md:block card !p-0 overflow-hidden">
            <div className="grid grid-cols-12 px-6 py-4 border-b border-bg-border bg-white/[0.02]">
              <div className="col-span-6 text-[11px] font-mono uppercase tracking-[0.15em] text-white/40">
                Capability
              </div>
              <div className="col-span-2 text-center text-[11px] font-mono uppercase tracking-[0.15em] text-white/40">
                DIY LP
              </div>
              <div className="col-span-2 text-center text-[11px] font-mono uppercase tracking-[0.15em] text-white/40">
                Black-box AI
              </div>
              <div className="col-span-2 text-center text-[11px] font-mono uppercase tracking-[0.15em] text-accent">
                YieldAgent
              </div>
            </div>
            {ROWS.map((row, i) => (
              <div
                key={row.feature}
                className={cn(
                  "grid grid-cols-12 px-6 py-4 items-center transition-colors hover:bg-white/[0.015]",
                  i !== ROWS.length - 1 && "border-b border-bg-border"
                )}
              >
                <div className="col-span-6 text-sm text-white/80">{row.feature}</div>
                <div className="col-span-2 flex justify-center">
                  <CellIcon value={row.diy} />
                </div>
                <div className="col-span-2 flex justify-center">
                  <CellIcon value={row.blackbox} />
                </div>
                <div className="col-span-2 flex justify-center">
                  <CellIcon value={row.yieldagent} />
                </div>
              </div>
            ))}
          </div>

          {/* Mobile stack */}
          <div className="md:hidden space-y-3">
            {ROWS.map((row) => (
              <div key={row.feature} className="card !p-4">
                <div className="text-sm font-medium text-white mb-3">{row.feature}</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                      DIY
                    </div>
                    <div className="flex justify-center">
                      <CellIcon value={row.diy} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-2">
                      Black-box
                    </div>
                    <div className="flex justify-center">
                      <CellIcon value={row.blackbox} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-accent mb-2">
                      YieldAgent
                    </div>
                    <div className="flex justify-center">
                      <CellIcon value={row.yieldagent} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-mono text-white/40">
            <span className="inline-flex items-center gap-2">
              <CellIcon value="yes" /> Full support
            </span>
            <span className="inline-flex items-center gap-2">
              <CellIcon value="partial" /> Partial / manual
            </span>
            <span className="inline-flex items-center gap-2">
              <CellIcon value="no" /> Not supported
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
