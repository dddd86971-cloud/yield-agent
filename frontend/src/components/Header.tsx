"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { Brain, Users, BookOpen, ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { site } from "@/config/site";
import { XIcon } from "./icons/XIcon";
import { useAccount, useBalance } from "wagmi";

const NAV = [
  { href: "/app", label: "Agent", icon: Brain },
  { href: "/app/decisions", label: "Decision Log", icon: BookOpen },
  { href: "/app/follow", label: "Follow", icon: Users },
];

export function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { data: usdtBalance } = useBalance({
    address,
    token: "0x779ded0c9e1022225f8e0630b35a9b54be713736" as `0x${string}`,
    query: { enabled: isConnected },
  });
  return (
    <header className="border-b border-bg-border bg-bg/80 backdrop-blur-xl sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent-dim flex items-center justify-center">
            <Brain className="w-5 h-5 text-bg" />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">{site.name}</div>
            <div className="text-xs text-white/40 font-mono">on {site.chain.name}</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-white/60 hover:text-white hover:bg-bg-hover"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={site.links.docs}
            target="_blank"
            rel="noreferrer"
            className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-white/60 hover:text-white hover:bg-bg-hover transition-colors"
          >
            Docs <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href={site.links.twitter}
            target="_blank"
            rel="noreferrer"
            aria-label="Follow on X"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-bg-hover transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </a>
          <ConnectButton showBalance={true} chainStatus="icon" />
          {isConnected && usdtBalance && (
            <div className="text-xs font-mono text-white/50 px-2">
              {parseFloat(usdtBalance.formatted).toFixed(2)} USDT
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
