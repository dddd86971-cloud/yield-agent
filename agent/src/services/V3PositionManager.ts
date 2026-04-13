/**
 * V3PositionManager — real Uniswap V3 LP lifecycle on X Layer.
 *
 * Handles:
 *   1. Approve tokens → NonfungiblePositionManager
 *   2. Mint new LP positions (mint())
 *   3. Collect accrued fees (collect())
 *   4. Remove liquidity (decreaseLiquidity())
 *   5. Full rebalance (remove + collect + re-mint at new range)
 *
 * All transactions are signed by the agent wallet (PRIVATE_KEY) directly.
 * The audit trail is written by AgentCoordinator after each action.
 */

import { ethers } from "ethers";
import { config } from "../config";
import {
  getOnchainOSAdapter,
  OnchainOSAdapter,
  ContractCallParams,
} from "../adapters/OnchainOSAdapter";

// ============ ABIs ============

const NPM_ABI = [
  // Read
  "function factory() external view returns (address)",
  "function WETH9() external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function totalSupply() external view returns (uint256)",
  // Write
  "function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function increaseLiquidity(tuple(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity(tuple(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) external payable returns (uint256 amount0, uint256 amount1)",
  "function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) external payable returns (uint256 amount0, uint256 amount1)",
  // Multicall for atomic operations
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function refundETH() external payable",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
  "function tickSpacing() external view returns (int24)",
  "function liquidity() external view returns (uint128)",
];

// ============ Types ============

export interface MintParams {
  poolAddress: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  slippageBps?: number; // default 50 = 0.5%
}

export interface MintResult {
  tokenId: number;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  txHash: string;
}

export interface CollectResult {
  amount0: bigint;
  amount1: bigint;
  txHash: string;
}

export interface RemoveLiquidityResult {
  amount0: bigint;
  amount1: bigint;
  txHash: string;
}

export interface RebalanceResult {
  oldTokenId: number;
  newTokenId: number;
  removedAmount0: bigint;
  removedAmount1: bigint;
  collectedFees0: bigint;
  collectedFees1: bigint;
  newLiquidity: bigint;
  newAmount0: bigint;
  newAmount1: bigint;
  txHash: string;
}

export interface PositionDetail {
  tokenId: number;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

// ============ Helpers ============

/** Align a tick down to the nearest multiple of tickSpacing. */
function alignTick(tick: number, spacing: number): number {
  return Math.floor(tick / spacing) * spacing;
}

/** Calculate sqrtPriceX96 from tick for amount calculation. */
function tickToSqrtPriceX96(tick: number): bigint {
  const absTick = Math.abs(tick);
  let ratio = (absTick & 0x1) !== 0
    ? BigInt("0xfffcb933bd6fad37aa2d162d1a594001")
    : BigInt("0x100000000000000000000000000000000");

  const multipliers: [number, string][] = [
    [0x2, "0xfff97272373d413259a46990580e213a"],
    [0x4, "0xfff2e50f5f656932ef12357cf3c7fdcc"],
    [0x8, "0xffe5caca7e10e4e61c3624eaa0941cd0"],
    [0x10, "0xffcb9843d60f6159c9db58835c926644"],
    [0x20, "0xff973b41fa98c081472e6896dfb254c0"],
    [0x40, "0xff2ea16466c96a3843ec78b326b52861"],
    [0x80, "0xfe5dee046a99a2a811c461f1969c3053"],
    [0x100, "0xfcbe86c7900a88aedcffc83b479aa3a4"],
    [0x200, "0xf987a7253ac413176f2b074cf7815e54"],
    [0x400, "0xf3392b0822b70005940c7a398e4b70f3"],
    [0x800, "0xe7159475a2c29b7443b29c7fa6e889d9"],
    [0x1000, "0xd097f3bdfd2022b8845ad8f792aa5825"],
    [0x2000, "0xa9f746462d870fdf8a65dc1f90e061e5"],
    [0x4000, "0x70d869a156d2a1b890bb3df62baf32f7"],
    [0x8000, "0x31be135f97d08fd981231505542fcfa6"],
    [0x10000, "0x9aa508b5b7a84e1c677de54f3e99bc9"],
    [0x20000, "0x5d6af8dedb81196699c329225ee604"],
    [0x40000, "0x2216e584f5fa1ea926041bedfe98"],
    [0x80000, "0x48a170391f7dc42444e8fa2"],
  ];

  for (const [bit, hex] of multipliers) {
    if ((absTick & bit) !== 0) {
      ratio = (ratio * BigInt(hex)) >> 128n;
    }
  }

  if (tick > 0) {
    ratio = (2n ** 256n - 1n) / ratio;
  }

  // Round up
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/**
 * Calculate token amounts for a given liquidity and price range.
 * Returns { amount0, amount1 } in raw units.
 */
function getAmountsForLiquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint
): { amount0: bigint; amount1: bigint } {
  const sqrtA = tickToSqrtPriceX96(tickLower);
  const sqrtB = tickToSqrtPriceX96(tickUpper);
  const Q96 = 1n << 96n;

  let amount0 = 0n;
  let amount1 = 0n;

  if (sqrtPriceX96 <= sqrtA) {
    amount0 = (liquidity * Q96 * (sqrtB - sqrtA)) / (sqrtA * sqrtB);
  } else if (sqrtPriceX96 < sqrtB) {
    amount0 = (liquidity * Q96 * (sqrtB - sqrtPriceX96)) / (sqrtPriceX96 * sqrtB);
    amount1 = (liquidity * (sqrtPriceX96 - sqrtA)) / Q96;
  } else {
    amount1 = (liquidity * (sqrtB - sqrtA)) / Q96;
  }

  return { amount0, amount1 };
}

// ============ Main class ============

export class V3PositionManager {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private npm: ethers.Contract;
  private onchainos: OnchainOSAdapter;
  readonly npmAddress: string;

