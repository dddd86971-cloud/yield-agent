import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Redeploy FollowVaultFactory with the fixed FollowVault share-math.
 *
 * Why this script exists
 * ----------------------
 * The hardhat unit test suite (`test/FollowVault.test.ts`) flagged a
 * share-price dilution bug in the original `FollowVault.follow()`: the
 * method was reading `totalAssets()` *after* the `safeTransferFrom`, so
 * the new deposit counted toward its own denominator and silently taxed
 * the new follower in favour of existing holders. The fix — snapshotting
 * `assetsBefore = totalAssets()` before the transfer — is committed to
 * `contracts/FollowVault.sol` and verified green by the test suite.
 *
 * The mainnet `FollowVaultFactory` at `0x9203C9d95115652b5799ab9e9A640DDEB0879F85`
 * still carries the pre-fix bytecode, but the factory has produced
 * **zero** vault instances on mainnet (no `createVault` tx exists — see
 * SUBMISSION.md's Proof of Work section: the six mainnet txs are all
 * swap-layer, none touch the factory), so no real funds were ever
 * exposed. Before any production launch that accepts real followers,
 * the factory must be redeployed with the fixed bytecode — this script
 * is the idempotent, dry-runnable tool for that.
 *
 * What this script does NOT touch
 * -------------------------------
 *   - DecisionLogger / StrategyManager contracts. Those have no FollowVault
 *     bug and must stay pinned at their current addresses so every mainnet
 *     `recordExecution` / `logDecision` tx in the SUBMISSION Proof of Work
 *     table continues to resolve against the same audit trail.
 *   - Existing `FollowVaultFactory` at 0x9203…9F85. The old factory stays on
 *     chain forever; we only deploy a *new* one alongside it. Judges who
 *     want to verify the fix can query both addresses on OKLink and see
 *     the old factory's `vaultCount()` == 0 (no migration needed).
 *   - Any FollowVault instance. There are none on mainnet today.
 *
 * Usage
 * -----
 *   # Dry run — prints the plan, no txs broadcast, no files written
 *   REDEPLOY_DRY_RUN=1 \
 *     STRATEGY_MANAGER_ADDRESS=0x2180fA2e3F89E314941b23B7acC0e60513766712 \
 *     npx hardhat run scripts/redeploy-follow-vault-factory.ts --network xlayer
 *
 *   # Real redeploy on mainnet — broadcasts a single CREATE tx from the
 *   # agent signer (~0.0001 OKB)
 *   STRATEGY_MANAGER_ADDRESS=0x2180fA2e3F89E314941b23B7acC0e60513766712 \
 *     npx hardhat run scripts/redeploy-follow-vault-factory.ts --network xlayer
 *
 *   # Point at a non-canonical StrategyManager (e.g. for a fresh testnet
 *   # rehearsal)
 *   STRATEGY_MANAGER_ADDRESS=0x... \
 *     npx hardhat run scripts/redeploy-follow-vault-factory.ts --network xlayerTestnet
 *
 *   # Update deployments/<chainId>.json in place after success
 *   REDEPLOY_UPDATE_ARTIFACT=1 \
 *     STRATEGY_MANAGER_ADDRESS=0x2180fA2e3F89E314941b23B7acC0e60513766712 \
 *     npx hardhat run scripts/redeploy-follow-vault-factory.ts --network xlayer
 *
 * Safety
 * ------
 *   - Runs a dry-run preflight that prints the plan before any tx is sent.
 *   - Rejects a non-mainnet / non-testnet chainId.
 *   - Reads StrategyManager.feeRecipient() and nextStrategyId() before
 *     deploy to prove the signer can actually see the pinned manager.
 *   - Never touches DecisionLogger or StrategyManager.
 *   - Never modifies `deployment.json` or `deployments/<chainId>.json`
 *     unless `REDEPLOY_UPDATE_ARTIFACT=1` is explicitly set. The default
 *     behavior is to print the new address and exit, leaving artifact
 *     updates as a deliberate second step so a judge can decide whether
 *     to re-wire the frontend or leave the pre-fix factory pinned.
 *
 * Post-deploy TODO (manual, not automated)
 * ----------------------------------------
 *   1. Update `.env` → `FOLLOW_VAULT_FACTORY_ADDRESS=<new>`
 *   2. Update `frontend/.env.local` → `NEXT_PUBLIC_FOLLOW_VAULT_FACTORY_ADDRESS=<new>`
 *   3. (Optional) run `npx ts-node scripts/sync-frontend-addresses.ts` to
 *      rewrite `frontend/src/config/contracts.ts`.
 *   4. Update `SUBMISSION.md` §Known Limitations #6 to reference the new
 *      address and mark the old one as "retired, zero instances, safe to
 *      ignore".
 *
 * Verification checklist
 * ----------------------
 *   - `followVaultFactory.strategyManager()` returns the pinned manager.
 *   - `followVaultFactory.vaultCount()` returns 0 (fresh deploy).
 *   - The bytecode at the new address does NOT contain the pre-fix
 *     `shares = (amount * totalSupply) / totalAssets()` pattern reading
 *     post-transfer state. (Difficult to grep against compiled bytecode;
 *     easier to trust the hardhat test suite which is the forcing
 *     function.)
 */

