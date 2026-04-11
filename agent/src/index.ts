/**
 * YieldAgent Backend Server
 *
 * Express HTTP API + WebSocket for real-time agent state updates.
 * Hosts the AgentCoordinator and exposes the three-brain decision engine
 * to the frontend dashboard.
 */

import express, { Request, Response } from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { AgentCoordinator, AgentState, EvaluationResult } from "./services/AgentCoordinator";
import { config } from "./config";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// ============================================================================
// Agent Coordinator (single instance per server)
// ============================================================================

const coordinator = new AgentCoordinator();
const wsClients = new Set<WebSocket>();

function broadcast(payload: object) {
  const message = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.error("[ws] send failed:", err);
      }
    }
  }
}

coordinator.onStateChange = (state: AgentState) => {
  broadcast({ type: "state", payload: state });
};

coordinator.onEvaluation = (evalResult: EvaluationResult) => {
  // Strip heavy nested fields for the wire payload
  const lean = {
    timestamp: evalResult.timestamp,
    action: evalResult.action,
    reasoning: evalResult.reasoning,
    confidence: evalResult.confidence,
    txHash: evalResult.txHash,
    market: {
      currentPrice: evalResult.market?.currentPrice,
      priceChange1h: evalResult.market?.priceChange1h,
      volatility: evalResult.market?.volatility,
      marketState: evalResult.market?.marketState,
    },
    pool: {
      token0Symbol: evalResult.pool?.token0Symbol,
      token1Symbol: evalResult.pool?.token1Symbol,
      feeAPR: evalResult.pool?.feeAPR,
      tvl: evalResult.pool?.tvl,
      currentTick: evalResult.pool?.currentTick,
    },
    risk: evalResult.risk
      ? {
          impermanentLoss: evalResult.risk.impermanentLoss,
          positionHealthPercent: evalResult.risk.positionHealthPercent,
          isInRange: evalResult.risk.isInRange,
          riskLevel: evalResult.risk.riskLevel,
        }
      : null,
  };
  broadcast({ type: "evaluation", payload: lean });
};

// ============================================================================
// WebSocket
// ============================================================================

wss.on("connection", (ws) => {
  wsClients.add(ws);
  console.log(`[ws] client connected (${wsClients.size} total)`);

  // Push current state on connect
  ws.send(JSON.stringify({ type: "state", payload: coordinator.getState() }));

  const history = coordinator.getEvaluationHistory();
  if (history.length > 0) {
    ws.send(
      JSON.stringify({
        type: "history",
        payload: history.slice(-20).map((e) => ({
          timestamp: e.timestamp,
          action: e.action,
          reasoning: e.reasoning,
          confidence: e.confidence,
          txHash: e.txHash,
        })),
      })
    );
  }

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`[ws] client disconnected (${wsClients.size} total)`);
  });

  ws.on("error", (err) => {
    console.error("[ws] error:", err);
  });
});

// ============================================================================
// REST API
// ============================================================================

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    const health = await coordinator.getHealthInfo();
    res.json(health);
  } catch (err: any) {
    // Fall back to the original minimal shape if the rich probe fails, so
    // the endpoint is still usable for liveness checks.
    console.error("[/api/health] rich probe failed:", err?.message ?? err);
    res.json({
      status: "degraded",
      chain: "X Layer",
      chainId: config.chainId,
      error: err?.message ?? String(err),
      contracts: {
        strategyManager: config.strategyManager,
        decisionLogger: config.decisionLogger,
        followVaultFactory: config.followVaultFactory,
      },
    });
  }
});

app.get("/api/state", (_req: Request, res: Response) => {
  res.json(coordinator.getState());
});

app.get("/api/history", (_req: Request, res: Response) => {
  res.json(coordinator.getEvaluationHistory());
});

app.get("/api/latest", (_req: Request, res: Response) => {
  res.json(coordinator.getLatestEvaluation());
});

app.post("/api/intent", async (req: Request, res: Response) => {
  try {
    const { input } = req.body;
    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "input required (string)" });
    }
    const intent = await coordinator.parseIntent(input);
    res.json(intent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/analyze", async (req: Request, res: Response) => {
  try {
    const { poolAddress } = req.body;
    if (!poolAddress) return res.status(400).json({ error: "poolAddress required" });
    const result = await coordinator.analyzeAndRecommend(poolAddress);
    res.json(result);
  } catch (err: any) {
    console.error("[/api/analyze] error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/deploy", async (req: Request, res: Response) => {
  try {
    const { poolAddress, intent } = req.body;
    if (!poolAddress || !intent) {
      return res.status(400).json({ error: "poolAddress and intent required" });
    }
    const result = await coordinator.deployStrategy(poolAddress, intent);
    res.json(result);
  } catch (err: any) {
    console.error("[/api/deploy] error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/monitor/start", (req: Request, res: Response) => {
  try {
    const { strategyId } = req.body;
    coordinator.startMonitoring(strategyId);
    res.json({ status: "monitoring", state: coordinator.getState() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/monitor/stop", (_req: Request, res: Response) => {
  coordinator.stopMonitoring();
  res.json({ status: "stopped", state: coordinator.getState() });
});

app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    const reply = await coordinator.handleChat(message);
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Boot
// ============================================================================

server.listen(config.port, () => {
  console.log("");
  console.log("================================================");
  console.log("  YieldAgent Backend - Three-Brain LP Manager");
  console.log("================================================");
  console.log(`  Chain:           X Layer (${config.chainId})`);
  console.log(`  RPC:             ${config.rpcUrl}`);
  console.log(`  HTTP API:        http://localhost:${config.port}`);
  console.log(`  WebSocket:       ws://localhost:${config.port}/ws`);
  console.log(`  StrategyManager: ${config.strategyManager || "(not set)"}`);
  console.log(`  DecisionLogger:  ${config.decisionLogger || "(not set)"}`);
  console.log("================================================");
  console.log("");
});

process.on("SIGINT", () => {
  console.log("\n[server] shutting down...");
  coordinator.stopMonitoring();
  server.close(() => process.exit(0));
});
