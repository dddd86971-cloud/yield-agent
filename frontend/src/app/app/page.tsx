"use client";

import { Header } from "@/components/Header";
import { StatusBar } from "@/components/StatusBar";
import { ThreeBrainPanel } from "@/components/ThreeBrainPanel";
import { LPRangeChart } from "@/components/LPRangeChart";
import { IntentInput } from "@/components/IntentInput";
import { AgentChat } from "@/components/AgentChat";
import { DecisionLog } from "@/components/DecisionLog";
import { useState } from "react";
import { UserIntent } from "@/lib/api";

export default function AppDashboardPage() {
  const [intent, setIntent] = useState<UserIntent | null>(null);

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Agent <span className="text-accent glow-text">Dashboard</span>
          </h1>
          <p className="text-white/60 max-w-2xl">
            Tell the agent your goals. Three brains evaluate market, pool, and risk in real time.
            Every action is logged on-chain.
          </p>
        </div>

        <StatusBar />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <IntentInput onIntent={setIntent} />
            <ThreeBrainPanel />
            <LPRangeChart />
          </div>

          <div className="space-y-6">
            <AgentChat />
          </div>
        </div>

        <DecisionLog limit={6} />
      </main>
    </div>
  );
}
