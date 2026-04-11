"use client";

import Link from "next/link";
import { Github, BookOpen, Brain, ExternalLink } from "lucide-react";
import { site } from "@/config/site";
import { XIcon } from "../icons/XIcon";

const LINK_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Launch App", href: site.app.launch, external: false },
      { label: "Decision Log", href: `${site.app.launch}/decisions`, external: false },
      { label: "Follow Vaults", href: `${site.app.launch}/follow`, external: false },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: site.links.docs, external: true },
      { label: "GitHub", href: site.links.github, external: true },
      { label: "OKLink Explorer", href: site.links.explorer, external: true },
    ],
  },
  {
    title: "Network",
    links: [
      { label: "X Layer", href: site.links.xLayer, external: true },
      { label: "Bridge to X Layer", href: "https://www.okx.com/xlayer/bridge", external: true },
      { label: "Get test OKB", href: "https://www.okx.com/xlayer/faucet", external: true },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-bg-border bg-bg pt-16 pb-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-x-8 gap-y-12 mb-14">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-6">
            <Link href="/" className="inline-flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center shadow-[0_0_24px_rgba(0,255,163,0.25)]">
                <Brain className="w-5 h-5 text-bg" />
              </div>
              <div>
                <div className="font-bold text-lg leading-tight">{site.name}</div>
                <div className="text-xs text-white/40 font-mono">{site.tagline}</div>
              </div>
            </Link>
            <p className="text-sm text-white/55 max-w-sm leading-relaxed mb-6">
              The on-chain AI LP manager for Uniswap V3 on {site.chain.name}. Three brains, one
              transparent agent.
            </p>

            <div className="flex items-center gap-2">
              <a
                href={site.links.twitter}
                target="_blank"
                rel="noreferrer"
                aria-label="Follow on X"
                className="w-9 h-9 rounded-lg bg-bg-card border border-bg-border flex items-center justify-center text-white/60 hover:text-accent hover:border-accent/40 transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </a>
              <a
                href={site.links.github}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="w-9 h-9 rounded-lg bg-bg-card border border-bg-border flex items-center justify-center text-white/60 hover:text-accent hover:border-accent/40 transition-colors"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href={site.links.docs}
                target="_blank"
                rel="noreferrer"
                aria-label="Docs"
                className="w-9 h-9 rounded-lg bg-bg-card border border-bg-border flex items-center justify-center text-white/60 hover:text-accent hover:border-accent/40 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {LINK_GROUPS.map((group) => (
            <div key={group.title} className="md:col-span-2">
              <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-white/40 mb-4">
                {group.title}
              </div>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-white/65 hover:text-accent transition-colors inline-flex items-center gap-1.5"
                      >
                        {link.label}
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-white/65 hover:text-accent transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-bg-border flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-white/30 font-mono">
          <div>© {new Date().getFullYear()} {site.name}. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span>Built for OKX X Layer · Hackathon Season 2</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Chain {site.chain.chainId}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
