/**
 * Site-wide configuration: branding, social, and external links.
 * Keep this file as the single source of truth for everything that
 * could be re-themed/re-branded later.
 */

export const site = {
  name: "YieldAgent",
  tagline: "On-chain AI LP Manager",
  description:
    "AI-powered Uniswap V3 LP manager on X Layer. Tell the agent your goals in plain English. Three brains — market, pool, risk — manage your liquidity 24/7. Every decision is logged on-chain, verifiable, and copyable.",
  url: "https://yieldagent.xyz",
  twitterHandle: "YieldAgentXYZ",

  links: {
    twitter: "https://x.com/YieldAgentXYZ",
    github: "https://github.com/yieldagent/yield-agent",
    docs: "https://docs.yieldagent.xyz",
    discord: "https://discord.gg/yieldagent",
    explorer: "https://www.oklink.com/xlayer",
    xLayer: "https://www.okx.com/xlayer",
  },

  chain: {
    name: "X Layer",
    chainId: 196,
    rpc: "https://rpc.xlayer.tech",
    nativeCurrency: "OKB",
    explorer: "https://www.oklink.com/xlayer",
  },

  app: {
    // Path where the dashboard lives. Landing CTAs link here.
    launch: "/app",
  },
} as const;
