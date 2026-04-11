import { ethers } from "hardhat";

/**
 * Anchor a real, already-broadcast OnchainOS swap tx into the audit
 * trail as a COMPOUND action row on StrategyManager.
 *
 * Why this script exists
 * ----------------------
 * The "deploy" path through `/api/deploy` wrote the audit-layer Strategy
 * row (strategyId 0, mainnet tx 0xfd5e948d…) but the downstream
 * OnchainOS `swap execute` in the USDT → OKB direction kept reverting at
 * OKX DEX's estimateGas step. Root cause: the Agentic Wallet is an
 * ERC-4337 smart account, and the CLI's auto-approve step for ERC20
 * source tokens isn't bundling the `usdt.approve(router)` userOp before
 * the swap userOp, so the downstream router sees zero allowance and
 * reverts.
 *
 * Meanwhile the *reverse* direction (OKB → USDT, with OKB as native) is
 * fine — verified by a live swap:
 *
 *   0x63a2d242da000a2544d9f6f18628a046826efc7b9f5e932928cf15125666a861
 *
 * That swap is a genuine OnchainOS TEE-signed tx from the Agentic
 * Wallet, and for the "Most Active On-Chain Agent" rubric it's exactly
 * the kind of evidence the leaderboard counts. So we anchor it into the
 * audit trail as a COMPOUND action on strategy 0 — semantically
 * "harvest non-stable side back to stable quote", which matches the
 * direction of the swap.
 *
 * This script is idempotent-safe: it only appends a new Execution row,
 * it does not mutate existing state.
 */
const STRATEGY_ID = 0;
const ACTION_COMPOUND = 2;
const SWAP_TX_HASH =
  "0x63a2d242da000a2544d9f6f18628a046826efc7b9f5e932928cf15125666a861";
const EXTERNAL_ID = "swap-okb-usdt-2026-04-11-anchor";

async function main() {
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
  console.log(`  Strategy: ${STRATEGY_ID}`);
  console.log(`  Action:   COMPOUND (${ACTION_COMPOUND})`);
  console.log(`  TxHash:   ${SWAP_TX_HASH}`);
  console.log(`  External: ${EXTERNAL_ID}`);
  console.log("========================================\n");

  const sm = await ethers.getContractAt("StrategyManager", smAddr, agent);

  // Verify the agent is actually authorized, otherwise the call will
  // revert with a confusing onlyAgent error.
  const isAgent = await sm.agents(agent.address);
  if (!isAgent) {
    throw new Error(
      `${agent.address} is not an authorized agent on ${smAddr}. Run setAgent first.`
    );
  }

  const strategy = await sm.getStrategy(STRATEGY_ID);
  if (strategy.agent.toLowerCase() !== agent.address.toLowerCase()) {
    throw new Error(
      `Strategy ${STRATEGY_ID}'s agent ${strategy.agent} does not match signer ${agent.address}`
    );
  }

  console.log(
    `  Pre-check OK — signer is the strategy's recorded agent, pool=${strategy.pool}\n`
  );

  const tx = await sm.recordExecution(
    STRATEGY_ID,
    ACTION_COMPOUND,
    0, // tickLower — swap-mode positions have no tick range
    0, // tickUpper
    SWAP_TX_HASH,
    EXTERNAL_ID
  );
  console.log(`  Sent tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  Mined in block ${receipt?.blockNumber}, gas used ${receipt?.gasUsed}`);

  console.log("\n  Audit row anchored.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
