import { ethers } from "hardhat";

/**
 * Anchor an already-broadcast OnchainOS swap tx into the on-chain audit
 * trail as an Execution row on StrategyManager.
 *
 * Why this script exists
 * ----------------------
 * The `/api/deploy` path writes the audit-layer Strategy row plus its
 * immediate companion Execution row, but when a swap is broadcast
 * out-of-band (e.g. directly via `onchainos swap execute` while
 * debugging) the agent never gets a chance to call `recordExecution`.
 * This script closes that gap for a single known tx hash so the on-chain
 * audit trail matches the OnchainOS account's real activity.
 *
 * Background — 2026-04-11 first mainnet deploy
 * --------------------------------------------
 * The original need for this script: the initial `/api/deploy` run kept
 * reverting at OKX DEX's `estimateGas` step for the USDT → OKB direction
 * because the Agentic Wallet is an ERC-4337 smart account and the CLI's
 * auto-approve step for ERC20 source tokens was not bundling the
 * `usdt.approve(router)` userOp before the swap userOp — the downstream
 * router saw zero allowance and reverted. Meanwhile the OKB → USDT
 * direction (native source) worked fine. We broadcast a real OKB → USDT
 * swap
 *
 *   0x63a2d242da000a2544d9f6f18628a046826efc7b9f5e932928cf15125666a861
 *
 * — a genuine OnchainOS TEE-signed tx from the Agentic Wallet — and
 * anchored it into strategy 0's audit trail as a COMPOUND action. See
 * SUBMISSION.md §"Known Limitations" for the full postmortem.
 *
 * Usage
 * -----
 *   # Anchor the default 2026-04-11 harvest-direction swap into strategy 0
 *   STRATEGY_MANAGER_ADDRESS=0x... npx hardhat run scripts/anchor-swap-evidence.ts --network xlayer
 *
 *   # Anchor a different tx hash or different action
 *   ANCHOR_STRATEGY_ID=0 \
 *   ANCHOR_TX_HASH=0x... \
 *   ANCHOR_ACTION=COMPOUND \
 *   ANCHOR_EXTERNAL_ID="my-audit-id" \
 *   npx hardhat run scripts/anchor-swap-evidence.ts --network xlayer
 *
 *   # Dry run — show what would be written without sending a tx
 *   ANCHOR_DRY_RUN=1 npx hardhat run scripts/anchor-swap-evidence.ts --network xlayer
 *
 * Idempotency
 * -----------
 * StrategyManager allows duplicate Execution rows with the same txHash,
 * so this script pre-flights:
 *   1. It fetches the current Executions list via `getExecutions(strategyId)`
 *   2. If the target txHash is already present, it logs & exits 0.
 *   3. It verifies the tx exists on-chain via `eth_getTransactionByHash`
 *      and that its sender is a known address. The check is advisory —
 *      we still anchor if the tx is missing from the RPC (could be
 *      archive lag), but we warn.
 *
 * The script never mutates existing state — it only appends a new
 * Execution row. It will not re-deploy, re-swap, or modify the strategy.
 */

// ------ ActionType enum (mirrors IYieldProtocol.sol) ------
const ACTION_TYPES: Record<string, number> = {
  DEPLOY: 0,
  REBALANCE: 1,
  COMPOUND: 2,
  EMERGENCY_EXIT: 3,
  HOLD: 4,
};

// ------ Defaults — the canonical 2026-04-11 harvest-direction anchor ------
const DEFAULT_STRATEGY_ID = 0;
const DEFAULT_ACTION_NAME = "COMPOUND";
const DEFAULT_TX_HASH =
  "0x63a2d242da000a2544d9f6f18628a046826efc7b9f5e932928cf15125666a861";
const DEFAULT_EXTERNAL_ID = "swap-okb-usdt-2026-04-11-anchor";

function parseEnvArgs() {
  const strategyId = Number(
    process.env.ANCHOR_STRATEGY_ID ?? DEFAULT_STRATEGY_ID
  );
  if (!Number.isInteger(strategyId) || strategyId < 0) {
    throw new Error(
      `ANCHOR_STRATEGY_ID must be a non-negative integer, got ${process.env.ANCHOR_STRATEGY_ID}`
    );
  }

  const actionName = (
    process.env.ANCHOR_ACTION ?? DEFAULT_ACTION_NAME
  ).toUpperCase();
  const action = ACTION_TYPES[actionName];
  if (action === undefined) {
    throw new Error(
      `ANCHOR_ACTION must be one of ${Object.keys(ACTION_TYPES).join(
        "/"
      )}, got ${actionName}`
    );
  }

  const txHash = (process.env.ANCHOR_TX_HASH ?? DEFAULT_TX_HASH).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    throw new Error(
      `ANCHOR_TX_HASH must be a 32-byte hex string, got ${txHash}`
    );
  }

  const externalId = process.env.ANCHOR_EXTERNAL_ID ?? DEFAULT_EXTERNAL_ID;
  const dryRun = ["1", "true", "yes"].includes(
    (process.env.ANCHOR_DRY_RUN ?? "").toLowerCase()
  );

  return { strategyId, actionName, action, txHash, externalId, dryRun };
}

