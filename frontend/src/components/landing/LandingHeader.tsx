"use client";

import Link from "next/link";
import { Brain, ExternalLink } from "lucide-react";
import { site } from "@/config/site";
import { XIcon } from "../icons/XIcon";

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#stats", label: "Stats" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  return (
    <header className="border-b border-bg-border bg-bg/70 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-5 md:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center shadow-[0_0_18px_rgba(0,255,163,0.3)]">
            <Brain className="w-5 h-5 text-bg" />
          </div>
          <div className="font-bold text-base sm:text-lg leading-tight">{site.name}</div>
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-bg-border text-[10px] font-mono uppercase tracking-wider text-white/50">
            <span className="w-1 h-1 rounded-full bg-accent" />
            {site.chain.name}
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-bg-hover transition-colors"
            >
              {item.label}
            </a>
          ))}
          <a
            href={site.links.docs}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-bg-hover transition-colors flex items-center gap-1.5"
          >
            Docs <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </nav>

        <div className="flex items-center gap-1.5">
          <a
            href={site.links.twitter}
            target="_blank"
            rel="noreferrer"
            aria-label="Follow on X"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-bg-hover transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </a>
          <Link
            href={site.app.launch}
            className="btn-primary text-sm px-4 py-2 shadow-[0_0_24px_rgba(0,255,163,0.25)] hover:shadow-[0_0_32px_rgba(0,255,163,0.45)]"
          >
            Launch App
          </Link>
        </div>
      </div>
    </header>
  );
}
