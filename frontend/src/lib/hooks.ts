"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  api,
  AgentState,
  EvaluationLite,
  connectAgentWs,
  WsEvent,
} from "./api";

/** Live agent state via WebSocket with polling fallback. */
export function useAgentState() {
  const [state, setState] = useState<AgentState | null>(null);
  const [history, setHistory] = useState<EvaluationLite[]>([]);
  const [connected, setConnected] = useState(false);
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

  return { state, history, connected };
}

/** Latest evaluation derived from history. */
export function useLatestEvaluation() {
  const { history } = useAgentState();
  return history.length > 0 ? history[history.length - 1] : null;
}
