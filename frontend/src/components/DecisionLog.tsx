"use client";

import { useAgentState } from "@/lib/hooks";
import { cn, formatTimeAgo, shortHash, actionColor } from "@/lib/utils";
import {
  Activity,
  Pause,
  RotateCw,
  Coins,
  AlertTriangle,
  Rocket,
  ExternalLink,
} from "lucide-react";

const ACTION_ICONS: Record<string, any> = {
  hold: Pause,
  rebalance: RotateCw,
  compound: Coins,
  emergency_exit: AlertTriangle,
  deploy: Rocket,
};

export function DecisionLog({ limit = 10 }: { limit?: number }) {
  const { history } = useAgentState();
  const decisions = [...history].reverse().slice(0, limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold">On-chain Decision Log</div>
            <div className="text-xs text-white/50 font-mono">verifiable AI history</div>
          </div>
        </div>
        <div className="text-xs text-white/40 font-mono">{history.length} total</div>
      </div>

      <div className="space-y-2">
        {decisions.length === 0 && (
          <div className="text-center py-12 text-white/30 font-mono text-sm">
            No decisions yet. Deploy a strategy to start.
          </div>
        )}

        {decisions.map((dec, i) => {
          const Icon = ACTION_ICONS[dec.action] || Activity;
          return (
            <div
              key={`${dec.timestamp}-${i}`}
              className="p-4 rounded-xl bg-bg border border-bg-border hover:border-bg-hover transition-colors"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                    actionColor(dec.action),
                    "bg-current/10"
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("font-bold uppercase text-sm", actionColor(dec.action))}>
                      {dec.action.replace("_", " ")}
                    </span>
                    <span className="text-xs text-white/30 font-mono">
                      {formatTimeAgo(dec.timestamp)}
                    </span>
                    <span className="ml-auto text-xs font-mono text-white/40">
                      conf {dec.confidence}%
                    </span>
                  </div>

                  <div className="text-sm text-white/70 mb-2">
                    {dec.reasoning}
                  </div>

                  {dec.txHash && (
                    <a
                      href={`https://www.oklink.com/xlayer/tx/${dec.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-mono text-accent hover:text-accent-dim transition-colors"
                    >
                      {shortHash(dec.txHash)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
