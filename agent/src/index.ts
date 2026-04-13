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
import { AgentCoordinator, AgentState, EvaluationResult, ChatResponse, StreamEvent } from "./services/AgentCoordinator";
import { getV3PositionManager } from "./services/V3PositionManager";
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

coordinator.onAlert = (alert) => {
  console.log(`[alert] ${alert.severity}: ${alert.message}`);
  broadcast({ type: "alert", payload: alert });
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
          market: e.market
            ? {
                currentPrice: e.market.currentPrice,
                priceChange1h: e.market.priceChange1h,
                volatility: e.market.volatility,
                marketState: e.market.marketState,
              }
            : undefined,
          pool: e.pool
            ? {
                token0Symbol: e.pool.token0Symbol,
                token1Symbol: e.pool.token1Symbol,
                feeAPR: e.pool.feeAPR,
                tvl: e.pool.tvl,
                currentTick: e.pool.currentTick,
              }
            : undefined,
          risk: e.risk
            ? {
                impermanentLoss: e.risk.impermanentLoss,
                positionHealthPercent: e.risk.positionHealthPercent,
                isInRange: e.risk.isInRange,
                riskLevel: e.risk.riskLevel,
              }
            : null,
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

// Lightweight brain snapshot — runs MarketBrain + PoolBrain on default pool
// so the dashboard shows live data even when monitoring is not active.
app.get("/api/brains/snapshot", async (_req: Request, res: Response) => {
  try {
    const poolAddress =
      config.pools["USDT/OKB"]?.address || "0x63d62734847E55A266FCa4219A9aD0a02D5F6e02";
    const result = await coordinator.getBrainSnapshot(poolAddress);
    res.json({
      timestamp: Date.now(),
      market: {
        currentPrice: result.market.currentPrice,
        priceChange1h: result.market.priceChange1h,
        volatility: result.market.volatility,
        marketState: result.market.marketState,
      },
      pool: {
        token0Symbol: result.pool.token0Symbol,
        token1Symbol: result.pool.token1Symbol,
        feeAPR: result.pool.feeAPR,
        tvl: result.pool.tvl,
        currentTick: result.pool.currentTick,
      },
      risk: null, // No position ⇒ no risk assessment
    });
  } catch (err: any) {
    console.error("[/api/brains/snapshot] error:", err?.message ?? err);
    res.status(500).json({ error: err.message });
  }
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
    const chatResponse = await coordinator.handleChat(message);
    res.json(chatResponse);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// V3 LP positions — list all real Uniswap V3 NFT positions owned by agent
app.get("/api/v3/positions", async (_req: Request, res: Response) => {
  try {
    const v3pm = getV3PositionManager();
    const tokenIds = await v3pm.getOwnedPositions();
    const positions = await Promise.all(
      tokenIds.map(async (id) => {
        const pos = await v3pm.getPosition(id);
        return {
          tokenId: id,
          token0: pos.token0,
          token1: pos.token1,
          fee: pos.fee,
          tickLower: pos.tickLower,
          tickUpper: pos.tickUpper,
          liquidity: pos.liquidity.toString(),
          tokensOwed0: pos.tokensOwed0.toString(),
          tokensOwed1: pos.tokensOwed1.toString(),
        };
      })
    );
    res.json({
      npmAddress: config.uniswapV3.positionManager,
      agentAddress: v3pm.agentAddress,
      totalPositions: positions.length,
      positions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// V3 pool state — real-time pool data
app.get("/api/v3/pool/:address", async (req: Request, res: Response) => {
  try {
    const v3pm = getV3PositionManager();
    const poolState = await v3pm.getPoolState(req.params.address);
    res.json({
      pool: req.params.address,
      sqrtPriceX96: poolState.sqrtPriceX96.toString(),
      currentTick: poolState.currentTick,
      tickSpacing: poolState.tickSpacing,
      liquidity: poolState.liquidity.toString(),
      token0: poolState.token0,
      token1: poolState.token1,
      fee: poolState.fee,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SSE streaming chat — real OpenAI token-by-token streaming + brain progress
app.post("/api/chat/stream", async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    await coordinator.handleChatStream(message, (event: StreamEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
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
  console.log(`  V3 Factory:      ${config.uniswapV3.factory}`);
  console.log(`  V3 NPM:          ${config.uniswapV3.positionManager}`);
  console.log(`  V3 SwapRouter:   ${config.uniswapV3.swapRouter}`);
  console.log("================================================");
  console.log("");
});

process.on("SIGINT", () => {
  console.log("\n[server] shutting down...");
  coordinator.stopMonitoring();
  server.close(() => process.exit(0));
});
