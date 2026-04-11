/**
 * OnchainOSAdapter
 * =================
 *
 * Wraps the `onchainos` CLI (v2.2.7+) so the Node backend can drive DEX
 * operations through OnchainOS's Agentic Wallet from TypeScript.
 *
 * WHY CLI SPAWN (not REST): OnchainOS's REST API requires HMAC-SHA256 header
 * signing with OKX_ACCESS_KEY + OKX_SECRET_KEY + OKX_PASSPHRASE, plus a
 * TEE-backed signing session inside an Agentic Wallet account. The CLI
 * handles all of that end-to-end and persists the session cert under
 * ~/.onchainos/. Re-implementing that in JS would mean re-doing auth, TEE
 * coordination, and the defi invest orchestration — all of which the CLI
 * already does. Spawn is honest: every tx that counts toward the "Most
 * Active On-Chain Agent" prize is visibly a `onchainos wallet contract-call`
 * invocation, not a direct eth_sendRawTransaction.
 *
 * PREREQUISITES (operator, one-time):
 *   1. Install CLI:
 *      curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
 *   2. Set env in .env:
 *      OKX_ACCESS_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE
 *   3. Log in:
 *      onchainos wallet login --force
 *   4. Verify:
 *      onchainos wallet status   → { loggedIn: true }
 *
 * The adapter assumes the CLI is installed and logged in. If not, every
 * method throws `OnchainOSNotLoggedInError` with a remediation message.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// =============================================================================
// Types
// =============================================================================

export interface InvestParams {
  /** Investment ID returned by `defi search`. */
  investmentId: string;
  /** Agent wallet address (0x…). */
  address: string;
  /** Token symbol or contract address of the first (primary) token. */
  token: string;
  /** Amount of the first token in minimal units (bigint-safe string). */
  amount: string;
  /** Optional second token symbol/address for V3 dual-token entry. */
  token2?: string;
  /** Optional second token amount in minimal units. */
  amount2?: string;
  /** Chain name (e.g. "xlayer") or numeric id. Defaults to xlayer. */
  chain?: string;
  /** Slippage tolerance string; default "0.01" = 1 %. */
  slippage?: string;
  /** V3 new position lower tick. Use this + tickUpper OR range, not both. */
  tickLower?: number;
  /** V3 new position upper tick. */
  tickUpper?: number;
  /** Alternative to ticks: "5" means ±5 % around current price. */
  range?: number;
  /** Add to existing V3 position by NFT tokenId (mutex with ticks/range). */
  tokenId?: string;
}

export interface WithdrawParams {
  investmentId: string;
  address: string;
  /** Chain name (e.g. "xlayer") or numeric id. */
  chain: string;
  platformId?: string;
  /** V3 NFT tokenId. */
  tokenId?: string;
  /** "1" for full exit, "0.5" for 50 %, etc. */
  ratio?: string;
  /** Alternative: partial exit amount in minimal units. */
  amount?: string;
  slippage?: string;
}

export type RewardType =
  | "REWARD_PLATFORM"
  | "REWARD_INVESTMENT"
  | "V3_FEE"
  | "REWARD_OKX_BONUS"
  | "REWARD_MERKLE_BONUS"
  | "UNLOCKED_PRINCIPAL";

export interface CollectParams {
  address: string;
  chain: string;
  rewardType: RewardType;
  investmentId?: string;
  platformId?: string;
  /** Required for V3_FEE collection. */
  tokenId?: string;
  principalIndex?: string;
}

export interface ContractCallParams {
  /** Target contract address. */
  to: string;
  /** Numeric chain id (196 for X Layer mainnet, 1952 for testnet). */
  chain: number;
  /** Hex calldata (0x-prefixed). */
  inputData: string;
  /**
   * Native token amount attached to the call, in MINIMAL UNITS
   * (whole number, no decimals). Default "0" for non-payable functions.
   */
  amt?: string;
  /** Gas limit override (EVM only). */
  gasLimit?: number;
  /** Enable MEV protection (Ethereum/BSC/Base/Solana only). */
  mevProtection?: boolean;
  /** Optional sender override. Defaults to CLI's selected account. */
  from?: string;
}

