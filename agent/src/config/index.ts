import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Resolve chain from env (default mainnet 196). Testnet is 1952.
// Each chain gets its own RPC URL — mainnet uses XLAYER_RPC_URL, testnet
// uses XLAYER_TESTNET_RPC_URL. This lets one .env drive both modes by
// flipping CHAIN_ID.
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "196");
const IS_TESTNET = CHAIN_ID === 1952;
const RPC_URL = IS_TESTNET
  ? process.env.XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech"
  : process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech";

export const config = {
  // Chain
  rpcUrl: RPC_URL,
  chainId: CHAIN_ID,
  isTestnet: IS_TESTNET,

  // Agent wallet
  privateKey: process.env.PRIVATE_KEY || "",

  // Contracts
  strategyManager: process.env.STRATEGY_MANAGER_ADDRESS || "",
  decisionLogger: process.env.DECISION_LOGGER_ADDRESS || "",
  followVaultFactory: process.env.FOLLOW_VAULT_FACTORY_ADDRESS || "",

  // Uniswap V3 — official deployment on X Layer (verified via @uniswap/sdk-core v7.13.0)
  uniswapV3: {
    factory: process.env.UNISWAP_V3_FACTORY || "0x4B2ab38DBF28D31D467aA8993f6c2585981D6804",
    positionManager: process.env.UNISWAP_V3_POSITION_MANAGER || "0x315e413a11ab0df498ef83873012430ca36638ae",
    swapRouter: process.env.UNISWAP_V3_ROUTER || "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca",
    quoter: process.env.UNISWAP_V3_QUOTER || "0x976183ac3d09840d243a88c0268badb3b3e3259f",
    tickLens: process.env.UNISWAP_V3_TICK_LENS || "0x661e93cca42afacb172121ef892830ca3b70f08d",
    multicall: process.env.UNISWAP_V3_MULTICALL || "0xe2023f3fa515cf070e07fd9d51c1d236e07843f4",
  },

  // Tokens on X Layer
  tokens: {
    WOKB: process.env.WOKB_ADDRESS || "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    USDT: process.env.USDT_ADDRESS || "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    USDC: process.env.USDC_ADDRESS || "0x74b7f16337b8972027f6196a17a631ac6de26d22",
    WETH: process.env.WETH_ADDRESS || "0x5a77f1443d16ee5461801882a092c8620b8c4d58",
  },

  // AI
  openaiApiKey: process.env.OPENAI_API_KEY || "",

  // OnchainOS execution layer
  //
  // Every DEX transaction YieldAgent performs must go through the OnchainOS
  // CLI so the tx is signed inside the Agentic Wallet's TEE and tracked by
  // the OnchainOS API — that is the anti-gaming rule for the "Most Active
  // On-Chain Agent" prize.
  //
  // simulate:
  //   Auto-enabled when `OKX_ACCESS_KEY` is not set, so the frontend demo and
  //   local dev still produce mock tx hashes without hammering the real CLI.
  //   Set `ONCHAINOS_SIMULATE=true` to force simulate mode even when creds
  //   are present (useful for running the monitoring loop dry).
  onchainos: {
    simulate:
      !process.env.OKX_ACCESS_KEY ||
      process.env.ONCHAINOS_SIMULATE === "true" ||
      process.env.ONCHAINOS_SIMULATE === "1",
    cliPath: process.env.ONCHAINOS_CLI_PATH || "onchainos",
    // NOTE: OnchainOS CLI accepts chains as numeric chainIndex, not names.
    // `--chain xlayer` / `--chain okb` both return "unknown chain". The only
    // value that works for X Layer mainnet is "196".
    //    Verified via `onchainos defi support-chains` (returns XLAYER @ 196)
    //    and `onchainos wallet balance --chain 196`.
    defaultChain: IS_TESTNET ? "1952" : "196",
    // The Agentic Wallet address assigned by OnchainOS on first `wallet login`.
    // This is DIFFERENT from AGENT_ADDRESS (which is the audit-layer signer).
    // All DEX txs are signed inside the TEE by this address; the audit layer
    // is signed by AGENT_ADDRESS. Both wallets need OKB on X Layer mainnet.
    walletAddress: process.env.ONCHAINOS_WALLET_ADDRESS || "",
    // X Layer mainstream tokens used by swap-based rebalancing. X Layer's
    // dominant stablecoin is USDT (not USDC — verified via `defi search`:
    // USDT returns 4 V3 pools, USDC returns 0). Native OKB uses the standard
    // ETH-style placeholder 0xeeee…eeee.
    nativeTokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    stableTokenAddress: "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT
    stableTokenSymbol: "USDT",
  },

  // Pools
  pools: {
    "USDT/OKB": {
      address: "0x63d62734847E55A266FCa4219A9aD0a02D5F6e02",
      fee: 3000,
      token0Symbol: "USDT",
      token1Symbol: "OKB",
    },
    "WETH/USDT": {
      address: "0xd4e12E274AEFC5F0b4abC1fC5D9581e4B8bE04da",
      fee: 3000,
      token0Symbol: "WETH",
      token1Symbol: "USDT",
    },
  },

  // Server
  port: parseInt(process.env.PORT || "3001"),

  // Agent parameters
  agent: {
    evaluationIntervalMs: 5 * 60 * 1000,     // 5 minutes: quick price check
    fullEvalIntervalMs: 30 * 60 * 1000,       // 30 minutes: full three-brain eval
    compoundIntervalMs: 6 * 60 * 60 * 1000,   // 6 hours: compound fees
    rebalanceThreshold: 0.75,                  // Rebalance when price at 75% of range
    maxSlippageBps: 50,                        // 0.5% max slippage
    gasBufferOKB: "0.05",                      // Keep 0.05 OKB for gas
  },
} as const;
