"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2 } from "lucide-react";
import { site } from "@/config/site";
import { LiveDecisionStream } from "./LiveDecisionStream";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background grid + glow */}
      <div className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 60% 60% at 50% 0%, black 30%, transparent 80%)",
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-accent/20 rounded-full blur-[180px]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left: copy + CTAs */}
          <div className="lg:col-span-6 text-center lg:text-left animate-fade-in-up">
            {/* Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-accent/30 bg-accent/10 text-[11px] font-mono uppercase tracking-[0.15em] text-accent mb-7">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Live on {site.chain.name} · zkEVM L2
            </div>

            {/* Heading */}
            <h1 className="text-[40px] sm:text-6xl lg:text-[64px] xl:text-7xl font-bold tracking-tight leading-[1.02] mb-6">
              The on-chain
              <br />
              <span className="text-accent glow-text">AI LP Manager</span>
              <br />
              <span className="text-white/90">for everyone.</span>
            </h1>

            <p className="text-base md:text-lg text-white/60 max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              Tell the agent your goals in plain English. Three brains —{" "}
              <span className="text-white">market</span>,{" "}
              <span className="text-white">pool</span>,{" "}
              <span className="text-white">risk</span> — manage your on-chain liquidity 24/7.
              Every trade signed through OnchainOS, every decision logged on-chain.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 sm:gap-4 mb-8">
              <Link
                href={site.app.launch}
                className="btn-primary text-base px-7 py-3.5 inline-flex items-center gap-2 shadow-[0_0_30px_rgba(0,255,163,0.3)] hover:shadow-[0_0_40px_rgba(0,255,163,0.5)] hover:scale-[1.02] transition-all w-full sm:w-auto justify-center"
              >
                Launch App <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href={site.links.docs}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost text-base px-7 py-3.5 inline-flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                <BookOpen className="w-4 h-4" /> Read the Docs
              </a>
            </div>

            {/* Trust row */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-[11px] font-mono text-white/45">
              {[
                "Non-custodial",
                "Open-source",
                "On-chain decisions",
                "10% perf. fee on profit",
              ].map((label) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Right: live decision stream */}
          <div
            className="lg:col-span-6 animate-fade-in-up"
            style={{ animationDelay: "120ms" }}
          >
            <LiveDecisionStream />
          </div>
        </div>
      </div>
    </section>
  );
}
