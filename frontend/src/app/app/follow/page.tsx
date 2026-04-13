"use client";

import { Header } from "@/components/Header";
import { useState, useEffect } from "react";
import {
  Users,
  TrendingUp,
  Trophy,
  Loader2,
  Activity,
  ExternalLink,
} from "lucide-react";
import {
  fetchRecentDecisions,
  type OnchainDecision,
  poolLabelForStrategy,
} from "@/lib/onchainDecisions";
import { formatTimeAgo, cn } from "@/lib/utils";

interface StrategyInfo {
  strategyId: number;
  decisionCount: number;
  pool: string;
  lastDecision?: OnchainDecision;
}

export default function FollowPage() {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentDecisions(9999)
      .then((decisions) => {
        const map = new Map<number, OnchainDecision[]>();
        for (const d of decisions) {
          const sid = Number(d.strategyId);
          if (!map.has(sid)) map.set(sid, []);
          map.get(sid)!.push(d);
        }
        const infos: StrategyInfo[] = [];
        for (const [sid, decs] of map) {
          infos.push({
            strategyId: sid,
            decisionCount: decs.length,
            pool: poolLabelForStrategy(BigInt(sid)),
            lastDecision: decs[0],
          });
        }
        infos.sort((a, b) => b.decisionCount - a.decisionCount);
        setStrategies(infos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalDecisions = strategies.reduce(
    (s, a) => s + a.decisionCount,
    0,
  );

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
            AI agents running live on X Layer. FollowVault copy-trading lets
            you mirror their strategies automatically.
          </p>
        </div>

        {/* Real on-chain stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat
            label="Active Strategies"
            value={loading ? null : String(strategies.length)}
            sub="on-chain"
          />
          <Stat
            label="Total Decisions"
            value={loading ? null : String(totalDecisions)}
            sub="DecisionLogger"
            accent
          />
          <Stat label="Followers" value="0" sub="be the first" dim />
          <Stat label="Total TVL" value="$0" sub="FollowVault" dim />
        </div>

        {/* FollowVault contract status */}
        <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 text-sm font-mono">
          <div className="flex items-center gap-2 text-accent mb-1 font-bold">
            <Activity className="w-4 h-4" />
            FollowVault — Deployed, Ready for Followers
          </div>
          <div className="text-white/60">
            Factory deployed at{" "}
            <a
              href="https://www.oklink.com/xlayer/address/0x9203C9d95115652b5799ab9e9A640DDEB0879F85"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              0x9203...F85
              <ExternalLink className="w-3 h-3 inline ml-1" />
            </a>{" "}
            on X Layer mainnet. Zero vaults created so far — deposit USDT to
            become the first follower and mirror an agent strategy.
          </div>
        </div>

        {/* Real strategies from chain */}
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold">Live Strategies</div>
              <div className="text-xs text-white/50 font-mono">
                real on-chain data from StrategyManager + DecisionLogger
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 rounded-xl bg-bg border border-bg-border animate-pulse">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-bg-border" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-bg-border rounded w-1/3" />
                      <div className="h-3 bg-bg-border rounded w-2/3" />
                    </div>
                    <div className="h-10 w-28 bg-bg-border rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : strategies.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              No strategies found on chain
            </div>
          ) : (
            <div className="space-y-3">
              {strategies.map((s) => (
                <div
                  key={s.strategyId}
                  className="p-5 rounded-xl bg-bg border border-bg-border hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-bold font-mono text-lg">
                      #{s.strategyId}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold">
                          Strategy #{s.strategyId}
                        </span>
                        <span className="badge-neutral">{s.pool}</span>
                      </div>
                      {s.lastDecision && (
                        <div className="text-xs text-white/40 font-mono truncate">
                          Last: {s.lastDecision.action} (
                          {formatTimeAgo(s.lastDecision.timestampMs)}) —{" "}
                          {s.lastDecision.reasoning.slice(0, 80)}
                          {s.lastDecision.reasoning.length > 80 ? "..." : ""}
                        </div>
                      )}
                    </div>

                    <div className="hidden md:flex items-center gap-6 text-right">
                      <div>
                        <div className="stat-label">Decisions</div>
                        <div className="text-xl font-bold font-mono text-accent">
                          {s.decisionCount}
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">Followers</div>
                        <div className="text-xl font-bold font-mono text-white/30">
                          0
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">TVL</div>
                        <div className="text-xl font-bold font-mono text-white/30">
                          $0
                        </div>
                      </div>
                    </div>

                    <button
                      disabled
                      className="px-4 py-2.5 text-sm rounded-xl bg-bg-border text-white/40 cursor-not-allowed font-bold"
                    >
                      Coming Soon
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
              desc="Send USDT to a FollowVault. You receive vault shares representing your stake."
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

function Stat({
  label,
  value,
  sub,
  accent,
  dim,
}: {
  label: string;
  value: string | null;
  sub: string;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="card">
      <div className="stat-label mb-1">{label}</div>
      <div
        className={cn(
          "text-3xl font-bold font-mono",
          accent ? "text-accent" : dim ? "text-white/30" : "text-white",
        )}
      >
        {value === null ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          value
        )}
      </div>
      <div className="text-xs text-white/40 font-mono mt-1">{sub}</div>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
}: {
  n: number;
  title: string;
  desc: string;
}) {
  return (
    <div className="p-4 bg-bg rounded-xl border border-bg-border">
      <div className="text-xs uppercase tracking-wider text-accent font-mono mb-1">
        Step {n}
      </div>
      <div className="font-bold mb-1">{title}</div>
      <div className="text-sm text-white/60">{desc}</div>
    </div>
  );
}
