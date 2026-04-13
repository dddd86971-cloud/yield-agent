"use client";

import { useAgentState } from "@/lib/hooks";
import { AlertTriangle, TrendingDown, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function AlertBanner() {
  const { alerts } = useAgentState();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.timestamp));
  if (visible.length === 0) return null;

  const latest = visible[visible.length - 1];

  return (
    <div
      className={cn(
        "mx-6 mt-2 px-4 py-3 rounded-xl border flex items-center gap-3 text-sm font-mono",
        latest.severity === "critical"
          ? "bg-danger/10 border-danger/30 text-danger"
          : latest.severity === "warn"
            ? "bg-warn/10 border-warn/30 text-warn"
            : "bg-accent/10 border-accent/30 text-accent",
      )}
    >
      {latest.message?.includes("dropped") ? (
        <TrendingDown className="w-4 h-4 flex-shrink-0" />
      ) : latest.message?.includes("surged") ? (
        <TrendingUp className="w-4 h-4 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      )}
      <span className="flex-1">{latest.message}</span>
      <button
        onClick={() => setDismissed((s) => new Set(s).add(latest.timestamp))}
        className="text-white/40 hover:text-white"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
