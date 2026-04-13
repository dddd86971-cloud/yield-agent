"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Loader2,
  Bot,
  User,
  Brain,
  Zap,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Rocket,
} from "lucide-react";
import { api, type StreamEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

interface BrainStatus {
  brain: string;
  status: "idle" | "analyzing" | "done";
  summary?: string;
}

interface Message {
  role: "user" | "agent";
  content: string;
  timestamp: number;
  action?: string;
  data?: any;
  brains?: BrainStatus[];
}

const QUICK_ACTIONS = [
  { label: "Deploy 100 USDT moderate", icon: Rocket },
  { label: "Analyze the pool", icon: BarChart3 },
  { label: "What's the current status?", icon: Zap },
  { label: "Why did you make that decision?", icon: Brain },
];

const BRAIN_ICONS: Record<string, string> = {
  market: "📊",
  pool: "🏊",
  risk: "🛡️",
};

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      content:
        "I'm YieldAgent — an autonomous AI LP manager. You can deploy strategies, analyze pools, or ask me anything. Try: \"deploy 100 USDT conservative\"",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [brains, setBrains] = useState<BrainStatus[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streamText, statusText, brains]);

  const send = async (message: string) => {
    if (!message.trim() || streaming) return;
    setMessages((m) => [
      ...m,
      { role: "user", content: message, timestamp: Date.now() },
    ]);
    setInput("");
    setStreaming(true);
    setStreamText("");
    setStatusText(null);
    setBrains([]);

    let accumulated = "";
    let finalAction: string | undefined;
    let finalData: any;
    const brainStates: BrainStatus[] = [];

    try {
      await api.chatStream(message, (event: StreamEvent) => {
        switch (event.type) {
          case "chunk":
            accumulated += event.content || "";
            setStreamText(accumulated);
            break;
          case "status":
            setStatusText(event.content || null);
            break;
          case "brain": {
            const { brain, status, summary } = event.data || {};
            const idx = brainStates.findIndex((b) => b.brain === brain);
            const entry: BrainStatus = { brain, status, summary };
            if (idx >= 0) brainStates[idx] = entry;
            else brainStates.push(entry);
            setBrains([...brainStates]);
            break;
          }
          case "done":
            if (event.content) accumulated = event.content;
            finalAction = event.action;
            finalData = event.data;
            break;
          case "error":
            accumulated = `Error: ${event.content}`;
            break;
        }
      });
    } catch (err: any) {
      accumulated = accumulated || `Connection error: ${err.message}`;
    }

    setMessages((m) => [
      ...m,
      {
        role: "agent",
        content: accumulated || "Done.",
        timestamp: Date.now(),
        action: finalAction,
        data: finalData,
        brains: brainStates.length > 0 ? [...brainStates] : undefined,
      },
    ]);
    setStreaming(false);
    setStreamText("");
    setStatusText(null);
    setBrains([]);
  };

  return (
    <div className="card flex flex-col h-[540px]">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-bg-border">
        <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold">Talk to the Agent</div>
          <div className="text-xs text-white/50 font-mono">
            deploy · analyze · monitor · adjust risk
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.map((msg, i) => (
          <div key={i}>
            <div
              className={cn(
                "flex gap-3",
                msg.role === "user" && "flex-row-reverse",
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  msg.role === "agent"
                    ? "bg-accent/20 text-accent"
                    : "bg-bg-border text-white/60",
                )}
              >
                {msg.role === "agent" ? (
                  <Bot className="w-4 h-4" />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap",
                  msg.role === "agent"
                    ? "bg-bg-border text-white/90 rounded-tl-sm"
                    : "bg-accent/20 text-white rounded-tr-sm",
                )}
              >
                {msg.content}
              </div>
            </div>

            {/* Inline deploy result card */}
            {msg.action === "deploy" && msg.data && (
              <div className="ml-11 mt-2 p-3 rounded-xl bg-accent/5 border border-accent/20 text-xs font-mono space-y-1.5">
                <div className="flex items-center gap-2 text-accent font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Strategy #{msg.data.strategyId} Deployed
                </div>
                <div className="text-white/60">
                  Mode:{" "}
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-bold",
                      msg.data.executionMode === "live"
                        ? "bg-green-500/20 text-green-400"
                        : msg.data.executionMode === "simulated"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-white/10 text-white/50",
                    )}
                  >
                    {msg.data.executionMode}
                  </span>
                </div>
                {msg.data.onchainTxHash && (
                  <a
                    href={`https://www.oklink.com/xlayer/tx/${msg.data.onchainTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline inline-flex items-center gap-1"
                  >
                    View on OKLink{" "}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Inline analyze result card */}
            {msg.action === "analyze" && msg.data && (
              <div className="ml-11 mt-2 p-3 rounded-xl bg-accent/5 border border-accent/20 text-xs font-mono space-y-1">
                <div className="flex items-center gap-2 text-accent font-bold">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Pool Analysis
                </div>
                {msg.data.pool && (
                  <div className="text-white/60">
                    {msg.data.pool.token0Symbol}/{msg.data.pool.token1Symbol} — Fee APR:{" "}
                    <span className="text-accent">{msg.data.pool.feeAPR?.toFixed(1)}%</span>
                    {msg.data.pool.tvl && ` — TVL: $${(msg.data.pool.tvl / 1e6).toFixed(1)}M`}
                  </div>
                )}
                {msg.data.market && (
                  <div className="text-white/60">
                    Market: {msg.data.market.marketState} — Volatility:{" "}
                    {msg.data.market.volatility?.toFixed(1)}%
                  </div>
                )}
              </div>
            )}

            {/* Brain visualization on messages that had brain events */}
            {msg.brains && msg.brains.length > 0 && (
              <div className="ml-11 mt-2 flex gap-2">
                {msg.brains.map((b) => (
                  <div
                    key={b.brain}
                    className="px-2 py-1 rounded-lg bg-bg-border text-[10px] font-mono flex items-center gap-1.5"
                  >
                    <span>{BRAIN_ICONS[b.brain] || "🧠"}</span>
                    <span className="text-white/60 capitalize">{b.brain}</span>
                    <CheckCircle2 className="w-3 h-3 text-accent" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Streaming state */}
        {streaming && (
          <div className="space-y-2">
            {/* Brain progress indicators */}
            {brains.length > 0 && (
              <div className="ml-11 flex gap-2 flex-wrap">
                {brains.map((b) => (
                  <div
                    key={b.brain}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-mono flex items-center gap-1.5 transition-all",
                      b.status === "done"
                        ? "bg-accent/10 border border-accent/30"
                        : "bg-bg-border border border-bg-border animate-pulse",
                    )}
                  >
                    <span>{BRAIN_ICONS[b.brain] || "🧠"}</span>
                    <span className="text-white/60 capitalize">{b.brain}</span>
                    {b.status === "done" ? (
                      <CheckCircle2 className="w-3 h-3 text-accent" />
                    ) : (
                      <Loader2 className="w-3 h-3 text-white/40 animate-spin" />
                    )}
                    {b.summary && (
                      <span className="text-white/40 ml-1 max-w-[120px] truncate">
                        {b.summary}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Status text */}
            {statusText && (
              <div className="ml-11 text-[11px] font-mono text-accent/70 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {statusText}
              </div>
            )}

            {/* Streaming text bubble */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-bg-border text-white/90 rounded-tl-sm text-sm whitespace-pre-wrap">
                {streamText || (
                  <Loader2 className="w-4 h-4 animate-spin text-white/40" />
                )}
                {streamText && (
                  <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap mt-4 mb-3">
        {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => send(label)}
            disabled={streaming}
            className="text-xs px-3 py-1.5 rounded-lg bg-bg-border hover:bg-bg-hover text-white/60 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Deploy 50 USDT aggressive, analyze pool, or ask anything..."
          className="w-full bg-bg border border-bg-border rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-accent/50 transition-colors"
          disabled={streaming}
        />
        <button
          onClick={() => send(input)}
          disabled={streaming || !input.trim()}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
            input.trim() && !streaming
              ? "bg-accent text-bg hover:bg-accent-dim"
              : "bg-bg-border text-white/30",
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
