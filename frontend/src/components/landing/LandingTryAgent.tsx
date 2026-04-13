"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Bot,
  User,
  ArrowRight,
  Sparkles,
  Zap,
  Brain,
  Link2,
  BarChart3,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { api, type StreamEvent } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Msg {
  role: "user" | "agent";
  text: string;
}

interface BrainStatus {
  brain: string;
  status: "analyzing" | "done";
  summary?: string;
}

const SUGGESTIONS = [
  "What's the current status?",
  "Why did you hold last time?",
  "Analyze the pool",
];

const BRAIN_ICONS: Record<string, string> = {
  market: "📊",
  pool: "🏊",
  risk: "🛡️",
};

export function LandingTryAgent() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "agent",
      text: "Hi! I'm YieldAgent — an autonomous AI LP manager running live on X Layer. Ask me about my strategy, market view, or say \"deploy 100 USDT moderate\" to deploy.",
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
  }, [msgs, streamText, statusText, brains]);

  const send = async (message: string) => {
    if (!message.trim() || streaming) return;
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setStreaming(true);
    setStreamText("");
    setStatusText(null);
    setBrains([]);

    let accumulated = "";
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
            break;
          case "error":
            accumulated = `Error: ${event.content}`;
            break;
        }
      });
    } catch {
      accumulated =
        accumulated ||
        "Backend offline — launch the dashboard to see the full agent.";
    }

    setMsgs((m) => [...m, { role: "agent", text: accumulated || "Done." }]);
    setStreaming(false);
    setStreamText("");
    setStatusText(null);
    setBrains([]);
  };

  return (
    <section className="py-20 border-t border-bg-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <div className="text-xs font-mono uppercase tracking-wider text-accent mb-3">
            Try it live
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Talk to the{" "}
            <span className="text-accent glow-text">Agent</span>
          </h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Real backend, real AI, real X Layer. Type a question and watch the
            three-brain ensemble respond with real-time streaming.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Chat widget */}
          <div className="card flex flex-col h-[420px]">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-bg-border">
              <div className="w-9 h-9 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-sm">YieldAgent Chat</div>
                <div className="text-[11px] text-white/40 font-mono">
                  SSE streaming · three-brain ensemble
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-[11px] font-mono text-accent">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                live
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto space-y-3 pr-1"
            >
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2.5",
                    m.role === "user" && "flex-row-reverse",
                  )}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                      m.role === "agent"
                        ? "bg-accent/20 text-accent"
                        : "bg-bg-border text-white/60",
                    )}
                  >
                    {m.role === "agent" ? (
                      <Bot className="w-3.5 h-3.5" />
                    ) : (
                      <User className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                      m.role === "agent"
                        ? "bg-bg-border text-white/90 rounded-tl-sm"
                        : "bg-accent/20 text-white rounded-tr-sm",
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}

              {/* Streaming state */}
              {streaming && (
                <div className="space-y-2">
                  {/* Brain progress */}
                  {brains.length > 0 && (
                    <div className="ml-10 flex gap-1.5 flex-wrap">
                      {brains.map((b) => (
                        <div
                          key={b.brain}
                          className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-mono flex items-center gap-1 transition-all",
                            b.status === "done"
                              ? "bg-accent/10 border border-accent/30"
                              : "bg-bg-border animate-pulse",
                          )}
                        >
                          <span>{BRAIN_ICONS[b.brain] || "🧠"}</span>
                          <span className="text-white/50 capitalize">
                            {b.brain}
                          </span>
                          {b.status === "done" ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-accent" />
                          ) : (
                            <Loader2 className="w-2.5 h-2.5 text-white/30 animate-spin" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Status text */}
                  {statusText && (
                    <div className="ml-10 text-[10px] font-mono text-accent/60 flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      {statusText}
                    </div>
                  )}

                  {/* Streaming bubble */}
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-accent/20 text-accent flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-bg-border text-sm leading-relaxed rounded-tl-sm">
                      {streamText ? (
                        <span className="text-white/90 whitespace-pre-wrap">
                          {streamText}
                          <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 align-middle" />
                        </span>
                      ) : (
                        <div className="flex gap-1 py-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick suggestions */}
            <div className="flex gap-1.5 flex-wrap mt-3 mb-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={streaming}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-bg-border hover:bg-bg-hover text-white/50 hover:text-white transition-colors disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Ask the agent anything..."
                className="w-full bg-bg border border-bg-border rounded-xl px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:border-accent/50 transition-colors"
                disabled={streaming}
              />
              <button
                onClick={() => send(input)}
                disabled={streaming || !input.trim()}
                className={cn(
                  "absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                  input.trim() && !streaming
                    ? "bg-accent text-bg hover:bg-accent-dim"
                    : "bg-bg-border text-white/30",
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right panel — feature list + CTA */}
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-sm">Full Agent Dashboard</div>
                  <div className="text-[11px] text-white/40 font-mono">
                    deploy / monitor / audit / follow
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <Feature
                  icon={Zap}
                  label="Chat-Driven Deploy"
                  desc="Say 'deploy 100 USDT conservative' — AI parses, deploys, monitors"
                />
                <Feature
                  icon={Brain}
                  label="Three-Brain Streaming"
                  desc="Watch Market, Pool & Risk brains analyze in real-time via SSE"
                />
                <Feature
                  icon={Link2}
                  label="On-Chain Audit Trail"
                  desc="Every DEPLOY, REBALANCE, HOLD logged to DecisionLogger"
                />
                <Feature
                  icon={BarChart3}
                  label="Real-Time Dashboard"
                  desc="Live WebSocket updates, LP range charts, decision history"
                />
              </div>

              <Link
                href="/app"
                className="btn-primary w-full mt-6 py-3 inline-flex items-center justify-center gap-2 text-sm font-bold"
              >
                Launch Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 text-xs font-mono text-white/50 leading-relaxed">
              <span className="text-accent">Wallet supported.</span> Connect
              MetaMask to X Layer (chain 196) in the dashboard. Strategies
              deploy via the OnchainOS Agentic Wallet TEE — your browser wallet
              is for read access and future FollowVault deposits.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({
  icon: Icon,
  label,
  desc,
}: {
  icon: typeof Zap;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div>
        <div className="text-white font-medium">{label}</div>
        <div className="text-white/50 text-xs">{desc}</div>
      </div>
    </div>
  );
}
