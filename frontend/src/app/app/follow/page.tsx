"use client";

import { Header } from "@/components/Header";
import { Users, TrendingUp, Trophy, Crown, Award, Medal } from "lucide-react";
import { cn, formatPercent, formatUSD, shortAddress } from "@/lib/utils";

// In a real deployment these come from on-chain via FollowVaultFactory.
// For the demo we ship a static leaderboard so the UI is fully populated
// even before any user has deployed a strategy.
const DEMO_LEADERBOARD = [
  {
    rank: 1,
    agent: "0xA1b2C3d4E5F60718293a4B5c6D7e8F9012345678",
    strategy: 1,
    pair: "OKB/USDC",
    apr: 47.2,
    tvl: 184500,
    followers: 28,
    decisions: 142,
    pnl: 12.4,
  },
  {
    rank: 2,
    agent: "0xB2c3D4e5F6071829304a5B6c7D8e9F0123456789",
    strategy: 2,
    pair: "OKB/WETH",
    apr: 34.8,
    tvl: 92300,
    followers: 17,
    decisions: 98,
    pnl: 8.7,
  },
  {
    rank: 3,
    agent: "0xC3d4E5f60718293a4B5c6D7e8F90123456789ABC",
    strategy: 3,
    pair: "OKB/USDC",
    apr: 28.5,
    tvl: 67800,
    followers: 12,
    decisions: 81,
    pnl: 6.2,
  },
];

const RANK_ICONS = [Crown, Award, Medal];
const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-orange-400"];

export default function FollowPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Trophy className="w-9 h-9 text-accent" />
            Agent Leaderboard
          </h1>
          <p className="text-white/60 max-w-2xl">
            Top-performing AI agents on X Layer. Deposit USDC into a FollowVault to mirror their
            Uniswap V3 positions automatically. Agents earn 10% performance fee on profits.
          </p>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <div className="stat-label mb-1">Total Agents</div>
            <div className="text-3xl font-bold font-mono text-white">
              {DEMO_LEADERBOARD.length}
            </div>
          </div>
          <div className="card">
            <div className="stat-label mb-1">Total Followed TVL</div>
            <div className="text-3xl font-bold font-mono text-accent">
              {formatUSD(DEMO_LEADERBOARD.reduce((s, a) => s + a.tvl, 0))}
            </div>
          </div>
          <div className="card">
            <div className="stat-label mb-1">Avg Agent APR</div>
            <div className="text-3xl font-bold font-mono text-accent">
              {formatPercent(
                DEMO_LEADERBOARD.reduce((s, a) => s + a.apr, 0) / DEMO_LEADERBOARD.length
              )}
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="card">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold">Top Agents by 30d APR</div>
                <div className="text-xs text-white/50 font-mono">
                  ranked by realised performance + on-chain transparency
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {DEMO_LEADERBOARD.map((agent) => {
              const RankIcon = RANK_ICONS[agent.rank - 1];
              const rankColor = RANK_COLORS[agent.rank - 1];
              return (
                <div
                  key={agent.rank}
                  className="p-5 rounded-xl bg-bg border border-bg-border hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center bg-current/10",
                        rankColor
                      )}
                    >
                      <RankIcon className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold">Strategy #{agent.strategy}</span>
                        <span className="badge-neutral">{agent.pair}</span>
                      </div>
                      <div className="text-xs font-mono text-white/40">
                        {shortAddress(agent.agent)}
                      </div>
                    </div>

                    <div className="hidden md:flex items-center gap-6 text-right">
                      <div>
                        <div className="stat-label">APR</div>
                        <div className="text-xl font-bold font-mono text-accent">
                          {formatPercent(agent.apr)}
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">TVL</div>
                        <div className="text-xl font-bold font-mono">{formatUSD(agent.tvl)}</div>
                      </div>
                      <div>
                        <div className="stat-label">Followers</div>
                        <div className="text-xl font-bold font-mono">{agent.followers}</div>
                      </div>
                      <div>
                        <div className="stat-label">30d PnL</div>
                        <div className="text-xl font-bold font-mono text-accent">
                          +{formatPercent(agent.pnl)}
                        </div>
                      </div>
                    </div>

                    <button className="btn-primary">Follow</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* How it works */}
        <div className="card">
          <div className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            How Copy-Trading Works
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <Step
              n={1}
              title="Deposit"
              desc="Send USDC to a FollowVault. You receive vault shares representing your stake."
            />
            <Step
              n={2}
              title="Auto-mirror"
              desc="The vault holds funds; the agent's StrategyManager mirrors LP positions across all followers."
            />
            <Step
              n={3}
              title="Withdraw + share fees"
              desc="Withdraw any time. Agent takes 10% of your profit; you keep 90%."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="p-4 bg-bg rounded-xl border border-bg-border">
      <div className="text-xs uppercase tracking-wider text-accent font-mono mb-1">Step {n}</div>
      <div className="font-bold mb-1">{title}</div>
      <div className="text-sm text-white/60">{desc}</div>
    </div>
  );
}
