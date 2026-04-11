/**
 * YieldAgent v2 contract addresses per chain.
 *
 * These are populated by `scripts/deploy.ts` which writes to
 * `yield-agent/deployment.json` and `yield-agent/deployments/<chainId>.json`.
 * After a fresh deploy, update the corresponding block below with the new
 * addresses.
 *
 * v2 NOTE: These three contracts are a slim audit/registry layer. All real
 * DEX execution happens off-chain via the OnchainOS `defi invest/withdraw/
 * collect` CLI, signed by the agent's Agentic Wallet. The contracts below
 * exist to anchor every AI decision and every OnchainOS tx hash on-chain
 * so judges and followers can verify the full reasoning chain.
 */

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export type ContractSet = {
  decisionLogger: `0x${string}`;
  strategyManager: `0x${string}`;
  followVaultFactory: `0x${string}`;
  /** Block number the contracts were deployed at (for event scans) */
  deployedAt: number;
};

export type SupportedChainId = 196 | 1952;

export const CONTRACTS: Record<SupportedChainId, ContractSet> = {
  // X Layer Mainnet
  196: {
    decisionLogger: ZERO_ADDRESS,
    strategyManager: ZERO_ADDRESS,
    followVaultFactory: ZERO_ADDRESS,
    deployedAt: 0,
  },
  // X Layer Testnet
  1952: {
    decisionLogger: "0x5989f764bC20072e6554860547CfEC474877892C" as `0x${string}`,
    strategyManager: "0x2180fA2e3F89E314941b23B7acC0e60513766712" as `0x${string}`,
    followVaultFactory: "0x9203C9d95115652b5799ab9e9A640DDEB0879F85" as `0x${string}`,
    deployedAt: 27363103,
  },
};

export const DEFAULT_CHAIN_ID: SupportedChainId = 196;

/** Token addresses on X Layer mainnet */
export const TOKENS = {
  WOKB: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" as `0x${string}`,
  USDC: "0x74b7f16337b8972027f6196a17a631ac6de26d22" as `0x${string}`,
  WETH: "0x5a77f1443d16ee5461801882a092c8620b8c4d58" as `0x${string}`,
} as const;

/** True when the contracts for a chain are deployed (non-zero address) */
export function isDeployed(chainId: SupportedChainId): boolean {
  const c = CONTRACTS[chainId];
  return (
    c.decisionLogger !== ZERO_ADDRESS &&
    c.strategyManager !== ZERO_ADDRESS &&
    c.followVaultFactory !== ZERO_ADDRESS
  );
}

/** Get contract set for the default chain, throw if not deployed */
export function requireContracts(chainId: SupportedChainId = DEFAULT_CHAIN_ID): ContractSet {
  if (!isDeployed(chainId)) {
    throw new Error(
      `YieldAgent contracts not deployed on chain ${chainId}. Run \`npx hardhat run scripts/deploy.ts --network xlayer\` and update frontend/src/config/contracts.ts.`
    );
  }
  return CONTRACTS[chainId];
}

/** OKLink explorer URL for an address on a given chain */
export function explorerUrl(chainId: SupportedChainId, address: string, type: "address" | "tx" = "address"): string {
  const base = chainId === 196
    ? "https://www.oklink.com/xlayer"
    : "https://www.oklink.com/xlayer-test";
  return `${base}/${type}/${address}`;
}
