"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseUnits } from "viem";
import {
  ARENA_HOOK_ABI,
  ARENA_HOOK_ADDRESS,
  ARENA_POOL_ID,
  ARENA_REGISTRY_ABI,
  ARENA_REGISTRY_ADDRESS,
  ARENA_STAKE_TOKEN,
  USDT_ABI,
  BID_PHASE_DURATION_SEC,
  EPOCH_DURATION_SEC,
  formatUSDT6,
  txOklink,
  shortHash,
} from "@/lib/arenaContracts";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Crown,
  ExternalLink,
  Gavel,
  Loader2,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

const X_LAYER_CHAIN_ID = 196;

export function ArenaActions() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // ── reads ────────────────────────────────────────────────────────────
  const { data: registryData, refetch: refetchRegistry } = useReadContract({
    address: ARENA_REGISTRY_ADDRESS,
    abi: ARENA_REGISTRY_ABI,
    functionName: "agents",
    args: address ? [address] : undefined,
    chainId: X_LAYER_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const agentRec = registryData as
    | readonly [boolean, string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint]
    | undefined;
  const isRegistered = agentRec?.[0] ?? false;
  const userStake = agentRec?.[3] ?? 0n;
  const userReputation = agentRec?.[4] ?? 0n;

  const { data: hookCurrentEpoch } = useReadContract({
    address: ARENA_HOOK_ADDRESS,
    abi: ARENA_HOOK_ABI,
    functionName: "getCurrentEpoch",
    args: [ARENA_POOL_ID],
    chainId: X_LAYER_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });
  const { data: hookEpochStart } = useReadContract({
    address: ARENA_HOOK_ADDRESS,
    abi: ARENA_HOOK_ABI,
    functionName: "getEpochStartTime",
    args: [ARENA_POOL_ID],
    chainId: X_LAYER_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });
  const { data: activeManager } = useReadContract({
    address: ARENA_HOOK_ADDRESS,
    abi: ARENA_HOOK_ABI,
    functionName: "getActiveManager",
    args: [ARENA_POOL_ID],
    chainId: X_LAYER_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });

  // ── time-based phase derivation ───────────────────────────────────────
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const epochStartTs = hookEpochStart !== undefined ? Number(hookEpochStart) : 0;
  const bidEndTs = epochStartTs + BID_PHASE_DURATION_SEC;
  const settleTs = epochStartTs + EPOCH_DURATION_SEC;
  const bidOpen = epochStartTs > 0 && now < bidEndTs;
  const noManager =
    !activeManager || activeManager === "0x0000000000000000000000000000000000000000";
  const electionReady = epochStartTs > 0 && now >= bidEndTs && noManager;
  const settleReady = epochStartTs > 0 && now >= settleTs;

  // ── handle wrong chain ────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="card flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <Wallet className="w-5 h-5" />
        </div>
        <div className="text-sm text-white/60">
          Connect a wallet (top-right) to participate as an agent in this arena.
        </div>
      </div>
    );
  }
  if (chainId !== X_LAYER_CHAIN_ID) {
    return (
      <div className="card flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-yellow-300">
          <Lock className="w-5 h-5" />
          Switch to X Layer (chain 196) to interact with AgentArena.
        </div>
        <button
          onClick={() => switchChain({ chainId: X_LAYER_CHAIN_ID })}
          className="px-4 py-2 rounded-xl bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300 border border-yellow-400/40 text-sm font-medium transition-colors"
        >
          Switch to X Layer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <Rocket className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold">Participate as an Agent</div>
          <div className="text-xs text-white/50 font-mono">
            register → bid → win election → manage → get settled
          </div>
        </div>
      </div>

      {!isRegistered ? (
        <RegisterCard onSuccess={refetchRegistry} address={address!} />
      ) : (
        <RegisteredHeader stake={userStake} reputation={userReputation} />
      )}

      {isRegistered && bidOpen && (
        <SubmitBidCard
          agentAddress={address!}
          epochId={hookCurrentEpoch as bigint}
          userStake={userStake}
          onSuccess={refetchRegistry}
        />
      )}

      {isRegistered && !bidOpen && noManager && epochStartTs > 0 && !settleReady && (
        <div className="card flex items-center gap-3 border-bg-border">
          <Lock className="w-5 h-5 text-white/40" />
          <div className="text-sm text-white/60">
            Bid phase for Epoch {hookCurrentEpoch?.toString()} has ended. Wait for someone to run
            the election, or for the next epoch to start.
          </div>
        </div>
      )}

      {/* Permissionless operator buttons */}
      {(electionReady || settleReady) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {electionReady && !settleReady && (
            <PermissionlessButton
              label="Run Election"
              tagline="permissionless · anyone can call"
              functionName="runElection"
              icon={Crown}
              tone="accent"
            />
          )}
          {settleReady && (
            <PermissionlessButton
              label="Settle Epoch"
              tagline="advance to next epoch · permissionless"
              functionName="settleEpoch"
              icon={CheckCircle2}
              tone="warn"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

function RegisteredHeader({ stake, reputation }: { stake: bigint; reputation: bigint }) {
  return (
    <div className="p-4 rounded-xl bg-accent/5 border border-accent/30 flex items-center gap-3 text-sm">
      <CheckCircle2 className="w-5 h-5 text-accent" />
      <div className="flex-1">
        You're registered as an agent.{" "}
        <span className="font-mono text-white/70">
          stake {formatUSDT6(stake)} USDT · reputation {reputation.toString()}
        </span>
      </div>
    </div>
  );
}

function RegisterCard({
  onSuccess,
  address,
}: {
  onSuccess: () => void;
  address: `0x${string}`;
}) {
  const [name, setName] = useState("MyAgent");
  const [stakeUsdt, setStakeUsdt] = useState("2");
  const stakeWei = useMemo(() => {
    try {
      return parseUnits(stakeUsdt || "0", 6);
    } catch {
      return 0n;
    }
  }, [stakeUsdt]);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ARENA_STAKE_TOKEN,
    abi: USDT_ABI,
    functionName: "allowance",
    args: [address, ARENA_REGISTRY_ADDRESS],
    chainId: X_LAYER_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });
  const { data: balance } = useReadContract({
    address: ARENA_STAKE_TOKEN,
    abi: USDT_ABI,
    functionName: "balanceOf",
    args: [address],
    chainId: X_LAYER_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });

  const needsApprove = (allowance as bigint | undefined) === undefined || (allowance as bigint) < stakeWei;
  const insufficientBalance = (balance as bigint | undefined) !== undefined && (balance as bigint) < stakeWei;

  const { writeContract: writeApprove, data: approveHash, isPending: approving, reset: resetApprove } = useWriteContract();
  const { writeContract: writeRegister, data: registerHash, isPending: registering, reset: resetRegister } = useWriteContract();

  const { isLoading: approveMining, isSuccess: approveDone } = useWaitForTransactionReceipt({
    hash: approveHash,
    chainId: X_LAYER_CHAIN_ID,
  });
  const { isLoading: registerMining, isSuccess: registerDone } = useWaitForTransactionReceipt({
    hash: registerHash,
    chainId: X_LAYER_CHAIN_ID,
  });

  useEffect(() => {
    if (approveDone) refetchAllowance();
  }, [approveDone, refetchAllowance]);
  useEffect(() => {
    if (registerDone) {
      onSuccess();
      resetRegister();
      resetApprove();
    }
  }, [registerDone, onSuccess, resetRegister, resetApprove]);

  return (
    <div className="card border-accent/20">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="w-5 h-5 text-accent" />
        <div className="font-bold">Register as a new agent</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <div className="stat-label mb-1.5">Agent name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MyAgent"
            className="w-full bg-bg border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
        <div>
          <div className="stat-label mb-1.5">Initial stake (USDT)</div>
          <input
            type="number"
            min="1"
            step="0.5"
            value={stakeUsdt}
            onChange={(e) => setStakeUsdt(e.target.value)}
            className="w-full bg-bg border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent/50 transition-colors"
          />
          <div className="text-[10px] text-white/40 mt-1 font-mono">
            min 1 USDT · balance{" "}
            {balance !== undefined ? formatUSDT6(balance as bigint) : "—"} USDT
          </div>
        </div>
        <div className="flex flex-col justify-end">
          {needsApprove ? (
            <button
              disabled={approving || approveMining || stakeWei === 0n}
              onClick={() =>
                writeApprove({
                  address: ARENA_STAKE_TOKEN,
                  abi: USDT_ABI,
                  functionName: "approve",
                  args: [ARENA_REGISTRY_ADDRESS, stakeWei],
                  chainId: X_LAYER_CHAIN_ID,
                })
              }
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2",
                stakeWei > 0n
                  ? "bg-accent text-bg hover:bg-accent-dim"
                  : "bg-bg-border text-white/30 cursor-not-allowed"
              )}
            >
              {approving || approveMining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Approving…
                </>
              ) : (
                <>1. Approve USDT</>
              )}
            </button>
          ) : (
            <button
              disabled={
                registering ||
                registerMining ||
                stakeWei === 0n ||
                insufficientBalance ||
                !name.trim()
              }
              onClick={() =>
                writeRegister({
                  address: ARENA_REGISTRY_ADDRESS,
                  abi: ARENA_REGISTRY_ABI,
                  functionName: "register",
                  args: [name.trim(), "ipfs://placeholder", stakeWei],
                  chainId: X_LAYER_CHAIN_ID,
                })
              }
              className={cn(
                "px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2",
                !insufficientBalance && name.trim()
                  ? "bg-accent text-bg hover:bg-accent-dim"
                  : "bg-bg-border text-white/30 cursor-not-allowed"
              )}
            >
              {registering || registerMining ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Registering…
                </>
              ) : (
                <>2. Register Agent</>
              )}
            </button>
          )}
        </div>
      </div>
      {insufficientBalance && (
        <div className="text-xs text-yellow-300 font-mono">
          ⚠ Balance below requested stake — top up USDT first.
        </div>
      )}
      <TxStatus hash={approveHash} label="approve" />
      <TxStatus hash={registerHash} label="register" />
    </div>
  );
}

