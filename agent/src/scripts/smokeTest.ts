/**
 * Smoke test for the agent backend.
 *
 * Exercises the three brains and the intent parser against live X Layer data,
 * WITHOUT touching the StrategyManager contract. Useful for verifying that
 * the analytics pipeline works before deploying contracts.
 *
 * Run with:  npx ts-node src/scripts/smokeTest.ts <poolAddress>
 */

import { MarketBrain } from "../engines/MarketBrain";
import { PoolBrain } from "../engines/PoolBrain";
import { RiskBrain } from "../engines/RiskBrain";
import { IntentParser } from "../engines/IntentParser";
import { config } from "../config";

const SAMPLE_POOL = process.argv[2] || "";

async function main() {
  console.log("================================================");
  console.log("  YieldAgent Backend Smoke Test");
  console.log("================================================");
  console.log(`  Chain:  X Layer (${config.chainId})`);
  console.log(`  RPC:    ${config.rpcUrl}`);
  console.log("");

  // ---- 1. Intent parser (no chain RPC required) -------------------------
  console.log("[1/4] Intent parser");
  if (config.openaiApiKey) {
    try {
      const parser = new IntentParser();
      const intent = await parser.parse(
        "Conservative OKB/USDC LP with 5000 USDC, target 15% APR"
      );
      console.log("    parsed:", JSON.stringify(intent, null, 2).split("\n").join("\n    "));
    } catch (err: any) {
      console.log("    ! GPT call failed (using fallback):", err.message);
    }
  } else {
    console.log("    ! OPENAI_API_KEY not set — skipping LLM parse");
  }
  console.log("");

  if (!SAMPLE_POOL) {
    console.log("Pass a pool address as the first argument to run brain tests:");
    console.log("  npx ts-node src/scripts/smokeTest.ts 0x...");
    return;
  }

  // ---- 2. Market brain ----------------------------------------------------
  console.log("[2/4] Market brain");
  const marketBrain = new MarketBrain();
  try {
    const market = await marketBrain.analyze(SAMPLE_POOL);
    console.log(`    price:      ${market.currentPrice}`);
    console.log(`    1h change:  ${market.priceChange1h.toFixed(3)}%`);
    console.log(`    volatility: ${market.volatility.toFixed(3)}%`);
    console.log(`    state:      ${market.marketState}`);
  } catch (err: any) {
    console.log(`    ! failed: ${err.message}`);
  }
  console.log("");

  // ---- 3. Pool brain ------------------------------------------------------
  console.log("[3/4] Pool brain");
  const poolBrain = new PoolBrain();
  try {
    const pool = await poolBrain.analyze(SAMPLE_POOL, "moderate");
    console.log(`    pair:       ${pool.token0Symbol}/${pool.token1Symbol}`);
    console.log(`    fee tier:   ${pool.feeTier}`);
    console.log(`    TVL:        $${pool.tvl.toFixed(0)}`);
    console.log(`    fee APR:    ${pool.feeAPR.toFixed(2)}%`);
    console.log(`    ranges:     ${pool.recommendedRanges.length} suggested`);
    pool.recommendedRanges.forEach((r) => {
      console.log(
        `      - ${r.type.padEnd(13)} alloc=${r.allocationPercent}% est.APR=${r.estimatedAPR}% est.IL=${r.estimatedIL}%`
      );
    });
  } catch (err: any) {
    console.log(`    ! failed: ${err.message}`);
  }
  console.log("");

  // ---- 4. Risk brain (pure math) -----------------------------------------
  console.log("[4/4] Risk brain");
  const riskBrain = new RiskBrain();
  const tickLower = -1000;
  const tickUpper = 1000;
  const currentTick = 250;
  const entryTick = 0;
  const risk = riskBrain.analyze({
    tickLower,
    tickUpper,
    currentTick,
    entryTick,
    positionValueUSD: 5000,
    riskProfile: "moderate",
  });
  console.log(`    health:     ${risk.positionHealthPercent}/100`);
  console.log(`    in-range:   ${risk.isInRange}`);
  console.log(`    IL:         ${(risk.impermanentLoss * 100).toFixed(3)}%`);
  console.log(`    risk:       ${risk.riskLevel}`);
  console.log("");

  console.log("================================================");
  console.log("  Smoke test complete");
  console.log("================================================");
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
