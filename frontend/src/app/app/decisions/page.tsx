"use client";

import { Header } from "@/components/Header";
import { DecisionLog } from "@/components/DecisionLog";
import { useAgentState } from "@/lib/hooks";
import { BookOpen, Activity, RotateCw, Coins, AlertTriangle, Lock } from "lucide-react";
import { useAccount } from "wagmi";
import { ownsStrategy } from "@/lib/strategyOwnership";

export default function DecisionsPage() {
  const { history, state } = useAgentState();
  const { isConnected, address } = useAccount();

  // Gate: only the strategy deployer can see decision stats
  const isOwner = isConnected && address && state?.strategyId != null && ownsStrategy(address, state.strategyId);

  const stats = {
    total: history.length,
    deploys: history.filter((h) => h.action === "deploy").length,
    rebalances: history.filter((h) => h.action === "rebalance").length,
    compounds: history.filter((h) => h.action === "compound").length,
    holds: history.filter((h) => h.action === "hold").length,
    exits: history.filter((h) => h.action === "emergency_exit").length,
  };

  const avgConfidence =
    history.length > 0
      ? Math.round(history.reduce((s, h) => s + h.confidence, 0) / history.length)
      : 0;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <BookOpen className="w-9 h-9 text-accent" />
            Decision Log
          </h1>
          <p className="text-white/60">
            Every AI decision is logged on-chain via DecisionLogger. Audit reasoning, confidence,
            and tx hashes — verifiable forever.
          </p>
        </div>

        {!isOwner ? (
          /* Locked state — wallet not connected or not the deployer */
          <div className="card text-center py-16">
            <Lock className="w-10 h-10 text-white/15 mx-auto mb-4" />
            <div className="text-lg font-bold text-white/40 mb-2">
              {!isConnected ? "Connect Wallet to View Decisions" : "No Strategy Found"}
            </div>
            <div className="text-sm text-white/30 max-w-md mx-auto">
              {!isConnected
                ? "Your AI decision history is private. Connect your wallet to view decisions for strategies you deployed."
                : "Deploy a strategy from the Agent Dashboard first. Only the deployer can view their strategy's decision log."}
            </div>
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <StatCard label="Total" value={stats.total} color="text-white" />
              <StatCard label="Deploy" value={stats.deploys} color="text-accent" icon={Activity} />
              <StatCard label="Rebalance" value={stats.rebalances} color="text-warn" icon={RotateCw} />
              <StatCard label="Compound" value={stats.compounds} color="text-blue-400" icon={Coins} />
              <StatCard label="Hold" value={stats.holds} color="text-white/60" />
              <StatCard label="Exit" value={stats.exits} color="text-danger" icon={AlertTriangle} />
            </div>

            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="stat-label">Average Confidence</div>
                  <div className="text-3xl font-bold font-mono text-accent">{avgConfidence}%</div>
                </div>
                <div className="text-right">
                  <div className="stat-label">All Decisions On-chain</div>
                  <div className="text-sm text-white/60 font-mono">via DecisionLogger.sol</div>
                </div>
              </div>
            </div>

            {history.length === 0 && (
              <div className="card text-center py-12">
                <BookOpen className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <div className="text-lg font-bold text-white/40 mb-2">No decisions yet</div>
                <div className="text-sm text-white/30">
                  Deploy a strategy from the Agent Dashboard to start generating decisions.
                </div>
              </div>
            )}

            <DecisionLog limit={50} />
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon?: any;
}) {
  return (
    <div className="card py-4">
      <div className="flex items-center justify-between mb-1">
        <div className="stat-label">{label}</div>
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
      </div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}