function SubmitBidCard({
  agentAddress,
  epochId,
  userStake,
  onSuccess,
}: {
  agentAddress: `0x${string}`;
  epochId: bigint;
  userStake: bigint;
  onSuccess: () => void;
}) {
  const [bondStakeUsdt, setBondStakeUsdt] = useState("1");
  const [promisedApr, setPromisedApr] = useState("18");
  const [minFee, setMinFee] = useState("30");
  const [maxFee, setMaxFee] = useState("80");
  const [maxReb, setMaxReb] = useState("6");
  const [tickRange, setTickRange] = useState("200");

  const { data: nonce } = useReadContract({
    address: ARENA_HOOK_ADDRESS,
    abi: ARENA_HOOK_ABI,
    functionName: "nonces",
    args: [agentAddress],
    chainId: X_LAYER_CHAIN_ID,
    query: { refetchInterval: 10_000 },
  });

  const bondStakeWei = useMemo(() => {
    try {
      return parseUnits(bondStakeUsdt || "0", 6);
    } catch {
      return 0n;
    }
  }, [bondStakeUsdt]);

  const insufficientStake = bondStakeWei > userStake;
  const invalidFeeRange = Number(minFee) >= Number(maxFee);

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: mining, isSuccess: done } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: X_LAYER_CHAIN_ID,
  });

  useEffect(() => {
    if (done) {
      onSuccess();
      reset();
    }
  }, [done, onSuccess, reset]);

  return (
    <div className="card border-accent/30 bg-gradient-to-br from-accent/5 via-transparent to-transparent">
      <div className="flex items-center gap-3 mb-4">
        <Gavel className="w-5 h-5 text-accent" />
        <div className="font-bold">Submit StrategyBond · Epoch {epochId?.toString()}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Field
          label="Bond stake (USDT)"
          hint={`max ${formatUSDT6(userStake)}`}
          value={bondStakeUsdt}
          onChange={setBondStakeUsdt}
          type="number"
          min="0.1"
          step="0.1"
        />
        <Field
          label="Promised APR (%)"
          hint="e.g. 18 = 18% annual"
          value={promisedApr}
          onChange={setPromisedApr}
          type="number"
          min="1"
          max="500"
          step="1"
        />
        <Field
          label="Min fee (bps)"
          hint="0.01% units"
          value={minFee}
          onChange={setMinFee}
          type="number"
          min="10"
          max="10000"
        />
        <Field
          label="Max fee (bps)"
          hint="must be > min"
          value={maxFee}
          onChange={setMaxFee}
          type="number"
          min="10"
          max="10000"
        />
        <Field
          label="Max rebalances / epoch"
          hint="≤ 24"
          value={maxReb}
          onChange={setMaxReb}
          type="number"
          min="1"
          max="24"
        />
        <Field
          label="Max tick range"
          hint="half-width, in ticks"
          value={tickRange}
          onChange={setTickRange}
          type="number"
          min="1"
          max="887272"
        />
      </div>

      <div className="text-xs text-white/40 font-mono mb-3 leading-relaxed">
        bidScore = stake × promisedAPR × reputation / (maxFee − minFee + 1).{" "}
        Tighter fee band = higher confidence = more likely to win election. Miss your APR
        promise by epoch end → auto-slash up to 50% of bond stake → LP gets paid.
      </div>

      {invalidFeeRange && (
        <div className="text-xs text-yellow-300 font-mono mb-2">⚠ Max fee must be greater than min fee.</div>
      )}
      {insufficientStake && (
        <div className="text-xs text-yellow-300 font-mono mb-2">
          ⚠ Bond stake exceeds your registered stake ({formatUSDT6(userStake)} USDT).
        </div>
      )}

      <button
        disabled={
          isPending || mining || bondStakeWei === 0n || insufficientStake || invalidFeeRange || nonce === undefined
        }
        onClick={() =>
          writeContract({
            address: ARENA_HOOK_ADDRESS,
            abi: ARENA_HOOK_ABI,
            functionName: "submitBid",
            args: [
              {
                agent: agentAddress,
                poolId: ARENA_POOL_ID,
                epochId: epochId,
                stakeAmount: bondStakeWei,
                promisedAPRBps: BigInt(Math.round(Number(promisedApr) * 100)),
                minFeeBps: Number(minFee),
                maxFeeBps: Number(maxFee),
                maxRebalancesPerEpoch: Number(maxReb),
                maxTickRange: Number(tickRange),
                nonce: nonce as bigint,
                signature: "0x" as `0x${string}`,
              },
            ],
            chainId: X_LAYER_CHAIN_ID,
          })
        }
        className={cn(
          "w-full px-4 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2",
          !insufficientStake && !invalidFeeRange && bondStakeWei > 0n
            ? "bg-accent text-bg hover:bg-accent-dim"
            : "bg-bg-border text-white/30 cursor-not-allowed"
        )}
      >
        {isPending || mining ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Submitting StrategyBond…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" /> Submit StrategyBond
          </>
        )}
      </button>

      <TxStatus hash={txHash} label="bid" />
    </div>
  );
}

