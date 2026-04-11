import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * YieldAgent v2 — resume-from-failure mainnet deploy
 *
 * The first mainnet deploy attempt (scripts/deploy.ts via XLAYER_RPC_URL=
 * https://xlayerrpc.okx.com) died to a UND_ERR_CONNECT_TIMEOUT *after* the
 * first two contracts had already been broadcast and mined:
 *
 *   - DecisionLogger    : 0x5989f764bC20072e6554860547CfEC474877892C   (nonce 0)
 *   - StrategyManager v2: 0x2180fA2e3F89E314941b23B7acC0e60513766712   (nonce 1)
 *
 * (These addresses match the testnet deployment because the audit signer
 * `0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838` had nonce=0 on both chains
 * when deploy.ts ran — CREATE addresses are a pure function of
 * `rlp(deployer, nonce)`.)
 *
 * Re-running deploy.ts here would fail: Hardhat would try to redeploy
 * DecisionLogger at nonce=2, which would give a different address, break the
 * wire-up, and waste gas. This script skips straight to step 3: deploy the
 * FollowVaultFactory, then wire up permissions.
 *
 * Usage:
 *   XLAYER_RPC_URL=https://xlayerrpc.okx.com \
 *     AGENT_ADDRESS=0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838 \
 *     npx hardhat run scripts/deploy-continue-mainnet.ts --network xlayer
 */

const DECISION_LOGGER_ADDR = "0x5989f764bC20072e6554860547CfEC474877892C";
const STRATEGY_MANAGER_ADDR = "0x2180fA2e3F89E314941b23B7acC0e60513766712";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== 196) {
    throw new Error(
      `deploy-continue-mainnet.ts is mainnet-only. Got chainId ${chainId}. ` +
        `Run with --network xlayer.`
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  const nonce = await ethers.provider.getTransactionCount(deployer.address);

  console.log("========================================");
  console.log("  YieldAgent v2 — continue mainnet deploy");
  console.log("========================================");
  console.log(`  Network:  ${network.name} (chainId ${chainId})`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Balance:  ${ethers.formatEther(balance)} OKB`);
  console.log(`  Nonce:    ${nonce}`);
  console.log("========================================\n");

  // Sanity-check the first two contracts are actually at the expected addrs.
  for (const [name, addr] of [
    ["DecisionLogger", DECISION_LOGGER_ADDR],
    ["StrategyManager", STRATEGY_MANAGER_ADDR],
  ] as const) {
    const code = await ethers.provider.getCode(addr);
    if (code === "0x") {
      throw new Error(
        `${name} at ${addr} has no bytecode on mainnet. ` +
          `Re-run scripts/deploy.ts from scratch — the resumable assumption ` +
          `no longer holds.`
      );
    }
    console.log(`  ${name.padEnd(18)} ${addr}  (${(code.length - 2) / 2} bytes)`);
  }
  console.log();

  // 3. Deploy FollowVaultFactory
  console.log("3. Deploying FollowVaultFactory...");
  const FollowVaultFactory = await ethers.getContractFactory(
    "FollowVaultFactory"
  );
  const followVaultFactory = await FollowVaultFactory.deploy(
    STRATEGY_MANAGER_ADDR
  );
  await followVaultFactory.waitForDeployment();
  const followVaultFactoryAddr = await followVaultFactory.getAddress();
  console.log(`   FollowVaultFactory: ${followVaultFactoryAddr}`);

  // 4. Configure permissions
  console.log("\n4. Configuring permissions...");

  const decisionLogger = await ethers.getContractAt(
    "DecisionLogger",
    DECISION_LOGGER_ADDR
  );
  const strategyManager = await ethers.getContractAt(
    "StrategyManager",
    STRATEGY_MANAGER_ADDR
  );

  const tx1 = await decisionLogger.setAuthorized(STRATEGY_MANAGER_ADDR, true);
  await tx1.wait();
  console.log(`   setAuthorized(StrategyManager)  tx: ${tx1.hash}`);

  const agentAddr = (process.env.AGENT_ADDRESS || deployer.address).toLowerCase();
  const tx2 = await strategyManager.setAgent(agentAddr, true);
  await tx2.wait();
  console.log(`   setAgent(${agentAddr})  tx: ${tx2.hash}`);

  // Summary
  console.log("\n========================================");
  console.log(`  Deployed on chain ${chainId}`);
  console.log("========================================");
  console.log(`  DecisionLogger:     ${DECISION_LOGGER_ADDR}`);
  console.log(`  StrategyManager:    ${STRATEGY_MANAGER_ADDR}`);
  console.log(`  FollowVaultFactory: ${followVaultFactoryAddr}`);
  console.log(`  Agent:              ${agentAddr}`);
  console.log("========================================");

  const deployment = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    agent: agentAddr,
    contracts: {
      DecisionLogger: DECISION_LOGGER_ADDR,
      StrategyManager: STRATEGY_MANAGER_ADDR,
      FollowVaultFactory: followVaultFactoryAddr,
    },
    txs: {
      setAuthorized: tx1.hash,
      setAgent: tx2.hash,
    },
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    note:
      "Resumed from a mid-flow UND_ERR_CONNECT_TIMEOUT after DecisionLogger + " +
      "StrategyManager had already been mined at nonce 0 and 1.",
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  const rootFile = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(rootFile, JSON.stringify(deployment, null, 2));

  console.log(`\nDeployment saved to:`);
  console.log(`  ${outFile}`);
  console.log(`  ${rootFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