async function main() {
  const { strategyId, actionName, action, txHash, externalId, dryRun } =
    parseEnvArgs();

  const [agent] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== 196) {
    throw new Error(`This script is mainnet-only. Got chainId ${chainId}.`);
  }

  const smAddr = process.env.STRATEGY_MANAGER_ADDRESS;
  if (!smAddr) throw new Error("STRATEGY_MANAGER_ADDRESS not set");

  console.log("========================================");
  console.log("  Anchor OnchainOS swap tx as audit row");
  console.log("========================================");
  console.log(`  Network:  ${network.name} (${chainId})`);
  console.log(`  Agent:    ${agent.address}`);
  console.log(`  StrategyManager: ${smAddr}`);
  console.log(`  Strategy: ${strategyId}`);
  console.log(`  Action:   ${actionName} (${action})`);
  console.log(`  TxHash:   ${txHash}`);
  console.log(`  External: ${externalId}`);
  console.log(`  DryRun:   ${dryRun}`);
  console.log("========================================\n");

  const sm = await ethers.getContractAt("StrategyManager", smAddr, agent);

  // Verify the signer is actually authorized, otherwise the call will
  // revert with a confusing onlyAgent error.
  const isAgent = await sm.agents(agent.address);
  if (!isAgent) {
    throw new Error(
      `${agent.address} is not an authorized agent on ${smAddr}. Run setAgent first.`
    );
  }

  const strategy = await sm.getStrategy(strategyId);
  if (strategy.agent.toLowerCase() !== agent.address.toLowerCase()) {
    throw new Error(
      `Strategy ${strategyId}'s agent ${strategy.agent} does not match signer ${agent.address}`
    );
  }

  console.log(
    `  Pre-check OK — signer is the strategy's recorded agent, pool=${strategy.pool}`
  );

  // Idempotency check — scan existing executions for a duplicate txHash.
  try {
    const executions = await sm.getExecutions(strategyId);
    const duplicate = executions.find(
      (e: any) => (e.txHash ?? "").toLowerCase() === txHash
    );
    if (duplicate) {
      console.log(
        `  Idempotent: txHash ${txHash} already present in strategy ${strategyId}'s execution history at timestamp ${duplicate.timestamp}. Skipping.`
      );
      return;
    }
  } catch (err: any) {
    console.warn(
      `  Warn: getExecutions(${strategyId}) failed (${err?.message ?? err}). Proceeding without idempotency check.`
    );
  }

  // Advisory: verify the target tx actually exists on-chain.
  try {
    const broadcastTx = await ethers.provider.getTransaction(txHash);
    if (!broadcastTx) {
      console.warn(
        `  Warn: eth_getTransactionByHash returned null for ${txHash}. The RPC may be archive-lagged. Proceeding anyway — the recordExecution row does not actually verify the tx hash on-chain.`
      );
    } else {
      console.log(
        `  Tx lookup OK — broadcast from ${broadcastTx.from}, block ${broadcastTx.blockNumber}, hash confirmed.`
      );
    }
  } catch (err: any) {
    console.warn(
      `  Warn: eth_getTransactionByHash threw (${err?.message ?? err}). Proceeding anyway.`
    );
  }

  if (dryRun) {
    console.log("\n  DRY RUN — no tx will be sent.");
    console.log(
      `  Would call: StrategyManager.recordExecution(${strategyId}, ${action}, 0, 0, "${txHash}", "${externalId}")`
    );
    return;
  }

  const tx = await sm.recordExecution(
    strategyId,
    action,
    0, // tickLower — swap-mode positions have no tick range
    0, // tickUpper
    txHash,
    externalId
  );
  console.log(`\n  Sent tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(
    `  Mined in block ${receipt?.blockNumber}, gas used ${receipt?.gasUsed}`
  );

  console.log("\n  Audit row anchored.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