function PermissionlessButton({
  label,
  tagline,
  functionName,
  icon: Icon,
  tone,
}: {
  label: string;
  tagline: string;
  functionName: "runElection" | "settleEpoch";
  icon: React.ComponentType<{ className?: string }>;
  tone: "accent" | "warn";
}) {
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: mining } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: X_LAYER_CHAIN_ID,
  });

  return (
    <div className="card">
      <button
        disabled={isPending || mining}
        onClick={() =>
          writeContract({
            address: ARENA_HOOK_ADDRESS,
            abi: ARENA_HOOK_ABI,
            functionName,
            args: [ARENA_POOL_ID],
            chainId: X_LAYER_CHAIN_ID,
          })
        }
        className={cn(
          "w-full px-4 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2",
          tone === "accent"
            ? "bg-accent text-bg hover:bg-accent-dim disabled:bg-bg-border disabled:text-white/30"
            : "bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-300 border border-yellow-400/40 disabled:opacity-50"
        )}
      >
        {isPending || mining ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Broadcasting…
          </>
        ) : (
          <>
            <Icon className="w-4 h-4" /> {label}
          </>
        )}
      </button>
      <div className="text-[11px] font-mono text-white/40 mt-2 text-center">{tagline}</div>
      <TxStatus hash={txHash} label={functionName} />
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  ...rest
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <div>
      <div className="stat-label mb-1.5">{label}</div>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg border border-bg-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-accent/50 transition-colors"
      />
      {hint && <div className="text-[10px] text-white/40 mt-1 font-mono">{hint}</div>}
    </div>
  );
}

function TxStatus({ hash, label }: { hash?: string; label: string }) {
  if (!hash) return null;
  return (
    <a
      href={txOklink(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-2 text-[11px] font-mono text-white/50 hover:text-accent transition-colors"
    >
      <ShieldCheck className="w-3 h-3" />
      {label} tx: {shortHash(hash)}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}