  /**
   * The Agentic Wallet address that signs via OnchainOS TEE.
   * When set, `mintViaTEE()` routes the mint through `wallet contract-call`
   * so every LP operation is attributable to OnchainOS — the anti-gaming
   * requirement for the "Most Active On-Chain Agent" prize.
   */
  readonly agenticWalletAddress: string | null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    const pk = config.privateKey?.trim();
    if (!pk || !/^(0x)?[0-9a-fA-F]{64}$/.test(pk)) {
      throw new Error(
        "V3PositionManager requires PRIVATE_KEY in .env for signing LP transactions."
      );
    }
    this.wallet = new ethers.Wallet(pk, this.provider);

    this.npmAddress = config.uniswapV3.positionManager;
    this.npm = new ethers.Contract(this.npmAddress, NPM_ABI, this.wallet);

    // OnchainOS adapter for TEE-signed transactions
    this.onchainos = getOnchainOSAdapter({
      simulate: config.onchainos.simulate,
      cliPath: config.onchainos.cliPath,
    });
    this.agenticWalletAddress = config.onchainos.walletAddress || null;

    console.log(
      `[V3PositionManager] Initialized: wallet=${this.wallet.address}, NPM=${this.npmAddress}, ` +
      `agenticWallet=${this.agenticWalletAddress ?? "none (direct signing mode)"}`
    );
  }

  get agentAddress(): string {
    // If Agentic Wallet is configured, LP positions belong to it (TEE-signed).
    // Otherwise fall back to the PRIVATE_KEY wallet.
    return this.agenticWalletAddress ?? this.wallet.address;
  }

  // ============ Read ============

