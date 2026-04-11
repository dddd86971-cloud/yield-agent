"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, Loader2, Bot, User } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

const QUICK_ACTIONS = [
  "Why did you make the last decision?",
  "Switch to conservative mode",
  "What's the current status?",
];

export function AgentChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      content:
        "I'm YieldAgent. Ask me why I made a decision, request status, or adjust risk profile.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (message: string) => {
    if (!message.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", content: message, timestamp: Date.now() }]);
    setInput("");
    setLoading(true);
    try {
      const { reply } = await api.chat(message);
      setMessages((m) => [...m, { role: "agent", content: reply, timestamp: Date.now() }]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { role: "agent", content: `Error: ${err.message}`, timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card flex flex-col h-[500px]">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-bg-border">
        <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold">Talk to the Agent</div>
          <div className="text-xs text-white/50 font-mono">ask why · adjust risk · check status</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                msg.role === "agent"
                  ? "bg-accent/20 text-accent"
                  : "bg-bg-border text-white/60"
              )}
            >
              {msg.role === "agent" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div
              className={cn(
                "max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap",
                msg.role === "agent"
                  ? "bg-bg-border text-white/90 rounded-tl-sm"
                  : "bg-accent/20 text-white rounded-tr-sm"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 text-accent flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-bg-border text-white/60">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap mt-4 mb-3">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action}
            onClick={() => send(action)}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-bg-border hover:bg-bg-hover text-white/60 hover:text-white transition-colors disabled:opacity-50"
          >
            {action}
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask the agent anything..."
          className="w-full bg-bg border border-bg-border rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-accent/50 transition-colors"
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
            input.trim() && !loading
              ? "bg-accent text-bg hover:bg-accent-dim"
              : "bg-bg-border text-white/30"
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
