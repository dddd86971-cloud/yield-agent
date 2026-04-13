"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

/** Live agent state via WebSocket with polling fallback. */
export function useAgentState() {
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
    // Initial fetch
    api
      .state()
      .then(setState)
      .catch(() => setConnected(false));
    api
      .history()
      .then((h) => {
        historyRef.current = h;
        setHistory(h);
      })
      .catch(() => {});

    // WebSocket subscription
    const disconnect = connectAgentWs(handleEvent);
    return disconnect;
  }, [handleEvent]);

  return { state, history, connected, alerts };
}

/** Latest evaluation derived from history. */
export function useLatestEvaluation() {
  const { history } = useAgentState();
  return history.length > 0 ? history[history.length - 1] : null;
}