  /** Get all V3 NFT position IDs owned by the agent. */
  async getOwnedPositions(): Promise<number[]> {
    const balance = await this.npm.balanceOf(this.agentAddress);
    const count = Number(balance);
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const tokenId = await this.npm.tokenOfOwnerByIndex(this.agentAddress, i);
      ids.push(Number(tokenId));
    }
    return ids;
  }

  /** Get details of a specific position by NFT token ID. */
  async getPosition(tokenId: number): Promise<PositionDetail> {
    const pos = await this.npm.positions(tokenId);
    return {
      tokenId,
      token0: pos.token0,
      token1: pos.token1,
      fee: Number(pos.fee),
      tickLower: Number(pos.tickLower),
      tickUpper: Number(pos.tickUpper),
      liquidity: pos.liquidity,
      tokensOwed0: pos.tokensOwed0,
      tokensOwed1: pos.tokensOwed1,
    };
  }

  /** Get current pool state (tick, sqrtPrice, liquidity). */
  async getPoolState(poolAddress: string): Promise<{
    sqrtPriceX96: bigint;
    currentTick: number;
    tickSpacing: number;
    liquidity: bigint;
    token0: string;
    token1: string;
    fee: number;
  }> {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    const [slot0, token0, token1, fee, tickSpacing, liquidity] = await Promise.all([
      pool.slot0(),
      pool.token0(),
      pool.token1(),
      pool.fee(),
      pool.tickSpacing(),
      pool.liquidity(),
    ]);
    return {
      sqrtPriceX96: slot0.sqrtPriceX96,
      currentTick: Number(slot0.tick),
      tickSpacing: Number(tickSpacing),
      liquidity,
      token0,
      token1,
      fee: Number(fee),
    };
  }

  /** Get token balance of the agent wallet. */
  async getBalance(tokenAddress: string): Promise<{ balance: bigint; decimals: number; symbol: string }> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const [balance, decimals, symbol] = await Promise.all([
      token.balanceOf(this.agentAddress),
      token.decimals(),
      token.symbol(),
    ]);
    return { balance, decimals: Number(decimals), symbol };
  }

  // ============ Write ============

  /**
   * Approve a token for the NonfungiblePositionManager if needed.
   * Returns true if a new approval was sent.
   */
  async ensureApproval(tokenAddress: string, amount: bigint): Promise<boolean> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
    const currentAllowance: bigint = await token.allowance(this.agentAddress, this.npmAddress);

    if (currentAllowance >= amount) {
      console.log(`[V3PositionManager] Token ${tokenAddress} already approved (${currentAllowance} >= ${amount})`);
      return false;
    }

    // Approve max uint256 so we don't need to re-approve every time
    const maxApproval = 2n ** 256n - 1n;
    console.log(`[V3PositionManager] Approving ${tokenAddress} for NPM...`);
    const tx = await token.approve(this.npmAddress, maxApproval, { gasLimit: 100_000 });
    await tx.wait();
    console.log(`[V3PositionManager] Approved: ${tx.hash}`);
    return true;
  }

  /**
   * Mint a new V3 LP position.
   *
   * Flow:
   *   1. Ensure both tokens are approved for NPM
   *   2. Call NonfungiblePositionManager.mint()
   *   3. Return the new NFT tokenId + actual amounts deposited
   */
  async mint(params: MintParams): Promise<MintResult> {
    // Ensure approvals
    if (params.amount0Desired > 0n) {
      await this.ensureApproval(params.token0, params.amount0Desired);
    }
    if (params.amount1Desired > 0n) {
      await this.ensureApproval(params.token1, params.amount1Desired);
    }

    // Use amountMin = 0 for demo amounts to avoid "Price slippage check" reverts
    const amount0Min = 0n;
    const amount1Min = 0n;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

    console.log(`[V3PositionManager] Minting position:`);
    console.log(`  pool=${params.poolAddress}, fee=${params.fee}`);
    console.log(`  range=[${params.tickLower}, ${params.tickUpper}]`);
    console.log(`  amount0=${params.amount0Desired}, amount1=${params.amount1Desired}`);

    const mintParams = {
      token0: params.token0,
      token1: params.token1,
      fee: params.fee,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Desired: params.amount0Desired,
      amount1Desired: params.amount1Desired,
      amount0Min,
      amount1Min,
      recipient: this.agentAddress,
      deadline,
    };

    const tx = await this.npm.mint(mintParams, { gasLimit: 600_000 });
    const receipt = await tx.wait();

    // Parse the IncreaseLiquidity event (emitted by mint) to get results
    // Event signature: IncreaseLiquidity(uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    const iface = new ethers.Interface([
      "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ]);

    let tokenId = 0;
    let liquidity = 0n;
    let amount0 = 0n;
    let amount1 = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed?.name === "IncreaseLiquidity") {
          tokenId = Number(parsed.args.tokenId);
          liquidity = parsed.args.liquidity;
          amount0 = parsed.args.amount0;
          amount1 = parsed.args.amount1;
        }
      } catch {
        // skip non-matching logs
      }
    }

    // Fallback: parse Transfer event for tokenId if IncreaseLiquidity parsing failed
    if (tokenId === 0) {
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed?.name === "Transfer" && parsed.args.to.toLowerCase() === this.agentAddress.toLowerCase()) {
            tokenId = Number(parsed.args.tokenId);
          }
        } catch {
          // skip
        }
      }
    }

    console.log(`[V3PositionManager] Minted position #${tokenId}:`);
    console.log(`  liquidity=${liquidity}, amount0=${amount0}, amount1=${amount1}`);
    console.log(`  txHash=${receipt.hash}`);

    return { tokenId, liquidity, amount0, amount1, txHash: receipt.hash };
  }

  /**
   * Collect all accrued trading fees from a position.
   */
  async collectFees(tokenId: number): Promise<CollectResult> {
    const MAX_UINT128 = (1n << 128n) - 1n;

    console.log(`[V3PositionManager] Collecting fees for position #${tokenId}...`);

    const tx = await this.npm.collect(
      {
        tokenId,
        recipient: this.agentAddress,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
      },
      { gasLimit: 200_000 }
    );
    const receipt = await tx.wait();

    // Parse Collect event
    const iface = new ethers.Interface([
      "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
    ]);

    let amount0 = 0n;
    let amount1 = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed?.name === "Collect") {
          amount0 = parsed.args.amount0;
          amount1 = parsed.args.amount1;
        }
      } catch {
        // skip
      }
    }

    console.log(`[V3PositionManager] Collected fees: amount0=${amount0}, amount1=${amount1}, tx=${receipt.hash}`);
    return { amount0, amount1, txHash: receipt.hash };
  }

  /**
   * Remove all liquidity from a position.
   */
  async removeLiquidity(tokenId: number): Promise<RemoveLiquidityResult> {
    const position = await this.getPosition(tokenId);
    if (position.liquidity === 0n) {
      console.log(`[V3PositionManager] Position #${tokenId} has no liquidity to remove.`);
      return { amount0: 0n, amount1: 0n, txHash: "" };
    }

    console.log(`[V3PositionManager] Removing liquidity from position #${tokenId}: ${position.liquidity}...`);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const tx = await this.npm.decreaseLiquidity(
      {
        tokenId,
        liquidity: position.liquidity,
        amount0Min: 0n, // Accept any slippage for removal
        amount1Min: 0n,
        deadline,
      },
      { gasLimit: 300_000 }
    );
    const receipt = await tx.wait();

    // Parse DecreaseLiquidity event
    const iface = new ethers.Interface([
      "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
    ]);

    let amount0 = 0n;
    let amount1 = 0n;

    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed?.name === "DecreaseLiquidity") {
          amount0 = parsed.args.amount0;
          amount1 = parsed.args.amount1;
        }
      } catch {
        // skip
      }
    }

    console.log(`[V3PositionManager] Removed: amount0=${amount0}, amount1=${amount1}, tx=${receipt.hash}`);
    return { amount0, amount1, txHash: receipt.hash };
  }

  /**
   * Full rebalance: remove all liquidity + collect fees + mint new position.
   *
   * This is the core rebalance operation:
   *   1. decreaseLiquidity (remove all from old range)
   *   2. collect (sweep tokens + fees back to wallet)
   *   3. mint (new position at new range with all recovered tokens)
   */
  async rebalance(
    oldTokenId: number,
    newTickLower: number,
    newTickUpper: number,
    poolAddress: string,
  ): Promise<RebalanceResult> {
    const position = await this.getPosition(oldTokenId);
    const poolState = await this.getPoolState(poolAddress);

    console.log(`[V3PositionManager] Rebalancing position #${oldTokenId}:`);
    console.log(`  old range: [${position.tickLower}, ${position.tickUpper}]`);
    console.log(`  new range: [${newTickLower}, ${newTickUpper}]`);
    console.log(`  current tick: ${poolState.currentTick}`);

    // Step 1: Remove all liquidity
    const removeResult = await this.removeLiquidity(oldTokenId);

    // Step 2: Collect everything (removed tokens + any pending fees)
    const collectResult = await this.collectFees(oldTokenId);

    // The total tokens we have = removed + collected fees + existing wallet balance
    const token0 = new ethers.Contract(position.token0, ERC20_ABI, this.provider);
    const token1 = new ethers.Contract(position.token1, ERC20_ABI, this.provider);
    const [bal0, bal1] = await Promise.all([
      token0.balanceOf(this.agentAddress),
      token1.balanceOf(this.agentAddress),
    ]);

    console.log(`[V3PositionManager] Available for re-mint: token0=${bal0}, token1=${bal1}`);

    // Step 3: Mint new position with all available tokens
    const mintResult = await this.mint({
      poolAddress,
      token0: position.token0,
      token1: position.token1,
      fee: position.fee,
      tickLower: newTickLower,
      tickUpper: newTickUpper,
      amount0Desired: bal0,
      amount1Desired: bal1,
      slippageBps: 100, // 1% slippage for rebalance
    });

    return {
      oldTokenId,
      newTokenId: mintResult.tokenId,
      removedAmount0: removeResult.amount0,
      removedAmount1: removeResult.amount1,
      collectedFees0: collectResult.amount0,
      collectedFees1: collectResult.amount1,
      newLiquidity: mintResult.liquidity,
      newAmount0: mintResult.amount0,
      newAmount1: mintResult.amount1,
      txHash: mintResult.txHash,
    };
  }

  /**
   * Calculate optimal token amounts for a given USD value at current pool price.
   *
   * For a V3 LP position at range [tickLower, tickUpper], the ratio of
   * token0/token1 depends on where the current price is relative to the range.
   * This computes the correct split.
   */
  async calculateOptimalAmounts(
    poolAddress: string,
    tickLower: number,
    tickUpper: number,
    totalUSDValue: number,
  ): Promise<{
    amount0: bigint;
    amount1: bigint;
    token0Decimals: number;
    token1Decimals: number;
    currentPrice: number;
    token0Share: number;
    token1Share: number;
  }> {
    const poolState = await this.getPoolState(poolAddress);
    const { sqrtPriceX96, currentTick } = poolState;

    const token0Contract = new ethers.Contract(poolState.token0, ERC20_ABI, this.provider);
    const token1Contract = new ethers.Contract(poolState.token1, ERC20_ABI, this.provider);
    const [dec0, dec1] = await Promise.all([
      token0Contract.decimals().then(Number),
      token1Contract.decimals().then(Number),
    ]);

    // Current price of token0 in terms of token1
    const Q96 = 2 ** 96;
    const sqrtPrice = Number(sqrtPriceX96) / Q96;
    const price = sqrtPrice * sqrtPrice * (10 ** dec0) / (10 ** dec1);

    // Determine token ratio based on tick position relative to range
    let token0Share: number;
    let token1Share: number;

    if (currentTick < tickLower) {
      // Price below range: need 100% token0
      token0Share = 1.0;
      token1Share = 0.0;
    } else if (currentTick >= tickUpper) {
      // Price above range: need 100% token1
      token0Share = 0.0;
      token1Share = 1.0;
    } else {
      // Price within range: compute the ratio using sqrtPrice ratios
      const sqrtA = Math.pow(1.0001, tickLower / 2);
      const sqrtB = Math.pow(1.0001, tickUpper / 2);
      const sqrtP = Math.pow(1.0001, currentTick / 2);

      // For a unit of liquidity, amount0 = L * (1/sqrtP - 1/sqrtB), amount1 = L * (sqrtP - sqrtA)
      const unitAmount0 = (1 / sqrtP - 1 / sqrtB);
      const unitAmount1 = (sqrtP - sqrtA);

      // Value in token1 terms
      const value0InToken1 = unitAmount0 * price * (10 ** dec1) / (10 ** dec0);
      const value1InToken1 = unitAmount1;
      const totalValueInToken1 = value0InToken1 + value1InToken1;

      if (totalValueInToken1 > 0) {
        token0Share = value0InToken1 / totalValueInToken1;
        token1Share = value1InToken1 / totalValueInToken1;
      } else {
        token0Share = 0.5;
        token1Share = 0.5;
      }
    }

    // For USDT/WOKB pool: token0 = USDT (6 decimals, ~$1), token1 = WOKB (18 decimals)
    // totalUSDValue is in USD; we need to split by share
    const usdForToken0 = totalUSDValue * token0Share;
    const usdForToken1 = totalUSDValue * token1Share;

    // token0 amount (if USDT, 1 token ≈ $1)
    const amount0 = BigInt(Math.floor(usdForToken0 * (10 ** dec0)));

    // token1 amount (need to convert USD to token1 using price)
    // price = token0_per_token1, so token1_per_usd = 1/price (if token0 is USDT)
    const token1PerUsd = 1 / price;
    const amount1 = BigInt(Math.floor(usdForToken1 * token1PerUsd * (10 ** dec1)));

    console.log(`[V3PositionManager] Optimal amounts for $${totalUSDValue}:`);
    console.log(`  token0 (${token0Share.toFixed(2)}): ${amount0} (${dec0} dec)`);
    console.log(`  token1 (${token1Share.toFixed(2)}): ${amount1} (${dec1} dec)`);
    console.log(`  current price: ${price.toFixed(6)} token0/token1`);

    return {
      amount0,
      amount1,
      token0Decimals: dec0,
      token1Decimals: dec1,
      currentPrice: price,
      token0Share,
      token1Share,
    };
  }

  /**
   * Build a "deploy LP" flow that:
   *   1. Reads pool state
   *   2. Computes tick range from PoolBrain recommendations
   *   3. Calculates optimal token split
   *   4. Approves + mints
   *
   * Returns the mint result or null if wallet has insufficient funds.
   */
  async deployLP(
    poolAddress: string,
    tickLower: number,
    tickUpper: number,
    principalUSD: number,
    onProgress?: (msg: string) => void,
  ): Promise<MintResult | null> {
    const poolState = await this.getPoolState(poolAddress);
    const spacing = poolState.tickSpacing;

    // Align ticks to spacing
    const alignedLower = alignTick(tickLower, spacing);
    const alignedUpper = alignTick(tickUpper + spacing - 1, spacing); // round up

    onProgress?.(`Pool tick=${poolState.currentTick}, range=[${alignedLower}, ${alignedUpper}]`);

    // Calculate optimal amounts
    const optimal = await this.calculateOptimalAmounts(
      poolAddress,
      alignedLower,
      alignedUpper,
      principalUSD,
    );

    onProgress?.(`Need token0=${optimal.amount0} (${optimal.token0Share.toFixed(0)}%), token1=${optimal.amount1} (${optimal.token1Share.toFixed(0)}%)`);

    // Check balances
    const [info0, info1] = await Promise.all([
      this.getBalance(poolState.token0),
      this.getBalance(poolState.token1),
    ]);

    onProgress?.(`Wallet: ${info0.symbol}=${ethers.formatUnits(info0.balance, info0.decimals)}, ${info1.symbol}=${ethers.formatUnits(info1.balance, info1.decimals)}`);

    // Use the smaller of desired vs available
    const amount0 = optimal.amount0 < info0.balance ? optimal.amount0 : info0.balance;
    const amount1 = optimal.amount1 < info1.balance ? optimal.amount1 : info1.balance;

    if (amount0 === 0n && amount1 === 0n) {
      console.error("[V3PositionManager] Insufficient funds — both token balances are 0");
      return null;
    }

    onProgress?.(`Minting with amount0=${amount0}, amount1=${amount1}...`);

    // Mint! Use wide slippage for small amounts
    const result = await this.mint({
      poolAddress,
      token0: poolState.token0,
      token1: poolState.token1,
      fee: poolState.fee,
      tickLower: alignedLower,
      tickUpper: alignedUpper,
      amount0Desired: amount0,
      amount1Desired: amount1,
      slippageBps: 1000,
    });

    onProgress?.(`Minted LP #${result.tokenId} with ${result.liquidity} liquidity`);
    return result;
  }

  // ============ OnchainOS TEE-signed operations ============
  //
  // These methods encode calldata and route it through `onchainos wallet
  // contract-call` so the tx is signed inside the Agentic Wallet's TEE.
  // Every LP action via these methods is attributable to OnchainOS.

  /** ABI interface for encoding calldata (read-only, no signer needed) */
  private get npmIface(): ethers.Interface {
    return new ethers.Interface(NPM_ABI);
  }

  private get erc20Iface(): ethers.Interface {
    return new ethers.Interface(ERC20_ABI);
  }

  /**
   * Approve a token for NPM via OnchainOS TEE.
   * The tx is signed by the Agentic Wallet, not the local private key.
   */
  async approveViaTEE(tokenAddress: string): Promise<string> {
    const calldata = this.erc20Iface.encodeFunctionData("approve", [
      this.npmAddress,
      ethers.MaxUint256,
    ]);

    console.log(`[V3PositionManager] TEE-approving ${tokenAddress} for NPM...`);
    const txHash = await this.onchainos.contractCall({
      to: tokenAddress,
      chain: config.chainId,
      inputData: calldata,
      gasLimit: 100_000,
      from: this.agenticWalletAddress ?? undefined,
    });
    console.log(`[V3PositionManager] TEE-approved: ${txHash}`);
    return txHash;
  }

  /**
   * Mint a V3 LP position via OnchainOS TEE.
   *
   * This is the core anti-gaming path: the NonfungiblePositionManager.mint()
   * calldata is encoded locally, then broadcast via `onchainos wallet
   * contract-call`. The resulting tx hash is signed by the Agentic Wallet's
   * TEE signer (0x6ab2...), proving the agent used OnchainOS.
   *
   * The LP NFT will be owned by the Agentic Wallet address.
   */
  async mintViaTEE(params: MintParams): Promise<{ txHash: string; tokenId: number }> {
    // TEE signing adds several seconds of latency. For demo amounts we set
    // amountMin = 0 to avoid "Price slippage check" reverts from ratio drift
    // between calculation and TEE broadcast. Production would use tighter bounds.
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    const recipient = this.agenticWalletAddress ?? this.wallet.address;

    // Step 1: Ensure approvals via TEE
    if (params.amount0Desired > 0n) {
      const token0 = new ethers.Contract(params.token0, ERC20_ABI, this.provider);
      const allowance: bigint = await token0.allowance(recipient, this.npmAddress);
      if (allowance < params.amount0Desired) {
        await this.approveViaTEE(params.token0);
      }
    }
    if (params.amount1Desired > 0n) {
      const token1 = new ethers.Contract(params.token1, ERC20_ABI, this.provider);
      const allowance: bigint = await token1.allowance(recipient, this.npmAddress);
      if (allowance < params.amount1Desired) {
        await this.approveViaTEE(params.token1);
      }
    }

    // Step 2: Encode mint calldata — amount*Min = 0 for TEE latency tolerance
    const mintCalldata = this.npmIface.encodeFunctionData("mint", [{
      token0: params.token0,
      token1: params.token1,
      fee: params.fee,
      tickLower: params.tickLower,
      tickUpper: params.tickUpper,
      amount0Desired: params.amount0Desired,
      amount1Desired: params.amount1Desired,
      amount0Min: 0,
      amount1Min: 0,
      recipient,
      deadline,
    }]);

    console.log(`[V3PositionManager] TEE-minting: range=[${params.tickLower},${params.tickUpper}], amt0=${params.amount0Desired}, amt1=${params.amount1Desired}`);

    // Step 3: Send via OnchainOS contract-call
    const txHash = await this.onchainos.contractCall({
      to: this.npmAddress,
      chain: config.chainId,
      inputData: mintCalldata,
      gasLimit: 600_000,
      from: this.agenticWalletAddress ?? undefined,
    });

    console.log(`[V3PositionManager] TEE-mint tx: ${txHash}`);

    // Step 4: Parse tx receipt to get tokenId
    let tokenId = 0;
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (receipt) {
        const iface = new ethers.Interface([
          "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
        ]);
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed?.name === "IncreaseLiquidity") {
              tokenId = Number(parsed.args.tokenId);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: any) {
      console.warn(`[V3PositionManager] Could not parse mint receipt: ${err?.message}`);
    }

    return { txHash, tokenId };
  }

  /**
   * Collect V3 fees via OnchainOS TEE.
   */
  async collectViaTEE(tokenId: number): Promise<{ txHash: string }> {
    const MAX_UINT128 = (1n << 128n) - 1n;
    const recipient = this.agenticWalletAddress ?? this.wallet.address;

    const calldata = this.npmIface.encodeFunctionData("collect", [{
      tokenId,
      recipient,
      amount0Max: MAX_UINT128,
      amount1Max: MAX_UINT128,
    }]);

    console.log(`[V3PositionManager] TEE-collecting fees for NFT #${tokenId}...`);
    const txHash = await this.onchainos.contractCall({
      to: this.npmAddress,
      chain: config.chainId,
      inputData: calldata,
      gasLimit: 200_000,
      from: this.agenticWalletAddress ?? undefined,
    });

    console.log(`[V3PositionManager] TEE-collected: ${txHash}`);
    return { txHash };
  }

  /**
   * Remove liquidity via OnchainOS TEE.
   */
  async decreaseLiquidityViaTEE(tokenId: number, liquidity: bigint): Promise<{ txHash: string }> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    const calldata = this.npmIface.encodeFunctionData("decreaseLiquidity", [{
      tokenId,
      liquidity,
      amount0Min: 0n,
      amount1Min: 0n,
      deadline,
    }]);

    console.log(`[V3PositionManager] TEE-decreasing liquidity for NFT #${tokenId}: ${liquidity}...`);
    const txHash = await this.onchainos.contractCall({
      to: this.npmAddress,
      chain: config.chainId,
      inputData: calldata,
      gasLimit: 300_000,
      from: this.agenticWalletAddress ?? undefined,
    });

    console.log(`[V3PositionManager] TEE-decreased: ${txHash}`);
    return { txHash };
  }

  /**
   * Full deploy LP flow via OnchainOS TEE.
   *
   * Same logic as `deployLP` but every tx (approve + mint) goes through
   * `onchainos wallet contract-call` → signed in TEE → attributable to
   * OnchainOS Agentic Wallet.
   */
  async deployLPViaTEE(
    poolAddress: string,
    tickLower: number,
    tickUpper: number,
    principalUSD: number,
    onProgress?: (msg: string) => void,
  ): Promise<{ txHash: string; tokenId: number } | null> {
    const walletAddr = this.agenticWalletAddress;
    if (!walletAddr) {
      console.warn("[V3PositionManager] No Agentic Wallet address — cannot use TEE path");
      return null;
    }

    const poolState = await this.getPoolState(poolAddress);
    const spacing = poolState.tickSpacing;

    const alignedLower = alignTick(tickLower, spacing);
    const alignedUpper = alignTick(tickUpper + spacing - 1, spacing);

    onProgress?.(`[TEE] Pool tick=${poolState.currentTick}, range=[${alignedLower}, ${alignedUpper}]`);

    // Calculate optimal amounts
    const optimal = await this.calculateOptimalAmounts(
      poolAddress, alignedLower, alignedUpper, principalUSD,
    );

    // Check Agentic Wallet balances
    const token0 = new ethers.Contract(poolState.token0, ERC20_ABI, this.provider);
    const token1 = new ethers.Contract(poolState.token1, ERC20_ABI, this.provider);
    const [bal0, bal1] = await Promise.all([
      token0.balanceOf(walletAddr),
      token1.balanceOf(walletAddr),
    ]);

    onProgress?.(`[TEE] Agentic Wallet balance: token0=${bal0}, token1=${bal1}`);

    const amount0 = optimal.amount0 < bal0 ? optimal.amount0 : bal0;
    const amount1 = optimal.amount1 < bal1 ? optimal.amount1 : bal1;

    if (amount0 === 0n && amount1 === 0n) {
      console.error("[V3PositionManager] Agentic Wallet has no tokens for LP");
      onProgress?.(`[TEE] Insufficient funds in Agentic Wallet (${walletAddr})`);
      return null;
    }

    onProgress?.(`[TEE] Minting via OnchainOS contract-call: amt0=${amount0}, amt1=${amount1}...`);

    // Mint via TEE! Use wide slippage (10%) because TEE signing adds latency
    // and small demo amounts are especially sensitive to ratio drift.
    const result = await this.mintViaTEE({
      poolAddress,
      token0: poolState.token0,
      token1: poolState.token1,
      fee: poolState.fee,
      tickLower: alignedLower,
      tickUpper: alignedUpper,
      amount0Desired: amount0,
      amount1Desired: amount1,
      slippageBps: 1000,
    });

    onProgress?.(`[TEE] LP minted via OnchainOS! tokenId=${result.tokenId}, tx=${result.txHash}`);
    return result;
  }
}

// Singleton
let _instance: V3PositionManager | null = null;

export function getV3PositionManager(): V3PositionManager {
  if (!_instance) {
    _instance = new V3PositionManager();
  }
  return _instance;
}
