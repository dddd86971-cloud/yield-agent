"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { site } from "@/config/site";

export function LandingCTA() {
  return (
    <section className="py-24 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-b from-accent/[0.08] to-transparent p-10 md:p-16 text-center">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-accent/20 rounded-full blur-[140px]" />
          </div>

          <div className="text-xs font-mono uppercase tracking-wider text-accent mb-3">
            Ready when you are
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-5 max-w-3xl mx-auto leading-[1.05]">
            Stop babysitting <span className="text-accent glow-text">your LP</span>.
          </h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto mb-10">
            Connect a wallet, type one sentence, and let YieldAgent run on {site.chain.name}. No
            signups. No custody. No tick math.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={site.app.launch}
              className="btn-primary text-base px-7 py-3.5 inline-flex items-center gap-2 shadow-[0_0_30px_rgba(0,255,163,0.3)] hover:shadow-[0_0_40px_rgba(0,255,163,0.5)]"
            >
              Launch App <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={site.links.docs}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost text-base px-7 py-3.5 inline-flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" /> Read the Docs
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
