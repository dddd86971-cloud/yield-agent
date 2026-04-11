import { ethers } from "hardhat";
import type { Log, LogDescription } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * YieldAgent v2 on-chain smoke test
 *
 * Runs a full audit-trail cycle against an already-deployed v2 contract set:
 *   1. deployStrategy(...)      → creates strategy #N, logs DEPLOY decision
 *   2. recordExecution(...)     → attaches a (fake) OnchainOS tx hash + externalId
 *   3. logHold(...)             → records a HOLD decision (agent chose not to rebalance)
 *   4. Reads everything back    → prints the full decision history + execution
 *
 * This creates 3 real transactions on whatever network we're pointed at
 * (chain 1952 testnet recommended), so SUBMISSION.md has concrete tx hashes
 * judges can click.
 *
 * Usage:
 *   npx hardhat run scripts/smoke-test.ts --network xlayerTestnet
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  const deploymentFile = path.join(__dirname, "..", "deployments", `${chainId}.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`No deployment file at ${deploymentFile} — run scripts/deploy.ts first`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  console.log("========================================");
  console.log("  YieldAgent v2 smoke test");
  console.log("========================================");
  console.log(`  Network:         ${network.name} (chainId ${chainId})`);
  console.log(`  Signer (agent):  ${signer.address}`);
  console.log(`  StrategyManager: ${deployment.contracts.StrategyManager}`);
  console.log(`  DecisionLogger:  ${deployment.contracts.DecisionLogger}`);
  console.log("========================================\n");

  const sm = await ethers.getContractAt("StrategyManager", deployment.contracts.StrategyManager, signer);
  const dl = await ethers.getContractAt("DecisionLogger", deployment.contracts.DecisionLogger, signer);

  // Sanity: agent must be whitelisted
  const isAgent: boolean = await sm.isAgent(signer.address);
  if (!isAgent) throw new Error(`Signer ${signer.address} is not a whitelisted agent on StrategyManager`);
  console.log(`Agent whitelisted: ${isAgent}\n`);

  // ------------------------------------------------------------------
  // 1. deployStrategy — audit record for a WOKB/USDC 0.3% strategy
  // ------------------------------------------------------------------
  const WOKB = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";
  const USDC = "0x74b7f16337b8972027f6196a17a631ac6de26d22";
  const POOL_REF = "0x0000000000000000000000000000000000000001"; // off-chain pool reference — contract allows any

  const positions = [
    {
      tickLower: -600,
      tickUpper: 600,
      amount0Desired: ethers.parseUnits("1", 18),     // 1 WOKB (reference only, no tokens moved)
      amount1Desired: ethers.parseUnits("500", 6),    // 500 USDC
    },
  ];

  const thesis =
    "WOKB/USDC 0.3%: moderate volatility regime, concentrating ±6% around spot. " +
    "MarketBrain rates trend neutral, PoolBrain finds fee APR >= 12%, RiskBrain confirms range utilisation safe.";

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  console.log("1. Calling deployStrategy(...)");
  const tx1 = await sm.deployStrategy(POOL_REF, WOKB, USDC, 3000, positions, 1 /* MODERATE */, thesis);
  const rcpt1 = await tx1.wait(2);
  if (!rcpt1) throw new Error("deployStrategy receipt is null");

  // Extract strategyId from StrategyDeployed event
  const parsedLogs: LogDescription[] = [];
  for (const log of rcpt1.logs) {
    try {
      const parsed = sm.interface.parseLog(log as Log);
      if (parsed) parsedLogs.push(parsed);
    } catch {
      // non-matching log, skip
    }
  }

  const deployedEvent = parsedLogs.find((l) => l.name === "StrategyDeployed");
  if (!deployedEvent) throw new Error("StrategyDeployed event not found");
  const strategyId: bigint = deployedEvent.args.strategyId;
  console.log(`   tx:         ${rcpt1.hash}`);
  console.log(`   strategyId: ${strategyId.toString()}`);
  console.log(`   gasUsed:    ${rcpt1.gasUsed.toString()}`);

  // Wait for state to propagate across X Layer testnet RPC nodes
  console.log(`   waiting for state propagation...`);
  for (let i = 0; i < 20; i++) {
    try {
      const s = await sm.getStrategy(strategyId);
      if (s.agent !== ethers.ZeroAddress) break;
    } catch {}
    await sleep(1500);
  }
  console.log();

  // ------------------------------------------------------------------
  // 2. recordExecution — glue the (fake) OnchainOS tx hash to the strategy
  // ------------------------------------------------------------------
  const fakeOnchainosTx = ethers.keccak256(ethers.toUtf8Bytes(`onchainos-invest-${strategyId}-${Date.now()}`));
  const externalId = `oos_demo_${strategyId}`;

  console.log("2. Calling recordExecution(DEPLOY, ...)");
  const tx2 = await sm.recordExecution(
    strategyId,
    0, // ActionType.DEPLOY
    -600,
    600,
    fakeOnchainosTx,
    externalId
  );
  const rcpt2 = await tx2.wait(2);
  if (!rcpt2) throw new Error("recordExecution receipt is null");
  console.log(`   tx:              ${rcpt2.hash}`);
  console.log(`   fake OOS txHash: ${fakeOnchainosTx}`);
  console.log(`   externalId:      ${externalId}`);
  console.log(`   gasUsed:         ${rcpt2.gasUsed.toString()}`);
  await sleep(2000);
  console.log();

  // ------------------------------------------------------------------
  // 3. logHold — record an explicit "agent chose not to rebalance" decision
  // ------------------------------------------------------------------
  const holdReasoning =
    "5min re-check: tick drift 18bps within ±60bps deadband, RiskBrain confidence 0.82 for hold, " +
    "fee accrual trending positive. Rebalance cost exceeds expected alpha — HOLD.";

  console.log("3. Calling logHold(...)");
  const tx3 = await sm.logHold(strategyId, holdReasoning, 82);
  const rcpt3 = await tx3.wait(2);
  if (!rcpt3) throw new Error("logHold receipt is null");
  console.log(`   tx:      ${rcpt3.hash}`);
  console.log(`   gasUsed: ${rcpt3.gasUsed.toString()}\n`);

  // ------------------------------------------------------------------
  // 4. Read everything back to confirm the audit trail is intact
  // ------------------------------------------------------------------
  console.log("4. Reading audit trail back from chain...\n");
  const strategy = await sm.getStrategy(strategyId);
  console.log("   Strategy:");
  console.log(`     agent:         ${strategy.agent}`);
  console.log(`     owner:         ${strategy.owner}`);
  console.log(`     pool:          ${strategy.pool}`);
  console.log(`     token0:        ${strategy.token0}`);
  console.log(`     token1:        ${strategy.token1}`);
  console.log(`     fee:           ${strategy.fee}`);
  console.log(`     active:        ${strategy.active}`);
  console.log(`     riskProfile:   ${strategy.riskProfile} (0=CONS,1=MOD,2=AGG)`);

  const executions = await sm.getExecutions(strategyId);
  console.log(`\n   Executions (${executions.length}):`);
  for (let i = 0; i < executions.length; i++) {
    const e = executions[i];
    console.log(`     [${i}] action=${e.action} tickLower=${e.tickLower} tickUpper=${e.tickUpper}`);
    console.log(`         txHash=${e.txHash}`);
    console.log(`         externalId="${e.externalId}"`);
  }

  const decisions = await dl.getDecisionHistory(strategyId);
  console.log(`\n   Decisions (${decisions.length}):`);
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    const actionNames = ["DEPLOY", "REBALANCE", "COMPOUND", "EMERGENCY_EXIT", "HOLD"];
    console.log(`     [${i}] ${actionNames[Number(d.action)]} confidence=${d.confidence}`);
    console.log(`         reasoning="${d.reasoning.slice(0, 70)}${d.reasoning.length > 70 ? "..." : ""}"`);
  }

  // ------------------------------------------------------------------
  // Summary — block ready for SUBMISSION.md
  // ------------------------------------------------------------------
  const explorerBase =
    chainId === 196 ? "https://www.oklink.com/xlayer" : "https://www.oklink.com/xlayer-test";

  console.log("\n========================================");
  console.log("  Smoke test PASSED — paste into SUBMISSION.md:");
  console.log("========================================");
  console.log(`  strategyId:       ${strategyId.toString()}`);
  console.log(`  deployStrategy:   ${rcpt1.hash}`);
  console.log(`                    ${explorerBase}/tx/${rcpt1.hash}`);
  console.log(`  recordExecution:  ${rcpt2.hash}`);
  console.log(`                    ${explorerBase}/tx/${rcpt2.hash}`);
  console.log(`  logHold:          ${rcpt3.hash}`);
  console.log(`                    ${explorerBase}/tx/${rcpt3.hash}`);
  console.log("========================================");

  // Persist a machine-readable summary next to the deployment artifact
  const summary = {
    chainId,
    strategyId: strategyId.toString(),
    signer: signer.address,
    contracts: deployment.contracts,
    transactions: {
      deployStrategy: rcpt1.hash,
      recordExecution: rcpt2.hash,
      logHold: rcpt3.hash,
    },
    timestamps: {
      runAt: new Date().toISOString(),
    },
    explorerBase,
  };
  const outFile = path.join(__dirname, "..", "deployments", `${chainId}.smoke.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(`\nSmoke summary saved to ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
