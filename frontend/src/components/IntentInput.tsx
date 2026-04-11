"use client";

import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { api, UserIntent } from "@/lib/api";
import { cn, formatUSD } from "@/lib/utils";

const SAMPLE_PROMPTS = [
  "Stable yield on $5000 with OKB/USDC, max 5% IL",
  "Aggressive farming, 1万U, target 30% APR",
  "Conservative LP for OKB with 2000 USDC",
];

export function IntentInput({ onIntent }: { onIntent: (intent: UserIntent) => void }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<UserIntent | null>(null);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.parseIntent(input);
      setIntent(result);
      onIntent(result);
    } catch (err: any) {
      setError(err.message || "Failed to parse intent");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold">Tell the Agent What You Want</div>
          <div className="text-xs text-white/50 font-mono">natural language → on-chain strategy</div>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Conservative OKB/USDC LP with $5000, target 15% APR"
          rows={3}
          className="w-full bg-bg border border-bg-border rounded-xl px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:border-accent/50 transition-colors"
          disabled={loading}
        />
        <button
          onClick={submit}
          disabled={loading || !input.trim()}
          className={cn(
            "absolute bottom-3 right-3 w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            input.trim() && !loading
              ? "bg-accent text-bg hover:bg-accent-dim"
              : "bg-bg-border text-white/30 cursor-not-allowed"
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Sample prompts */}
      <div className="mt-3 flex flex-wrap gap-2">
        {SAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => setInput(p)}
            className="text-xs px-3 py-1.5 rounded-lg bg-bg-border hover:bg-bg-hover text-white/60 hover:text-white transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-3 text-sm text-danger">{error}</div>
      )}

      {/* Parsed intent preview */}
      {intent && (
        <div className="mt-4 p-4 bg-bg rounded-xl border border-accent/20">
          <div className="text-xs uppercase tracking-wider text-accent font-mono mb-3">
            Parsed Intent
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Field label="Principal" value={formatUSD(intent.principal)} />
            <Field label="Risk" value={intent.riskProfile} mono />
            <Field
              label="Target APR"
              value={`${intent.targetAPRMin}-${intent.targetAPRMax}%`}
              mono
            />
            <Field label="Max IL" value={`${intent.maxILTolerance}%`} mono />
          </div>
          <div className="mt-3">
            <div className="stat-label mb-1">Pairs</div>
            <div className="flex gap-1.5 flex-wrap">
              {intent.preferredPairs.map((p) => (
                <span key={p} className="badge-neutral">{p}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={cn("font-bold text-white", mono && "font-mono")}>{value}</div>
    </div>
  );
}