/**
 * Parameters for `onchainos swap execute` — one-shot DEX swap via OKX DEX
 * aggregator. This is YieldAgent's PRIMARY on-chain action path: quote →
 * approve (if needed) → swap → sign inside Agentic Wallet TEE → broadcast.
 * The resulting tx is fully attributable to OnchainOS (anti-gaming rule for
 * the Most Active On-Chain Agent prize).
 */
export interface SwapParams {
  /** Source token contract address (use 0xeee…eee for native OKB/ETH). */
  fromToken: string;
  /** Destination token contract address. */
  toToken: string;
  /** Wallet that signs the swap (must match the Agentic Wallet account). */
  wallet: string;
  /** Chain name (e.g. "xlayer") or numeric id; defaults to X Layer mainnet. */
  chain?: string;
  /** Human-readable amount (e.g. "0.12" for 0.12 OKB). CLI fetches decimals. */
  readableAmount?: string;
  /**
   * Amount in minimal units as a string. Mutually exclusive with
   * readableAmount. Use this when the caller already knows raw wei.
   */
  amount?: string;
  /** Slippage in percent (e.g. "0.5" for 0.5 %). Defaults to autoSlippage. */
  slippage?: string;
  /** Gas priority (slow/average/fast). */
  gasLevel?: "slow" | "average" | "fast";
  /** exactIn (default) or exactOut. */
  swapMode?: "exactIn" | "exactOut";
  /** Enable MEV protection (only supported on ETH/BSC/Base/Solana). */
  mevProtection?: boolean;
}

export interface SwapResult {
  /** Main swap tx hash — the one we record in the audit contracts. */
  swapTxHash: string;
  /** Approve tx hash if the CLI had to set allowance first; null otherwise. */
  approveTxHash: string | null;
  /** Amount actually consumed from `fromToken`, in minimal units. */
  fromAmount: string;
  /** Amount received in `toToken`, in minimal units. */
  toAmount: string;
  /** Source token metadata (decimal, symbol, unit price in USD). */
  fromToken: {
    address: string;
    symbol: string;
    decimal: string;
    unitPriceUsd: string;
  };
  /** Destination token metadata. */
  toToken: {
    address: string;
    symbol: string;
    decimal: string;
    unitPriceUsd: string;
  };
  /** Price impact as a percent string (e.g. "-0.01" = −0.01 %). */
  priceImpact: string;
  /** Gas used by the swap tx (decimal string). */
  gasUsed: string;
}

export interface InvestResult {
  /** Final on-chain tx hash — the one to anchor in StrategyManager. */
  txHash: string;
  /** All intermediate tx hashes (APPROVE, DEPOSIT…). */
  stepTxHashes: string[];
  /** OnchainOS investment id (for audit trail cross-reference). */
  externalId: string;
  /** Number of steps executed. */
  dataListSize: number;
}

export interface WalletStatus {
  loggedIn: boolean;
  accountId: string | null;
  accountName: string | null;
  email: string | null;
  loginType: "email" | "ak" | null;
}

// =============================================================================
// Errors
// =============================================================================

export class OnchainOSError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly cliOutput?: string,
  ) {
    super(message);
    this.name = "OnchainOSError";
  }
}

export class OnchainOSNotLoggedInError extends OnchainOSError {
  constructor() {
    super(
      "OnchainOS CLI is not logged in. Set OKX_ACCESS_KEY / OKX_SECRET_KEY / " +
        "OKX_PASSPHRASE in .env, then run `onchainos wallet login --force` once.",
    );
    this.name = "OnchainOSNotLoggedInError";
  }
}

// =============================================================================
// Adapter
// =============================================================================

export interface OnchainOSAdapterOptions {
  /** Path to the onchainos binary. Default: "onchainos" (on PATH). */
  cliPath?: string;
  /** Per-CLI-call timeout in milliseconds. Default 120_000 (2 min). */
  timeoutMs?: number;
  /**
   * If true, methods return mocked responses instead of spawning the CLI.
   * Use for frontend demos and CI where there's no OnchainOS session.
   */
  simulate?: boolean;
  /**
   * If true, auto-retry "confirming" responses (exit code 2) with --force.
   * Required for autonomous operation; the operator explicitly consented by
   * running the agent. Default true.
   */
  autoConfirm?: boolean;
}