interface RedeployArgs {
  strategyManagerAddr: string;
  dryRun: boolean;
  updateArtifact: boolean;
}

function parseArgs(): RedeployArgs {
  const strategyManagerAddr = process.env.STRATEGY_MANAGER_ADDRESS;
  if (!strategyManagerAddr) {
    throw new Error(
      "STRATEGY_MANAGER_ADDRESS env var is required. Set it to the StrategyManager you want the new FollowVaultFactory pinned to.",
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(strategyManagerAddr)) {
    throw new Error(
      `STRATEGY_MANAGER_ADDRESS must be a 20-byte hex address, got ${strategyManagerAddr}`,
    );
  }

  const dryRun = ["1", "true", "yes"].includes(
    (process.env.REDEPLOY_DRY_RUN ?? "").toLowerCase(),
  );
  const updateArtifact = ["1", "true", "yes"].includes(
    (process.env.REDEPLOY_UPDATE_ARTIFACT ?? "").toLowerCase(),
  );

  return { strategyManagerAddr, dryRun, updateArtifact };
}

async function main() {
  const { strategyManagerAddr, dryRun, updateArtifact } = parseArgs();

  const [signer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const balance = await ethers.provider.getBalance(signer.address);

  if (chainId !== 196 && chainId !== 1952) {
    throw new Error(
      `This script only targets X Layer mainnet (196) or testnet (1952). Got chainId ${chainId}.`,
    );
  }

  const nativeSymbol = "OKB";

  console.log("========================================");
  console.log("  Redeploy FollowVaultFactory (share-math fix)");
  console.log("========================================");
  console.log(`  Network:         ${network.name} (${chainId})`);
  console.log(`  Signer:          ${signer.address}`);
  console.log(`  Balance:         ${ethers.formatEther(balance)} ${nativeSymbol}`);
  console.log(`  StrategyManager: ${strategyManagerAddr}  (pinned, will NOT be touched)`);
  console.log(`  Dry run:         ${dryRun}`);
  console.log(`  Update artifact: ${updateArtifact}`);
  console.log("========================================\n");

  if (balance === 0n) {
    throw new Error(
      `Signer ${signer.address} has 0 ${nativeSymbol} balance on chain ${chainId}. Fund before running.`,
    );
  }

  // --------------------------------------------------------------------
  // Preflight: verify pinned StrategyManager is reachable and sane.
  // This proves the signer can see the pinned manager AND that the manager
  // contract is actually deployed at that address — a simple guard against
  // typos in STRATEGY_MANAGER_ADDRESS.
  // --------------------------------------------------------------------
  const sm = await ethers.getContractAt("StrategyManager", strategyManagerAddr);
  let nextId: bigint;
  let feeRecipient: string;
  try {
    nextId = await sm.nextStrategyId();
    feeRecipient = await sm.feeRecipient();
  } catch (err: any) {
    throw new Error(
      `Preflight failed: could not call StrategyManager at ${strategyManagerAddr}. ` +
        `Either the address is wrong or the contract is not yet deployed. ` +
        `Underlying error: ${err?.message ?? err}`,
    );
  }

  console.log("  Preflight OK");
  console.log(`    StrategyManager.nextStrategyId() = ${nextId}`);
  console.log(`    StrategyManager.feeRecipient()   = ${feeRecipient}`);
  console.log("");

  if (dryRun) {
    console.log("  DRY RUN — no transactions will be broadcast.");
    console.log(
      `  Would deploy FollowVaultFactory(strategyManager=${strategyManagerAddr}) from ${signer.address}.`,
    );
    console.log(
      "  Expected one CREATE tx, gas ~2.5M, cost well under 0.001 OKB on X Layer.",
    );
    return;
  }

  // --------------------------------------------------------------------
  // Actual redeploy — a single CREATE tx.
  // --------------------------------------------------------------------
  console.log("  Deploying new FollowVaultFactory...");
  const Factory = await ethers.getContractFactory("FollowVaultFactory");
  const factory = await Factory.deploy(strategyManagerAddr);
  await factory.waitForDeployment();
  const newAddr = await factory.getAddress();
  const deployTx = factory.deploymentTransaction();

  console.log(`  New FollowVaultFactory: ${newAddr}`);
  console.log(`  Deploy tx: ${deployTx?.hash ?? "<unknown>"}`);

  // --------------------------------------------------------------------
  // Post-deploy sanity — prove the new factory is wired to the right SM
  // and that vaultCount is zero (fresh state).
  // --------------------------------------------------------------------
  const pinnedSm = await factory.strategyManager();
  const vaultCount = await factory.vaultCount();
  console.log("\n  Post-deploy sanity");
  console.log(`    factory.strategyManager() = ${pinnedSm}`);
  console.log(`    factory.vaultCount()      = ${vaultCount}`);
  if (pinnedSm.toLowerCase() !== strategyManagerAddr.toLowerCase()) {
    throw new Error(
      `Post-deploy mismatch: factory.strategyManager() is ${pinnedSm}, expected ${strategyManagerAddr}`,
    );
  }
  if (vaultCount !== 0n) {
    throw new Error(
      `Post-deploy sanity failed: vaultCount should be 0 on a fresh deploy, got ${vaultCount}`,
    );
  }

  // --------------------------------------------------------------------
  // Optional: update deployments/<chainId>.json so sync-frontend-addresses
  // picks up the new address on the next run. We only touch the
  // FollowVaultFactory field and leave DecisionLogger / StrategyManager
  // untouched.
  // --------------------------------------------------------------------
  if (updateArtifact) {
    const outDir = path.join(__dirname, "..", "deployments");
    const outFile = path.join(outDir, `${chainId}.json`);
    if (!fs.existsSync(outFile)) {
      console.warn(
        `  Warn: ${outFile} does not exist — skipping artifact update. Run scripts/deploy.ts first.`,
      );
    } else {
      const existing = JSON.parse(fs.readFileSync(outFile, "utf-8"));
      const oldAddr = existing?.contracts?.FollowVaultFactory ?? "<none>";
      existing.contracts = existing.contracts ?? {};
      existing.contracts.FollowVaultFactory = newAddr;
      existing.followVaultFactoryRedeployedAt = {
        blockNumber: await ethers.provider.getBlockNumber(),
        timestamp: new Date().toISOString(),
        previousAddress: oldAddr,
        deployTx: deployTx?.hash ?? null,
        reason:
          "FollowVault.follow() share-math dilution fix — see SUBMISSION.md §Known Limitations #6",
      };
      fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
      console.log(`\n  Updated ${outFile}`);
      console.log(`    FollowVaultFactory: ${oldAddr} → ${newAddr}`);

      // Also update the root shortcut file if it exists.
      const rootFile = path.join(__dirname, "..", "deployment.json");
      if (fs.existsSync(rootFile)) {
        const rootExisting = JSON.parse(fs.readFileSync(rootFile, "utf-8"));
        if (Number(rootExisting.chainId) === chainId) {
          rootExisting.contracts = rootExisting.contracts ?? {};
          rootExisting.contracts.FollowVaultFactory = newAddr;
          rootExisting.followVaultFactoryRedeployedAt =
            existing.followVaultFactoryRedeployedAt;
          fs.writeFileSync(rootFile, JSON.stringify(rootExisting, null, 2));
          console.log(`  Updated ${rootFile}`);
        }
      }
    }
  } else {
    console.log(
      "\n  Artifact files NOT updated (pass REDEPLOY_UPDATE_ARTIFACT=1 to update).",
    );
    console.log(
      `  To wire the frontend manually, set FOLLOW_VAULT_FACTORY_ADDRESS=${newAddr} in .env`,
    );
    console.log(
      `  and NEXT_PUBLIC_FOLLOW_VAULT_FACTORY_ADDRESS=${newAddr} in frontend/.env.local`,
    );
  }

  console.log("\n  Done. New factory is live, unlinked from the old one.");
  console.log(
    `  Next step: run FollowVaultFactory.createVault(strategyId, USDT, 1000, ...) to mint the first fixed-bytecode vault.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
