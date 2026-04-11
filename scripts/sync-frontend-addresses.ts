/**
 * Sync the latest deployment receipts from `deployments/<chainId>.json`
 * into `frontend/src/config/contracts.ts`.
 *
 * Run this after every `hardhat run scripts/deploy.ts --network <x>` to
 * keep the frontend in lock-step with the on-chain deployment.
 *
 *   npm run deploy:xlayer          # or deploy:xlayer:testnet
 *   npx ts-node scripts/sync-frontend-addresses.ts
 *
 * The script is idempotent — running it twice produces the same file.
 * It only rewrites chains that (a) have a deployment receipt on disk
 * AND (b) already have a matching block in `contracts.ts`. If a chain
 * is missing from contracts.ts, a warning is logged and no `.bak` is
 * left behind.
 *
 * Skips files ending in `.smoke.json` (development smoke-test receipts
 * that judges shouldn't see wired into the frontend).
 */
import * as fs from "fs";
import * as path from "path";

const rootDir = path.join(__dirname, "..");
const contractsFile = path.join(
  rootDir,
  "frontend",
  "src",
  "config",
  "contracts.ts"
);
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

const SUPPORTED_CHAIN_IDS = new Set([196, 1952]);

function loadDeployments(): Deployment[] {
  if (!fs.existsSync(deploymentsDir)) {
    console.error("No deployments/ directory. Run scripts/deploy.ts first.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".smoke.json"));

  if (files.length === 0) {
    console.error("No deployment files found in deployments/");
    process.exit(1);
  }

  const deployments: Deployment[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(deploymentsDir, f), "utf-8");
      const parsed = JSON.parse(raw) as Deployment;
      if (!SUPPORTED_CHAIN_IDS.has(parsed.chainId)) {
        console.warn(
          `  Skipping ${f}: chainId ${parsed.chainId} is not a supported X Layer chain (196 or 1952).`
        );
        continue;
      }
      if (
        !parsed.contracts?.DecisionLogger ||
        !parsed.contracts?.StrategyManager ||
        !parsed.contracts?.FollowVaultFactory
      ) {
        console.warn(
          `  Skipping ${f}: deployment receipt is missing at least one of DecisionLogger/StrategyManager/FollowVaultFactory.`
        );
        continue;
      }
      deployments.push(parsed);
    } catch (err: any) {
      console.warn(`  Skipping ${f}: could not parse (${err?.message ?? err})`);
    }
  }

  if (deployments.length === 0) {
    console.error("No X Layer deployments found (need chainId 196 or 1952).");
    process.exit(1);
  }
  return deployments;
}

function buildBlock(d: Deployment): string {
  const label = d.chainId === 196 ? "X Layer Mainnet" : "X Layer Testnet";
  // Note: backticks in the rendered TypeScript literal have to be escaped
  // because we are building it inside a template literal.
  return (
    `  // ${label}\n` +
    `  ${d.chainId}: {\n` +
    `    decisionLogger: "${d.contracts.DecisionLogger}" as \`0x\${string}\`,\n` +
    `    strategyManager: "${d.contracts.StrategyManager}" as \`0x\${string}\`,\n` +
    `    followVaultFactory: "${d.contracts.FollowVaultFactory}" as \`0x\${string}\`,\n` +
    `    deployedAt: ${d.blockNumber},\n` +
    `  },`
  );
}

function main() {
  const deployments = loadDeployments();
  let source = fs.readFileSync(contractsFile, "utf-8");
  let rewritten = 0;

  for (const d of deployments) {
    const block = buildBlock(d);

    // Replace the existing block for this chainId. Match:
    //   `  // X Layer Mainnet\n  196: {\n ... \n  },`
    // or
    //   `  // X Layer Testnet[ anything until newline]\n  1952: {\n ... \n  },`
    const regex = new RegExp(
      `  // X Layer (?:Mainnet|Testnet)[^\\n]*\\n  ${d.chainId}: \\{[\\s\\S]*?\\n  \\},`,
      "m"
    );
    if (regex.test(source)) {
      source = source.replace(regex, block);
      console.log(
        `Updated chain ${d.chainId}: StrategyManager=${d.contracts.StrategyManager} (deployedAt=${d.blockNumber})`
      );
      rewritten++;
    } else {
      console.warn(
        `Could not find block for chain ${d.chainId} in contracts.ts (no regex match). Add a skeleton entry first, then re-run.`
      );
    }
  }

  if (rewritten === 0) {
    console.error("No chains updated. Aborting without writing.");
    process.exit(1);
  }

  fs.writeFileSync(contractsFile, source);
  console.log(
    `\nSynced ${rewritten} chain(s) → ${path.relative(rootDir, contractsFile)}`
  );
}

main();