interface DataListStep {
  to: string;
  serializedData: string;
  value?: string;
  [k: string]: unknown;
}

export class OnchainOSAdapter {
  private readonly cliPath: string;
  private readonly timeoutMs: number;
  private readonly simulate: boolean;
  private readonly autoConfirm: boolean;

  // Simple 60 s cache on wallet status to avoid hammering the CLI.
  private lastStatus: { at: number; value: WalletStatus } | null = null;

  constructor(opts: OnchainOSAdapterOptions = {}) {
    this.cliPath = opts.cliPath ?? "onchainos";
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.simulate = opts.simulate ?? false;
    this.autoConfirm = opts.autoConfirm ?? true;
  }

  // ---------------------------------------------------------------------------
  // Spawn helpers
  // ---------------------------------------------------------------------------

  /**
   * Spawn `onchainos <args>`, parse stdout as JSON, return the `data` field
   * (or the whole payload if it has no `data` wrapper). Throws on non-zero
   * exit or `ok: false`.
   *
   * Handles the "confirming" exit-code-2 pattern by retrying with --force
   * when `autoConfirm` is enabled and the command supports --force.
   */
  private async runCli(
    args: string[],
    ctx: string,
    opts: { allowForceRetry?: boolean } = {},
  ): Promise<any> {
    // Redact anything that looks like a long hex blob or UUID in logs so we
    // don't leak calldata or ids that an auditor could correlate.
    const redacted = args.map((a) =>
      a.length > 40 && /^(0x)?[0-9a-f-]+$/i.test(a) ? a.slice(0, 10) + "…" : a,
    );
    console.log(`[onchainos] ${this.cliPath} ${redacted.join(" ")}`);

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    try {
      const result = await execFileAsync(this.cliPath, args, {
        timeout: this.timeoutMs,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: any) {
      stdout = err?.stdout?.toString?.() ?? "";
      stderr = err?.stderr?.toString?.() ?? "";
      exitCode = err?.code ?? 1;

      // Exit code 2 = backend asked for confirmation. Retry with --force if
      // we're in autoConfirm mode and the command supports it.
      if (
        exitCode === 2 &&
        this.autoConfirm &&
        opts.allowForceRetry &&
        !args.includes("--force")
      ) {
        console.log(`[onchainos] ${ctx} → confirming; retrying with --force`);
        return this.runCli([...args, "--force"], ctx, { allowForceRetry: false });
      }
    }

    let parsed: any = null;
    try {
      parsed = stdout ? JSON.parse(stdout) : null;
    } catch {
      throw new OnchainOSError(
        `${ctx}: CLI returned non-JSON output (exit ${exitCode})`,
        exitCode,
        stdout || stderr,
      );
    }

    if (exitCode !== 0 && exitCode !== 2) {
      const msg = parsed?.error || parsed?.message || stderr || `exit ${exitCode}`;
      if (
        stderr.toLowerCase().includes("not logged in") ||
        stderr.toLowerCase().includes("loggedin: false") ||
        msg.toLowerCase().includes("login")
      ) {
        throw new OnchainOSNotLoggedInError();
      }
      throw new OnchainOSError(`${ctx}: ${msg}`, exitCode, stdout || stderr);
    }

    if (parsed?.ok === false || parsed?.error) {
      throw new OnchainOSError(
        `${ctx}: ${parsed?.error || parsed?.message || "unknown error"}`,
        parsed?.code,
        stdout,
      );
    }

    return parsed?.data ?? parsed;
  }

  // ---------------------------------------------------------------------------
  // Wallet / auth
  // ---------------------------------------------------------------------------

  async getStatus(force = false): Promise<WalletStatus> {
    if (this.simulate) {
      return {
        loggedIn: true,
        accountId: "sim-account",
        accountName: "Simulated",
        email: null,
        loginType: "ak",
      };
    }
    const now = Date.now();
    if (!force && this.lastStatus && now - this.lastStatus.at < 60_000) {
      return this.lastStatus.value;
    }
    const data = await this.runCli(["wallet", "status"], "wallet status");
    const value: WalletStatus = {
      loggedIn: Boolean(data?.loggedIn),
      accountId: data?.currentAccountId ?? null,
      accountName: data?.currentAccountName ?? null,
      email: data?.email ?? null,
      loginType: (data?.loginType as WalletStatus["loginType"]) ?? null,
    };
    this.lastStatus = { at: now, value };
    return value;
  }

  async requireLogin(): Promise<void> {
    const status = await this.getStatus();
    if (!status.loggedIn) throw new OnchainOSNotLoggedInError();
  }

  async getAddresses(chainId?: number): Promise<any> {
    if (this.simulate) {
      return {
        xlayer: ["0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838"],
        evm: ["0x2E2FC9d6daf5044F53412eb49dF5e82a9cFB3838"],
      };
    }
    const args = ["wallet", "addresses"];
    if (chainId !== undefined) args.push("--chain", String(chainId));
    return this.runCli(args, "wallet addresses");
  }

  // ---------------------------------------------------------------------------
  // DeFi search / detail (read-only, no signing)
  // ---------------------------------------------------------------------------

  async searchDexPool(opts: {
    token: string;
    chain: string;
    platform?: string;
    productGroup?: string; // "DEX_POOL" for V3-style concentrated LP
  }): Promise<
    Array<{
      investmentId: string;
      name?: string;
      tvl?: string;
      rate?: string;
      platform?: string;
      [k: string]: unknown;
    }>
  > {
    if (this.simulate) {
      return [
        {
          investmentId: "sim-pool-1",
          name: `${opts.token}/USDC 0.3 % (simulated)`,
          tvl: "1000000",
          rate: "0.125",
          platform: opts.platform ?? "Uniswap",
        },
      ];
    }
    const args = ["defi", "search", "--token", opts.token, "--chain", opts.chain];
    if (opts.platform) args.push("--platform", opts.platform);
    if (opts.productGroup) args.push("--product-group", opts.productGroup);
    const data = await this.runCli(args, "defi search");
    return Array.isArray(data) ? data : (data?.list ?? []);
  }

  async getPoolDetail(investmentId: string): Promise<any> {
    if (this.simulate) {
      return {
        investmentId,
        fee: 3000,
        tickSpacing: 60,
        underlyingToken: [],
      };
    }
    return this.runCli(
      ["defi", "detail", "--investment-id", investmentId],
      "defi detail",
    );
  }

  async getDepthPriceChart(
    investmentId: string,
    chartType: "DEPTH" | "PRICE" = "DEPTH",
  ): Promise<any> {
    if (this.simulate) return { chartVos: [] };
    const args = [
      "defi",
      "depth-price-chart",
      "--investment-id",
      investmentId,
      "--chart-type",
      chartType,
    ];
    return this.runCli(args, "defi depth-price-chart");
  }

  async getSupportChains(): Promise<any[]> {
    if (this.simulate) return [{ chainId: 196, name: "X Layer" }];
    const data = await this.runCli(["defi", "support-chains"], "defi support-chains");
    return Array.isArray(data) ? data : (data?.list ?? []);
  }

  // ---------------------------------------------------------------------------
  // Positions read
  // ---------------------------------------------------------------------------

  async getPositions(address: string, chains: string): Promise<any[]> {
    if (this.simulate) return [];
    const data = await this.runCli(
      ["defi", "positions", "--address", address, "--chains", chains],
      "defi positions",
    );
    return Array.isArray(data) ? data : (data?.list ?? []);
  }

  async getPositionDetail(
    address: string,
    chain: string,
    platformId: string,
  ): Promise<any> {
    if (this.simulate) return null;
    return this.runCli(
      [
        "defi",
        "position-detail",
        "--address",
        address,
        "--chain",
        chain,
        "--platform-id",
        platformId,
      ],
      "defi position-detail",
    );
  }

  // ---------------------------------------------------------------------------
  // Wallet balance (token assets) — read-only, no signing
  // ---------------------------------------------------------------------------

  /**
   * Return the Agentic Wallet's full token asset list for a given chain.
   *
   * Wraps `onchainos wallet balance --chain <n>` and flattens the CLI's nested
   * `details[0].tokenAssets` shape into a plain array. The CLI uses the
   * currently-logged-in wallet automatically — there is no `--address` flag.
   *
   * Both AgentCoordinator.rebalanceViaOnchainOS and .exitViaOnchainOS need
   * this to size directional swaps from the live wallet state.
   */
  async getBalance(chain: string): Promise<
    Array<{
      tokenAddress: string;
      tokenSymbol: string;
      balance: string; // human-readable decimal string
      tokenPrice?: string;
    }>
  > {
    if (this.simulate) {
      return [
        {
          tokenAddress: "",
          tokenSymbol: "OKB",
          balance: "0.2",
          tokenPrice: "150",
        },
        {
          tokenAddress: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
          tokenSymbol: "USDT",
          balance: "10",
          tokenPrice: "1",
        },
      ];
    }
    await this.requireLogin();
    const data = await this.runCli(
      ["wallet", "balance", "--chain", chain],
      "wallet balance",
    );
    const raw =
      data?.details?.[0]?.tokenAssets ??
      data?.data?.details?.[0]?.tokenAssets ??
      data?.tokenAssets ??
      [];
    if (!Array.isArray(raw)) return [];
    return raw.map((t: any) => ({
      tokenAddress: String(t?.tokenAddress ?? ""),
      tokenSymbol: String(t?.tokenSymbol ?? t?.symbol ?? "?"),
      balance: String(t?.balance ?? "0"),
      tokenPrice: t?.tokenPrice ? String(t.tokenPrice) : undefined,
    }));
  }

  // ---------------------------------------------------------------------------
  // DEX swap — YieldAgent's primary on-chain action
  // ---------------------------------------------------------------------------

  /**
   * Execute a DEX swap through OnchainOS via `onchainos swap execute`.
   * This is the ONE-SHOT path: quote → (approve if needed) → swap → sign
   * inside the Agentic Wallet's TEE → broadcast → return the tx hash.
   *
   * YieldAgent uses this as its primary on-chain action for directional
   * rebalancing. Every swap goes through OnchainOS's TEE signer, so every
   * resulting tx hash is provably attributable to OnchainOS — satisfying
   * the anti-gaming rule for the Most Active On-Chain Agent prize.
   *
   * Why `swap execute` instead of `defi invest`:
   *   `defi invest` returns calldata routed through OKX DEX's Entrance
   *   contract (0x7251FEbE…), which bundles a pre-signed EIP-712 permit
   *   intended for OKX's relayer infrastructure. That path reverts with
   *   `execution reverted` when broadcast directly via `wallet contract-
   *   call`, because the Entrance contract's permit validation expects a
   *   specific msg.sender / relayer flow. `swap execute` instead uses the
   *   OKX DEX aggregator router directly, which accepts plain EOA calls
   *   and has been verified working end-to-end on X Layer mainnet.
   */
  async swap(params: SwapParams): Promise<SwapResult> {
    if (this.simulate) {
      const fakeHash =
        "0x" +
        Array.from(
          { length: 64 },
          () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
        ).join("");
      return {
        swapTxHash: fakeHash,
        approveTxHash: null,
        fromAmount: params.amount ?? "0",
        toAmount: "0",
        fromToken: {
          address: params.fromToken,
          symbol: "SIM",
          decimal: "18",
          unitPriceUsd: "0",
        },
        toToken: {
          address: params.toToken,
          symbol: "SIM",
          decimal: "18",
          unitPriceUsd: "0",
        },
        priceImpact: "0",
        gasUsed: "0",
      };
    }

    await this.requireLogin();

    if (!params.readableAmount && !params.amount) {
      throw new OnchainOSError(
        "swap: either readableAmount or amount is required",
      );
    }
    if (params.readableAmount && params.amount) {
      throw new OnchainOSError(
        "swap: readableAmount and amount are mutually exclusive",
      );
    }

    const chain = params.chain ?? "196";
    const args = [
      "swap",
      "execute",
      "--from",
      params.fromToken,
      "--to",
      params.toToken,
      "--chain",
      chain,
      "--wallet",
      params.wallet,
    ];
    if (params.readableAmount) {
      args.push("--readable-amount", params.readableAmount);
    } else if (params.amount) {
      args.push("--amount", params.amount);
    }
    if (params.slippage) args.push("--slippage", params.slippage);
    if (params.gasLevel) args.push("--gas-level", params.gasLevel);
    if (params.swapMode) args.push("--swap-mode", params.swapMode);
    if (params.mevProtection) args.push("--mev-protection");

    const data = await this.runCli(args, "swap execute", {
      allowForceRetry: true,
    });

    const swapTxHash = data?.swapTxHash ?? data?.data?.swapTxHash;
    if (
      !swapTxHash ||
      typeof swapTxHash !== "string" ||
      !swapTxHash.startsWith("0x")
    ) {
      throw new OnchainOSError(
        "swap execute returned no swapTxHash",
        undefined,
        JSON.stringify(data).slice(0, 500),
      );
    }

    return {
      swapTxHash,
      approveTxHash: data?.approveTxHash ?? null,
      fromAmount: String(data?.fromAmount ?? "0"),
      toAmount: String(data?.toAmount ?? "0"),
      fromToken: {
        address: data?.fromToken?.tokenContractAddress ?? params.fromToken,
        symbol: data?.fromToken?.tokenSymbol ?? "?",
        decimal: String(data?.fromToken?.decimal ?? "18"),
        unitPriceUsd: String(data?.fromToken?.tokenUnitPrice ?? "0"),
      },
      toToken: {
        address: data?.toToken?.tokenContractAddress ?? params.toToken,
        symbol: data?.toToken?.tokenSymbol ?? "?",
        decimal: String(data?.toToken?.decimal ?? "18"),
        unitPriceUsd: String(data?.toToken?.tokenUnitPrice ?? "0"),
      },
      priceImpact: String(data?.priceImpact ?? "0"),
      gasUsed: String(data?.gasUsed ?? "0"),
    };
  }

  // ---------------------------------------------------------------------------
  // DeFi invest — EXPERIMENTAL (permit-based, not production-ready)
  // ---------------------------------------------------------------------------

  /**
   * Execute a DeFi invest through OnchainOS and return the final on-chain
   * tx hash.
   *
   * ⚠️  **KNOWN LIMITATION**: On X Layer mainnet, `defi invest` (and
   * `defi deposit`) return calldata routed through OKX DEX's `Entrance`
   * contract at `0x7251FEbEABB01eC9dE53ECe7a96f1C951F886Dd2`, which bundles
   * a pre-signed EIP-712 permit. That calldata is designed for OKX's
   * relayer infrastructure and REVERTS when broadcast directly via
   * `wallet contract-call` (verified against investmentId 42003 USDT-OKB
   * 0.3 % pool — revert during estimateGas simulation, both with and
   * without explicit ticks).
   *
   * Use {@link swap} instead for YieldAgent's on-chain actions. This method
   * is kept for forward compatibility and returns immediately in simulate
   * mode; in live mode it still runs end-to-end but the final
   * `wallet contract-call` will revert until OnchainOS exposes a relayer
   * path for the Entrance permit flow.
   */
  async invest(params: InvestParams): Promise<InvestResult> {
    if (this.simulate) {
      const fakeHash =
        "0x" +
        Array.from(
          { length: 64 },
          () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
        ).join("");
      return {
        txHash: fakeHash,
        stepTxHashes: [fakeHash],
        externalId: params.investmentId,
        dataListSize: 1,
      };
    }

    await this.requireLogin();

    const args = [
      "defi",
      "invest",
      "--investment-id",
      params.investmentId,
      "--address",
      params.address,
      "--token",
      params.token,
      "--amount",
      params.amount,
    ];
    if (params.token2) args.push("--token2", params.token2);
    if (params.amount2) args.push("--amount2", params.amount2);
    if (params.chain) args.push("--chain", params.chain);
    if (params.slippage) args.push("--slippage", params.slippage);
    if (params.tokenId) args.push("--token-id", params.tokenId);
    if (params.tickLower !== undefined)
      args.push("--tick-lower", String(params.tickLower));
    if (params.tickUpper !== undefined)
      args.push("--tick-upper", String(params.tickUpper));
    if (params.range !== undefined) args.push("--range", String(params.range));

    const calldataResp = await this.runCli(args, "defi invest (calldata)");
    const dataList = this.extractDataList(calldataResp);
    if (dataList.length === 0) {
      throw new OnchainOSError(
        "defi invest returned an empty dataList — nothing to execute",
      );
    }

    const chainNumeric = this.resolveChainId(params.chain ?? "xlayer");
    return this.executeDataList(dataList, chainNumeric, params.investmentId, {
      from: params.address,
    });
  }

  // ---------------------------------------------------------------------------
  // DeFi withdraw
  // ---------------------------------------------------------------------------

  async withdraw(params: WithdrawParams): Promise<InvestResult> {
    if (this.simulate) {
      const fakeHash = "0x" + "2".repeat(64);
      return {
        txHash: fakeHash,
        stepTxHashes: [fakeHash],
        externalId: params.investmentId,
        dataListSize: 1,
      };
    }

    await this.requireLogin();

    const args = [
      "defi",
      "withdraw",
      "--investment-id",
      params.investmentId,
      "--address",
      params.address,
      "--chain",
      params.chain,
    ];
    if (params.platformId) args.push("--platform-id", params.platformId);
    if (params.tokenId) args.push("--token-id", params.tokenId);
    if (params.ratio) args.push("--ratio", params.ratio);
    if (params.amount) args.push("--amount", params.amount);
    if (params.slippage) args.push("--slippage", params.slippage);

    const calldataResp = await this.runCli(args, "defi withdraw (calldata)");
    const dataList = this.extractDataList(calldataResp);
    if (dataList.length === 0) {
      throw new OnchainOSError("defi withdraw returned an empty dataList");
    }

    const chainNumeric = this.resolveChainId(params.chain);
    return this.executeDataList(dataList, chainNumeric, params.investmentId, {
      from: params.address,
    });
  }

  // ---------------------------------------------------------------------------
  // DeFi collect (rewards / V3 fees)
  // ---------------------------------------------------------------------------

  async collect(params: CollectParams): Promise<InvestResult> {
    if (this.simulate) {
      const fakeHash = "0x" + "3".repeat(64);
      return {
        txHash: fakeHash,
        stepTxHashes: [fakeHash],
        externalId: params.investmentId ?? "",
        dataListSize: 1,
      };
    }

    await this.requireLogin();

    const args = [
      "defi",
      "collect",
      "--address",
      params.address,
      "--chain",
      params.chain,
      "--reward-type",
      params.rewardType,
    ];
    if (params.investmentId) args.push("--investment-id", params.investmentId);
    if (params.platformId) args.push("--platform-id", params.platformId);
    if (params.tokenId) args.push("--token-id", params.tokenId);
    if (params.principalIndex)
      args.push("--principal-index", params.principalIndex);

    const calldataResp = await this.runCli(args, "defi collect (calldata)");
    const dataList = this.extractDataList(calldataResp);

    // An empty dataList from collect is a legitimate "no rewards" case, not
    // an error — return an empty result so the caller can skip recording.
    if (dataList.length === 0) {
      return {
        txHash: "",
        stepTxHashes: [],
        externalId: params.investmentId ?? "",
        dataListSize: 0,
      };
    }

    const chainNumeric = this.resolveChainId(params.chain);
    return this.executeDataList(
      dataList,
      chainNumeric,
      params.investmentId ?? "",
      { from: params.address },
    );
  }

  // ---------------------------------------------------------------------------
  // wallet contract-call — the only path to sign a tx
  // ---------------------------------------------------------------------------

  /**
   * Sign and broadcast a contract call via the Agentic Wallet. Returns the
   * on-chain tx hash. This is the ONLY signing path YieldAgent uses — it
   * forces every tx through OnchainOS's TEE, which is the anti-gaming
   * guarantee for the Most Active On-Chain Agent prize.
   */
  async contractCall(params: ContractCallParams): Promise<string> {
    if (this.simulate) {
      return (
        "0x" +
        Array.from(
          { length: 64 },
          () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
        ).join("")
      );
    }

    await this.requireLogin();

    const args = [
      "wallet",
      "contract-call",
      "--to",
      params.to,
      "--chain",
      String(params.chain),
      "--input-data",
      params.inputData,
      "--amt",
      this.normalizeMinimalUnits(params.amt ?? "0"),
    ];
    if (params.gasLimit !== undefined)
      args.push("--gas-limit", String(params.gasLimit));
    if (params.from) args.push("--from", params.from);
    if (params.mevProtection) args.push("--mev-protection");

    const resp = await this.runCli(args, "wallet contract-call", {
      allowForceRetry: true,
    });
    const txHash =
      resp?.txHash ??
      resp?.data?.txHash ??
      resp?.transactionHash ??
      resp?.hash;
    if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x")) {
      throw new OnchainOSError(
        "wallet contract-call returned no txHash",
        undefined,
        JSON.stringify(resp).slice(0, 500),
      );
    }
    return txHash;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Find the `dataList` array in a CLI response, tolerating a couple of
   * response shapes (`{ dataList }`, `{ data: { dataList } }`, `[...]`).
   */
  private extractDataList(resp: any): DataListStep[] {
    if (Array.isArray(resp?.dataList)) return resp.dataList;
    if (Array.isArray(resp?.data?.dataList)) return resp.data.dataList;
    if (Array.isArray(resp)) return resp as DataListStep[];
    return [];
  }

  /**
   * Execute each step of a defi dataList via `wallet contract-call`, in order,
   * stopping on the first failure. Returns all tx hashes for audit.
   */
  private async executeDataList(
    dataList: DataListStep[],
    chainNumeric: number,
    externalId: string,
    opts: { from?: string } = {},
  ): Promise<InvestResult> {
    const stepTxHashes: string[] = [];
    for (let i = 0; i < dataList.length; i++) {
      const step = dataList[i];
      if (!step?.to || !step?.serializedData) {
        throw new OnchainOSError(
          `dataList[${i}] missing to or serializedData`,
          undefined,
          JSON.stringify(step).slice(0, 300),
        );
      }
      const hash = await this.contractCall({
        to: step.to,
        chain: chainNumeric,
        inputData: step.serializedData,
        amt: (step.value as string) ?? "0",
        from: opts.from,
      });
      stepTxHashes.push(hash);
      console.log(
        `[onchainos] step ${i + 1}/${dataList.length} confirmed: ${hash}`,
      );
    }
    return {
      txHash: stepTxHashes[stepTxHashes.length - 1],
      stepTxHashes,
      externalId,
      dataListSize: dataList.length,
    };
  }

  /**
   * Map a chain name/id string to the numeric chainIndex the CLI expects.
   * Per the okx-agentic-wallet skill: wallet commands require numeric ids.
   */
  private resolveChainId(chain: string | number): number {
    if (typeof chain === "number") return chain;
    const lower = String(chain).trim().toLowerCase();
    const map: Record<string, number> = {
      ethereum: 1,
      eth: 1,
      bsc: 56,
      bnb: 56,
      polygon: 137,
      matic: 137,
      arbitrum: 42161,
      arb: 42161,
      base: 8453,
      optimism: 10,
      op: 10,
      xlayer: 196,
      "x-layer": 196,
      "x layer": 196,
      "xlayer-mainnet": 196,
      "xlayer-testnet": 1952,
      solana: 501,
      sol: 501,
    };
    if (map[lower] !== undefined) return map[lower];
    const asNum = Number(lower);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    throw new OnchainOSError(`Unknown chain: ${chain}`);
  }

  /**
   * Normalise a raw value (possibly hex, possibly empty, possibly 0x-prefixed)
   * into a decimal string of minimal units. The `--amt` flag expects a whole
   * number with no decimals.
   */
  private normalizeMinimalUnits(value: string): string {
    if (!value || value === "" || value === "0" || value === "0x" || value === "0x0") {
      return "0";
    }
    try {
      const bi = value.startsWith("0x") ? BigInt(value) : BigInt(value);
      if (bi < 0n) return "0";
      return bi.toString(10);
    } catch {
      return "0";
    }
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _singleton: OnchainOSAdapter | null = null;

/**
 * Return a process-wide OnchainOSAdapter singleton. Pass `simulate: true` on
 * first call to run in mock mode (useful for frontend demos / CI).
 */
export function getOnchainOSAdapter(
  opts?: OnchainOSAdapterOptions,
): OnchainOSAdapter {
  if (!_singleton) {
    _singleton = new OnchainOSAdapter(opts);
  }
  return _singleton;
}
