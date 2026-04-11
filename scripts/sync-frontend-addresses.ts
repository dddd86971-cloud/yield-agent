/**
 * Sync the latest deployment.json → frontend/src/config/contracts.ts
 *
 * Run this after every `hardhat run scripts/deploy.ts --network <x>` to keep
 * the frontend in lock-step with the on-chain deployment.
 */
import * as fs from "fs";
import * as path from "path";

const rootDir = path.join(__dirname, "..");
const contractsFile = path.join(rootDir, "frontend", "src", "config", "contracts.ts");
const deploymentsDir = path.join(rootDir, "deployments");

interface Deployment {
  chainId: number;
  contracts: {
    DecisionLogger: string;
    StrategyManager: string;
    FollowVaultFactory: string;
  };
  blockNumber: number;
}

function main() {
  if (!fs.existsSync(deploymentsDir)) {
    console.error("No deployments/ directory. Run scripts/deploy.ts first.");
    process.exit(1);
  }

  const files = fs.readdirSync(deploymentsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("No deployment files found in deployments/");
    process.exit(1);
  }

  const deployments = files
    .map((f) => JSON.parse(fs.readFileSync(path.join(deploymentsDir, f), "utf-8")) as Deployment)
    .filter((d) => d.chainId === 196 || d.chainId === 1952);

  if (deployments.length === 0) {
    console.error("No X Layer deployments found (need chainId 196 or 1952).");
    process.exit(1);
  }

  let source = fs.readFileSync(contractsFile, "utf-8");

  for (const d of deployments) {
    const block = /* @ts-ignore */ `  // X Layer ${d.chainId === 196 ? "Mainnet" : "Testnet"}\n  ${d.chainId}: {\n    decisionLogger: "${d.contracts.DecisionLogger}" as \`0x\${string}\`,\n    strategyManager: "${d.contracts.StrategyManager}" as \`0x\${string}\`,\n    followVaultFactory: "${d.contracts.FollowVaultFactory}" as \`0x\${string}\`,\n    deployedAt: ${d.blockNumber},\n  },`;

    // Replace the existing block for this chainId
    const regex = new RegExp(`  // X Layer (?:Mainnet|Testnet[^\\n]*)\\n  ${d.chainId}: \\{[\\s\\S]*?\\n  \\},`, "m");
    if (regex.test(source)) {
      source = source.replace(regex, block);
      console.log(`Updated chain ${d.chainId}: ${d.contracts.StrategyManager}`);
    } else {
      console.warn(`Could not find block for chain ${d.chainId} in contracts.ts (no regex match)`);
    }
  }

  fs.writeFileSync(contractsFile, source);
  console.log(`\nSynced ${deployments.length} deployment(s) → ${path.relative(rootDir, contractsFile)}`);
}

main();
