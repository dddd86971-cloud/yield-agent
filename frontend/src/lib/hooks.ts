"use client";

import React, { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import {
  api,
  AgentState,
  EvaluationLite,
  AlertPayload,
  connectAgentWs,
  WsEvent,
} from "./api";

export interface AlertEntry extends AlertPayload {
  timestamp: number;
}

// ============================================================================
// Shared agent-state context — single WebSocket for the entire app
// ============================================================================

interface AgentCtx {
  state: AgentState | null;
  history: EvaluationLite[];
  connected: boolean;
  alerts: AlertEntry[];
}

const AgentContext = createContext<AgentCtx>({
  state: null,
  history: [],
  connected: false,
  alerts: [],
});

/**
 * Provider — mount once at the app root. Opens one WebSocket,
 * fetches initial state + history, and shares to all children.
 */
export function AgentStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AgentState | null>(null);
  const [history, setHistory] = useState<EvaluationLite[]>([]);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const historyRef = useRef<EvaluationLite[]>([]);

  const handleEvent = useCallback((event: WsEvent) => {
    setConnected(true);
    if (event.type === "state") {
      setState(event.payload);
    } else if (event.type === "evaluation") {
      historyRef.current = [...historyRef.current, event.payload].slice(-100);
      setHistory([...historyRef.current]);
    } else if (event.type === "history") {
      historyRef.current = event.payload;
      setHistory([...historyRef.current]);
    } else if (event.type === "alert") {
      setAlerts((prev) => [...prev.slice(-9), { ...event.payload, timestamp: Date.now() }]);
    }
  }, []);

  useEffect(() => {
    // Initial REST fetch (fast path — data shows before WS reconnects)
    api
      .state()
      .then(setState)
      .catch(() => setConnected(false));
    api
      .history()
      .then((h) => {
        if (h.length > 0) {
          historyRef.current = h;
          setHistory(h);
        }
      })
      .catch(() => {});

    // If history is empty, try /api/latest as a fallback
    // (gives instant brain data even when monitoring just started)
    api
      .latest()
      .then((latest) => {
        if (latest && historyRef.current.length === 0) {
          historyRef.current = [latest];
          setHistory([latest]);
        }
      })
      .catch(() => {});

    // WebSocket subscription — single connection for entire app
    const disconnect = connectAgentWs(handleEvent);
    return disconnect;
  }, [handleEvent]);

  return React.createElement(
    AgentContext.Provider,
    { value: { state, history, connected, alerts } },
    children,
  );
}

/** Live agent state via shared context (single WebSocket). */
export function useAgentState() {
  return useContext(AgentContext);
}

/** Latest evaluation derived from shared history. */
export function useLatestEvaluation() {
  const { history } = useContext(AgentContext);
  return history.length > 0 ? history[history.length - 1] : null;
}
