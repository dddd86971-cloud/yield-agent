import { ethers } from "ethers";
import { config } from "../config";

// Minimal ABIs — v2 StrategyManager is a slim audit/registry contract.
// Real LP execution happens off-chain via OnchainOS `defi` CLI.
const STRATEGY_MANAGER_ABI = [
  "function deployStrategy(address pool, address token0, address token1, uint24 fee, tuple(int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired)[] positions, uint8 riskProfile, string thesis) external returns (uint256)",
  "function rebalance(uint256 strategyId, tuple(int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired)[] newPositions, string reasoning, uint8 confidence) external",
  "function compoundFees(uint256 strategyId, string reasoning, uint8 confidence) external",
  "function emergencyExit(uint256 strategyId, string reasoning) external",
  "function logHold(uint256 strategyId, string reasoning, uint8 confidence) external",
  "function recordExecution(uint256 strategyId, uint8 action, int24 tickLower, int24 tickUpper, bytes32 txHash, string externalId) external",
  "function getStrategy(uint256 strategyId) external view returns (tuple(address agent, address owner, address pool, address token0, address token1, uint24 fee, uint256[] positionIds, uint256 totalDeposited, uint256 createdAt, bool active, uint8 riskProfile))",
  "function getExecutions(uint256 strategyId) external view returns (tuple(uint256 timestamp, uint8 action, int24 tickLower, int24 tickUpper, bytes32 txHash, string externalId)[])",
  "function getExecutionCount(uint256 strategyId) external view returns (uint256)",
  "function nextStrategyId() external view returns (uint256)",
  "function isAgent(address addr) external view returns (bool)",
  "event StrategyDeployed(uint256 indexed strategyId, address indexed agent, address indexed owner, address pool, uint8 riskProfile)",
  "event StrategyRebalanced(uint256 indexed strategyId, int24 newTickLower, int24 newTickUpper, uint8 confidence)",
  "event StrategyExited(uint256 indexed strategyId, string reasoning)",
  "event ExecutionRecorded(uint256 indexed strategyId, uint8 action, bytes32 txHash, string externalId)",
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

export interface DeployParams {
  poolAddress: string;
  token0: string;
  token1: string;
  fee: number; // 100 / 500 / 3000 / 10000
  positions: Array<{
    tickLower: number;
    tickUpper: number;
    amount0: bigint;
    amount1: bigint;
  }>;
  riskProfile: number; // 0=conservative, 1=moderate, 2=aggressive
  thesis: string;
}

export interface RecordExecutionParams {
  strategyId: number;
  action: number; // 0=DEPLOY, 1=REBALANCE, 2=COMPOUND, 3=EMERGENCY_EXIT, 4=HOLD
  tickLower: number;
  tickUpper: number;
  txHash: string; // OnchainOS on-chain tx hash (0x-prefixed 32 bytes)
  externalId: string; // OnchainOS investment/position id
}

export interface RebalanceParams {
  strategyId: number;
  newPositions: Array<{
    tickLower: number;
    tickUpper: number;
    amount0: bigint;
    amount1: bigint;
  }>;
  reasoning: string;
  confidence: number;
}

export interface StrategyInfo {
  agent: string;
  owner: string;
  pool: string;
  token0: string;
  token1: string;
  fee: number;
  positionIds: bigint[];
  totalDeposited: bigint;
  createdAt: number;
  active: boolean;
  riskProfile: number;
}

export interface PositionInfo {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

export class ExecutionEngine {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet | null;
  private strategyManager: ethers.Contract;
  readonly readOnly: boolean;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    // Allow read-only mode when no private key is configured (demo / dashboard
    // viewing without execution privileges).
    const pk = config.privateKey?.trim();
    if (pk && /^(0x)?[0-9a-fA-F]{64}$/.test(pk)) {
      this.wallet = new ethers.Wallet(pk, this.provider);
      this.readOnly = false;
    } else {
      this.wallet = null;
      this.readOnly = true;
      console.warn(
        "[ExecutionEngine] PRIVATE_KEY not set or invalid — running in READ-ONLY mode (no on-chain writes)."
      );
    }

    const signerOrProvider = this.wallet ?? this.provider;
    this.strategyManager = new ethers.Contract(
      config.strategyManager || ethers.ZeroAddress,
      STRATEGY_MANAGER_ABI,
      signerOrProvider
    );
  }

  private requireSigner(): ethers.Wallet {
    if (!this.wallet) {
      throw new Error(
        "ExecutionEngine is in read-only mode: set PRIVATE_KEY in .env to enable on-chain writes."
      );
    }
    return this.wallet;
  }

  get agentAddress(): string {
    return this.wallet?.address ?? ethers.ZeroAddress;
  }

  // ============ Read Operations ============

  async getStrategy(strategyId: number): Promise<StrategyInfo> {
    const s = await this.strategyManager.getStrategy(strategyId);
    return {
      agent: s.agent,
      owner: s.owner,
      pool: s.pool,
      token0: s.token0,
      token1: s.token1,
      fee: Number(s.fee),
      positionIds: s.positionIds,
      totalDeposited: s.totalDeposited,
      createdAt: Number(s.createdAt),
      active: s.active,
      riskProfile: Number(s.riskProfile),
    };
  }

  /**
   * v2: LP position info is tracked by OnchainOS, not by StrategyManager.
   * This reads the latest execution record as a proxy for current range.
   */
  async getPositionInfo(strategyId: number): Promise<PositionInfo | null> {
    try {
      const execs = await this.strategyManager.getExecutions(strategyId);
      if (!execs || execs.length === 0) return null;
      const last = execs[execs.length - 1];
      return {
        tickLower: Number(last.tickLower),
        tickUpper: Number(last.tickUpper),
        liquidity: 0n,
        tokensOwed0: 0n,
        tokensOwed1: 0n,
      };
    } catch {
      return null;
    }
  }

  /**
   * v2: Read current tick directly from the pool via JSON-RPC if the pool
   * exists on-chain. Returns 0 if the pool contract isn't present (e.g., in
   * OnchainOS-only deployments).
   */
  async getCurrentTick(poolAddress: string): Promise<number> {
    if (!poolAddress || poolAddress === ethers.ZeroAddress) return 0;
    try {
      const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
      const slot0 = await pool.slot0();
      return Number(slot0.tick);
    } catch {
      return 0;
    }
  }

  async getPoolInfo(poolAddress: string) {
    if (!poolAddress || poolAddress === ethers.ZeroAddress) {
      return null;
    }
    try {
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
        token0,
        token1,
        fee: Number(fee),
        tickSpacing: Number(tickSpacing),
        liquidity,
      };
    } catch {
      return null;
    }
  }

  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    return token.balanceOf(this.agentAddress);
  }

  async getTokenDecimals(tokenAddress: string): Promise<number> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    return Number(await token.decimals());
  }

  async getStrategyCount(): Promise<number> {
    return Number(await this.strategyManager.nextStrategyId());
  }

  async getAgentOKBBalance(): Promise<bigint> {
    return this.provider.getBalance(this.agentAddress);
  }

  // ============ Write Operations ============
  //
  // v2 NOTE: The contract no longer holds tokens. Token approvals are not
  // needed — the agent's Agentic Wallet executes positions via the OnchainOS
  // `defi` CLI, and then calls `recordExecution()` to anchor the tx hash on
  // chain. These helpers are all thin audit-layer writes.

  async deployStrategy(params: DeployParams): Promise<{ strategyId: number; txHash: string }> {
    const positions = params.positions.map((p) => ({
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      amount0Desired: p.amount0,
      amount1Desired: p.amount1,
    }));

    const tx = await this.strategyManager.deployStrategy(
      params.poolAddress,
      params.token0,
      params.token1,
      params.fee,
      positions,
      params.riskProfile,
      params.thesis,
      { gasLimit: 800_000 }
    );

    const receipt = await tx.wait();

    // Parse StrategyDeployed event to get strategyId
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.strategyManager.interface.parseLog(log);
        return parsed?.name === "StrategyDeployed";
      } catch {
        return false;
      }
    });

    let strategyId = 0;
    if (event) {
      const parsed = this.strategyManager.interface.parseLog(event);
      strategyId = Number(parsed?.args?.strategyId || 0);
    }

    return { strategyId, txHash: receipt.hash };
  }

  async rebalance(params: RebalanceParams): Promise<string> {
    const newPositions = params.newPositions.map((p) => ({
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      amount0Desired: p.amount0,
      amount1Desired: p.amount1,
    }));

    const tx = await this.strategyManager.rebalance(
      params.strategyId,
      newPositions,
      params.reasoning,
      params.confidence,
      { gasLimit: 600_000 }
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  async compoundFees(strategyId: number, reasoning: string, confidence: number): Promise<string> {
    const tx = await this.strategyManager.compoundFees(
      strategyId,
      reasoning,
      confidence,
      { gasLimit: 300_000 }
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async emergencyExit(strategyId: number, reasoning: string): Promise<string> {
    const tx = await this.strategyManager.emergencyExit(
      strategyId,
      reasoning,
      { gasLimit: 300_000 }
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async logHold(strategyId: number, reasoning: string, confidence: number): Promise<string> {
    const tx = await this.strategyManager.logHold(
      strategyId,
      reasoning,
      confidence,
      { gasLimit: 300_000 }
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Record an OnchainOS execution (after `onchainos defi invest/withdraw/collect`
   * returns a signed tx hash). This is the glue between off-chain execution
   * and on-chain audit trail.
   */
  async recordExecution(params: RecordExecutionParams): Promise<string> {
    const tx = await this.strategyManager.recordExecution(
      params.strategyId,
      params.action,
      params.tickLower,
      params.tickUpper,
      params.txHash,
      params.externalId,
      { gasLimit: 250_000 }
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }
}
