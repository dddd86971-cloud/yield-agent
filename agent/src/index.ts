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

app.get("/api/state", (req: Request, res: Response) => {
  // Optional ?wallet=0x... returns the per-user strategy snapshot; without
  // it, returns the globally-active strategy (back-compat for unauth'd UI).
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : null;
  res.json(wallet ? coordinator.getStateForWallet(wallet) : coordinator.getState());
});

app.get("/api/history", (req: Request, res: Response) => {
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : null;
  res.json(wallet ? coordinator.getHistoryForWallet(wallet) : coordinator.getEvaluationHistory());
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
    const { poolAddress, intent, deployerWallet } = req.body;
    if (!poolAddress || !intent) {
      return res.status(400).json({ error: "poolAddress and intent required" });
    }
    const result = await coordinator.deployStrategy(poolAddress, intent, undefined, deployerWallet);
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
// X Layer DeFi ecosystem aggregator
// ============================================================================

/**
 * Cross-protocol yield opportunities on X Layer via OnchainOS `defi search`.
 *
 * Returns everything OnchainOS indexes for a given token on the configured
 * chain — Uniswap V3, SushiSwap, DODO, etc. — so the frontend can render an
 * aggregator view that proves YieldAgent is ecosystem-aware (not just
 * single-pool). Token defaults to USDT since that's the primary quote asset
 * on X Layer (USDC has ~0 depth verified via `defi search`).
 *
 * Query params:
 *   ?token=USDT          (default)
 *   ?chain=196           (default — X Layer mainnet)
 *   ?platform=Uniswap    (optional filter)
 */
app.get("/api/defi/opportunities", async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "USDT";
    const chain =
      typeof req.query.chain === "string" ? req.query.chain : config.onchainos.defaultChain;
    const platform = typeof req.query.platform === "string" ? req.query.platform : undefined;

    const pools = await coordinator.listDeFiOpportunities({
      token,
      chain,
      platform,
      productGroup: "DEX_POOL",
    });
    res.json({
      chain,
      token,
      platform: platform ?? "all",
      count: pools.length,
      opportunities: pools,
    });
  } catch (err: any) {
    console.error("[/api/defi/opportunities] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Strategy persistence + PnL API
// ============================================================================

/**
 * List all strategies (optionally filtered by deployer wallet).
 * Used by the frontend PnL dashboard to render the "My Strategies" table.
 * Query: ?wallet=0x...
 */
app.get("/api/strategies", (req: Request, res: Response) => {
  try {
    const wallet = (req.query.wallet as string) || "";
    const strategies = wallet
      ? coordinator.listStrategiesByWallet(wallet)
      : [];
    res.json({ count: strategies.length, strategies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Historical PnL snapshots for a single strategy.
 * Returns oldest-first so the chart renders left-to-right by time.
 */
app.get("/api/pnl/:strategyId", (req: Request, res: Response) => {
  try {
    const strategyId = parseInt(req.params.strategyId);
    if (Number.isNaN(strategyId)) {
      return res.status(400).json({ error: "strategyId must be numeric" });
    }
    const snapshots = coordinator.getPnLSnapshots(strategyId);
    res.json({ strategyId, count: snapshots.length, snapshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Aggregate PnL across every strategy deployed by the calling wallet.
 * Drives the per-user dashboard at /app/pnl.
 */
app.get("/api/pnl", (req: Request, res: Response) => {
  try {
    const wallet = (req.query.wallet as string) || "";
    if (!wallet) return res.status(400).json({ error: "wallet query param required" });
    const snapshots = coordinator.getPnLSnapshotsByWallet(wallet);
    res.json({ wallet, count: snapshots.length, snapshots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Force-refresh the PnL snapshot for the active strategy. Used by the
 * dashboard's "refresh" button so judges can see the chart update without
 * waiting for the next 30-minute evaluation tick.
 */
app.post("/api/pnl/refresh", async (req: Request, res: Response) => {
  try {
    const { priceUSD } = req.body || {};
    await coordinator.refreshPnLSnapshot(priceUSD);
    res.json({ ok: true, timestamp: Date.now() });
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
  console.log(`  V3 Factory:      ${config.uniswapV3.factory}`);
  console.log(`  V3 NPM:          ${config.uniswapV3.positionManager}`);
  console.log(`  V3 SwapRouter:   ${config.uniswapV3.swapRouter}`);
  console.log("================================================");
  console.log("");
});

// Flush persistence on graceful shutdown so in-flight state mutations
// (debounced to 2s inside PersistenceService) don't get dropped.
function shutdown(signal: string) {
  console.log(`\n[server] received ${signal}, flushing persistence...`);
  try {
    coordinator.flushPersistence();
  } catch (err) {
    console.error("[server] flush failed:", err);
  }
  coordinator.stopMonitoring();
  server.close(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
