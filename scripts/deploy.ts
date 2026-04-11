import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * YieldAgent v2 deployment
 *
 * Deploys the three slim on-chain audit/registry contracts. There is NO
 * Uniswap V3 dependency — all DEX execution happens off-chain via the
 * OnchainOS `defi` CLI, and this contract set only records the resulting
 * decisions + tx hashes.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network xlayerTestnet
 *   npx hardhat run scripts/deploy.ts --network xlayer
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("========================================");
  console.log("  YieldAgent v2 Deployment");
  console.log("========================================");
  console.log(`  Network:  ${network.name} (chainId ${chainId})`);
  console.log(`  Deployer: ${deployer.address}`);
  const nativeSymbol = chainId === 196 || chainId === 1952 ? "OKB" : "ETH";
  console.log(`  Balance:  ${ethers.formatEther(balance)} ${nativeSymbol}`);
  console.log("========================================\n");

  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has 0 balance on chain ${chainId}. ` +
        `Fund it before running deploy.`
    );
  }

  // 1. Deploy DecisionLogger
  console.log("1. Deploying DecisionLogger...");
  const DecisionLogger = await ethers.getContractFactory("DecisionLogger");
  const decisionLogger = await DecisionLogger.deploy();
  await decisionLogger.waitForDeployment();
  const decisionLoggerAddr = await decisionLogger.getAddress();
  console.log(`   DecisionLogger: ${decisionLoggerAddr}`);

  // 2. Deploy StrategyManager v2 (audit/registry only, no DEX deps)
  console.log("\n2. Deploying StrategyManager v2...");
  const StrategyManager = await ethers.getContractFactory("StrategyManager");
  const strategyManager = await StrategyManager.deploy(decisionLoggerAddr);
  await strategyManager.waitForDeployment();
  const strategyManagerAddr = await strategyManager.getAddress();
  console.log(`   StrategyManager: ${strategyManagerAddr}`);

  // 3. Deploy FollowVaultFactory
  console.log("\n3. Deploying FollowVaultFactory...");
  const FollowVaultFactory = await ethers.getContractFactory("FollowVaultFactory");
  const followVaultFactory = await FollowVaultFactory.deploy(strategyManagerAddr);
  await followVaultFactory.waitForDeployment();
  const followVaultFactoryAddr = await followVaultFactory.getAddress();
  console.log(`   FollowVaultFactory: ${followVaultFactoryAddr}`);

  // 4. Configure permissions
  console.log("\n4. Configuring permissions...");

  const tx1 = await decisionLogger.setAuthorized(strategyManagerAddr, true);
  await tx1.wait();
  console.log("   StrategyManager authorized on DecisionLogger");

  // Optional agent address. If AGENT_ADDRESS env var is set, use that;
  // otherwise whitelist the deployer so smoke-tests can run immediately.
  const agentAddr = (process.env.AGENT_ADDRESS || deployer.address).toLowerCase();
  const tx2 = await strategyManager.setAgent(agentAddr, true);
  await tx2.wait();
  console.log(`   Agent whitelisted: ${agentAddr}`);

  // Summary
  console.log("\n========================================");
  console.log(`  Deployed on chain ${chainId}`);
  console.log("========================================");
  console.log(`  DecisionLogger:     ${decisionLoggerAddr}`);
  console.log(`  StrategyManager:    ${strategyManagerAddr}`);
  console.log(`  FollowVaultFactory: ${followVaultFactoryAddr}`);
  console.log(`  Agent:              ${agentAddr}`);
  console.log("========================================");

  // Write deployment artifact — one file per chain so testnet + mainnet
  // don't overwrite each other.
  const deployment = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    agent: agentAddr,
    contracts: {
      DecisionLogger: decisionLoggerAddr,
      StrategyManager: strategyManagerAddr,
      FollowVaultFactory: followVaultFactoryAddr,
    },
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  // Also write the latest deployment at project root for convenience
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
