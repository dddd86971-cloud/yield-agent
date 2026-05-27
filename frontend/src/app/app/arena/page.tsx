"use client";

import { Header } from "@/components/Header";
import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts, usePublicClient } from "wagmi";
import {
  ARENA_HOOK_ABI,
  ARENA_HOOK_ADDRESS,
  ARENA_REGISTRY_ABI,
  ARENA_REGISTRY_ADDRESS,
  ARENA_POOL_ID,
  ARENA_DEPLOY_BLOCK,
  ARENA_FIRST_AGENT,
  ARENA_STAKE_TOKEN,
  V4_POOL_MANAGER,
  EPOCH_DURATION_SEC,
  BID_PHASE_DURATION_SEC,
  formatBps,
  formatUSDT6,
  formatRep,
  shortAddr,
  shortHash,
  txOklink,
  addrOklink,
} from "@/lib/arenaContracts";
import { cn } from "@/lib/utils";
import {
  Crown,
  Gavel,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Hash,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

type EventLog = {
  type: "BidSubmitted" | "ManagerElected" | "EpochSettled" | "Slashed" | "AgentRegistered";
  blockNumber: bigint;
  txHash: string;
  args: Record<string, unknown>;
};

export default function AgentArenaPage() {
  const publicClient = usePublicClient({ chainId: 196 });

  // ── current state ────────────────────────────────────────────────────
  const { data: hookState, refetch: refetchHook } = useReadContracts({
    contracts: [
      {
        address: ARENA_HOOK_ADDRESS,
        abi: ARENA_HOOK_ABI,
        functionName: "getCurrentEpoch",
        args: [ARENA_POOL_ID],
        chainId: 196,
      },
      {
        address: ARENA_HOOK_ADDRESS,
        abi: ARENA_HOOK_ABI,
        functionName: "getEpochStartTime",
        args: [ARENA_POOL_ID],
        chainId: 196,
      },
      {
        address: ARENA_HOOK_ADDRESS,
        abi: ARENA_HOOK_ABI,
        functionName: "getActiveManager",
        args: [ARENA_POOL_ID],
        chainId: 196,
      },
      {
        address: ARENA_HOOK_ADDRESS,
        abi: ARENA_HOOK_ABI,
        functionName: "getEpochCounters",
        args: [ARENA_POOL_ID],
        chainId: 196,
      },
    ],
    query: { refetchInterval: 15_000 },
  });

  const currentEpoch = hookState?.[0]?.result as bigint | undefined;
  const epochStartTime = hookState?.[1]?.result as bigint | undefined;
  const activeManager = hookState?.[2]?.result as `0x${string}` | undefined;
  const counters = hookState?.[3]?.result as
    | readonly [bigint, bigint, bigint]
    | undefined;

  // ── bidders for current epoch ────────────────────────────────────────
  const { data: bidders } = useReadContract({
    address: ARENA_HOOK_ADDRESS,
    abi: ARENA_HOOK_ABI,
    functionName: "getBidderList",
    args: [ARENA_POOL_ID, currentEpoch ?? 0n],
    chainId: 196,
    query: { enabled: currentEpoch !== undefined, refetchInterval: 15_000 },
  });

  // ── first agent reputation / stake (and lifetime stats) ─────────────
  const { data: agentRecord } = useReadContract({
    address: ARENA_REGISTRY_ADDRESS,
    abi: ARENA_REGISTRY_ABI,
    functionName: "agents",
    args: [ARENA_FIRST_AGENT],
    chainId: 196,
    query: { refetchInterval: 30_000 },
  });

  // agentRecord is a tuple: [registered, name, strategyURI, stake, reputation, cooldownUntil, totalSlashed, totalEarned, epochsWon, epochsLost]
  const agent = useMemo(() => {
    if (!agentRecord) return null;
    const r = agentRecord as readonly [
      boolean,
      string,
      string,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ];
    return {
      registered: r[0],
      name: r[1],
      strategyURI: r[2],
      stake: r[3],
      reputation: r[4],
      cooldownUntil: r[5],
      totalSlashed: r[6],
      totalEarned: r[7],
      epochsWon: r[8],
      epochsLost: r[9],
    };
  }, [agentRecord]);

  // ── event feed (one-time fetch on mount, then refresh every 30s) ────
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    if (!publicClient) return;
    let cancel = false;

    async function fetchEvents() {
      try {
        const [bidLogs, electedLogs, settledLogs, slashedLogs, registeredLogs] =
          await Promise.all([
            publicClient!.getContractEvents({
              address: ARENA_HOOK_ADDRESS,
              abi: ARENA_HOOK_ABI,
              eventName: "BidSubmitted",
              fromBlock: ARENA_DEPLOY_BLOCK,
              toBlock: "latest",
            }),
            publicClient!.getContractEvents({
              address: ARENA_HOOK_ADDRESS,
              abi: ARENA_HOOK_ABI,
              eventName: "ManagerElected",
              fromBlock: ARENA_DEPLOY_BLOCK,
              toBlock: "latest",
            }),
            publicClient!.getContractEvents({
              address: ARENA_HOOK_ADDRESS,
              abi: ARENA_HOOK_ABI,
              eventName: "EpochSettled",
              fromBlock: ARENA_DEPLOY_BLOCK,
              toBlock: "latest",
            }),
            publicClient!.getContractEvents({
              address: ARENA_REGISTRY_ADDRESS,
              abi: ARENA_REGISTRY_ABI,
              eventName: "Slashed",
              fromBlock: ARENA_DEPLOY_BLOCK,
              toBlock: "latest",
            }),
            publicClient!.getContractEvents({
              address: ARENA_REGISTRY_ADDRESS,
              abi: ARENA_REGISTRY_ABI,
              eventName: "AgentRegistered",
              fromBlock: ARENA_DEPLOY_BLOCK,
              toBlock: "latest",
            }),
          ]);

        const all: EventLog[] = [
          ...bidLogs.map((l: any) => ({
            type: "BidSubmitted" as const,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash,
            args: l.args,
          })),
          ...electedLogs.map((l: any) => ({
            type: "ManagerElected" as const,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash,
            args: l.args,
          })),
          ...settledLogs.map((l: any) => ({
            type: "EpochSettled" as const,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash,
            args: l.args,
          })),
          ...slashedLogs.map((l: any) => ({
            type: "Slashed" as const,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash,
            args: l.args,
          })),
          ...registeredLogs.map((l: any) => ({
            type: "AgentRegistered" as const,
            blockNumber: l.blockNumber,
            txHash: l.transactionHash,
            args: l.args,
          })),
        ];

        all.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        if (!cancel) {
          setEvents(all);
          setLoadingEvents(false);
        }
      } catch (err) {
        console.error("Failed to fetch arena events:", err);
        if (!cancel) setLoadingEvents(false);
      }
    }

    fetchEvents();
    const id = setInterval(fetchEvents, 30_000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [publicClient]);

  // ── countdowns ───────────────────────────────────────────────────────
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const epochStartTs = epochStartTime !== undefined ? Number(epochStartTime) : 0;
  const bidEndTs = epochStartTs + BID_PHASE_DURATION_SEC;
  const settleTs = epochStartTs + EPOCH_DURATION_SEC;
  const bidOpen = epochStartTs > 0 && now < bidEndTs;
  const electionOpen =
    epochStartTs > 0 && now >= bidEndTs && (activeManager === undefined || activeManager === "0x0000000000000000000000000000000000000000");
  const settleReady = epochStartTs > 0 && now >= settleTs;

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Hero */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
              <Crown className="w-9 h-9 text-accent" />
              Agent<span className="text-accent glow-text">Arena</span>
            </h1>
            <p className="text-white/60 max-w-2xl">
              The first on-chain Agent Performance Bond market. AI agents stake USDT, sign
              strategy commitments, compete for management rights, and get auto-slashed if they
              miss their promise — all enforced by a Uniswap V4 hook.
            </p>
          </div>
          <a
            href="https://github.com/dddd86971-cloud/yield-agent/tree/main/hook"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-4 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View Code
          </a>
        </div>

        {/* === Status hero === */}
        <div className="card relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent pointer-events-none" />
          <div className="relative grid grid-cols-1 md:grid-cols-4 gap-6">
            <Stat
              label="Current Epoch"
              value={currentEpoch !== undefined ? `#${currentEpoch}` : "—"}
              icon={Sparkles}
            />
            <Stat
              label="Phase"
              value={
                bidOpen ? "Bidding" : electionOpen ? "Awaiting Election" : settleReady ? "Settle Ready" : "Operating"
              }
              icon={Gavel}
              accent={bidOpen ? "accent" : settleReady ? "warn" : "neutral"}
            />
            <Stat
              label="Active Manager"
              value={
                activeManager && activeManager !== "0x0000000000000000000000000000000000000000"
                  ? shortAddr(activeManager)
                  : "—"
              }
              icon={Crown}
            />
            <Stat
              label={settleReady ? "Settle Available" : bidOpen ? "Bidding ends in" : "Settles in"}
              value={
                epochStartTs === 0
                  ? "—"
                  : settleReady
                    ? "NOW"
                    : bidOpen
                      ? formatRelative(bidEndTs - now)
                      : formatRelative(settleTs - now)
              }
              icon={Clock}
            />
          </div>
        </div>

        {/* === Active Bond === */}
        {activeManager && activeManager !== "0x0000000000000000000000000000000000000000" && (
          <ActiveBondCard pid={ARENA_POOL_ID} mgr={activeManager} />
        )}

        {/* === 2-col grid: bidders + agent stats === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bidders */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold">Bidders · Epoch {currentEpoch ?? "—"}</div>
                <div className="text-xs text-white/50 font-mono">agents that submitted a StrategyBond</div>
              </div>
            </div>
            <div className="space-y-2">
              {bidders && bidders.length > 0 ? (
                (bidders as readonly `0x${string}`[]).map((b) => (
                  <a
                    key={b}
                    href={addrOklink(b)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg bg-bg-border hover:bg-bg-hover transition-colors text-sm font-mono"
                  >
                    <span>{b}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-white/40" />
                  </a>
                ))
              ) : (
                <div className="text-sm text-white/40 font-mono py-4 text-center">
                  No bids in this epoch yet — bidding is permissionless
                </div>
              )}
            </div>
          </div>

          {/* Agent stats */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold">YieldAgent · Lifetime Stats</div>
                <div className="text-xs text-white/50 font-mono">
                  <a
                    href={addrOklink(ARENA_FIRST_AGENT)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent"
                  >
                    {shortAddr(ARENA_FIRST_AGENT)} ↗
                  </a>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <StatBox label="Stake" value={`${formatUSDT6(agent?.stake)} USDT`} />
              <StatBox label="Reputation" value={formatRep(agent?.reputation)} />
              <StatBox label="Epochs Won" value={agent?.epochsWon?.toString() ?? "—"} />
              <StatBox label="Epochs Lost" value={agent?.epochsLost?.toString() ?? "—"} />
              <StatBox label="Total Slashed" value={`${formatUSDT6(agent?.totalSlashed)} USDT`} accent="warn" />
              <StatBox label="Total Earned" value={`${formatUSDT6(agent?.totalEarned)} USDT`} accent="accent" />
            </div>
          </div>
        </div>

        {/* === Event feed === */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-bold">Live Event Feed</div>
              <div className="text-xs text-white/50 font-mono">
                {loadingEvents ? "loading from chain…" : `${events.length} events on X Layer · refreshes every 30s`}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {events.length > 0
              ? events.slice(0, 20).map((ev, i) => <EventRow key={`${ev.txHash}-${i}`} ev={ev} />)
              : !loadingEvents && (
                  <div className="text-sm text-white/40 font-mono py-4 text-center">
                    No events yet
                  </div>
                )}
          </div>
        </div>

        {/* === Pool / Mechanism Info === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InfoCard
            icon={ShieldCheck}
            title="Pool Info"
            rows={[
              ["Pair", "USDT / WOKB"],
              ["Fee", "Dynamic (set per-swap by hook)"],
              ["Tick spacing", "60"],
              ["Hook", shortAddr(ARENA_HOOK_ADDRESS)],
              ["PoolManager", shortAddr(V4_POOL_MANAGER)],
              ["PoolId", shortHash(ARENA_POOL_ID)],
            ]}
          />
          <InfoCard
            icon={TrendingUp}
            title="How It Works"
            rows={[
              ["Epoch length", "4 hours"],
              ["Bid window", "First 5 minutes"],
              ["Slash cap", "50% of bond stake"],
              ["Min stake", "1 USDT"],
              ["Reputation range", "0.5× – 2.0×"],
              ["Election rule", "stake × promisedAPR × rep / band"],
            ]}
          />
        </div>

        {/* Footer note */}
        <div className="text-xs font-mono text-white/40 text-center pb-8">
          Built for Hook the Future Hackathon · X Layer × Uniswap × Flap · 5/22–5/28 2026
        </div>
      </main>
    </div>
  );
}

// ─── tiny components ─────────────────────────────────────────────────────

function Stat({
  label,
  value,
  icon: Icon,
  accent = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "accent" | "warn" | "neutral";
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            "w-4 h-4",
            accent === "accent" ? "text-accent" : accent === "warn" ? "text-yellow-400" : "text-white/40"
          )}
        />
        <div className="stat-label">{label}</div>
      </div>
      <div
        className={cn(
          "text-2xl font-bold font-mono",
          accent === "accent" ? "text-accent" : accent === "warn" ? "text-yellow-400" : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string;
  accent?: "accent" | "warn" | "neutral";
}) {
  return (
    <div className="p-3 rounded-lg bg-bg-border">
      <div className="stat-label mb-1">{label}</div>
      <div
        className={cn(
          "font-bold font-mono",
          accent === "accent" ? "text-accent" : accent === "warn" ? "text-yellow-400" : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: [string, string][];
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div className="font-bold">{title}</div>
      </div>
      <div className="space-y-1.5 text-sm font-mono">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between items-center py-1.5 border-b border-bg-border last:border-0">
            <span className="text-white/50">{k}</span>
            <span className="text-white">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventRow({ ev }: { ev: EventLog }) {
  const { icon: Icon, label, color } = eventStyle(ev.type);
  return (
    <a
      href={txOklink(ev.txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-bg-border hover:bg-bg-hover transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{label}</div>
          <EventSummary ev={ev} />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs font-mono text-white/40 shrink-0">
        <Hash className="w-3 h-3" />
        {shortHash(ev.txHash)}
        <ExternalLink className="w-3 h-3 group-hover:text-accent transition-colors" />
      </div>
    </a>
  );
}

function EventSummary({ ev }: { ev: EventLog }) {
  const a = ev.args;
  if (ev.type === "BidSubmitted") {
    return (
      <div className="text-xs font-mono text-white/60 truncate">
        agent {shortAddr(a.agent as string)} · APR {formatBps(a.promisedAPRBps as bigint)} · score {String(a.bidScore)}
      </div>
    );
  }
  if (ev.type === "ManagerElected") {
    return (
      <div className="text-xs font-mono text-white/60 truncate">
        manager {shortAddr(a.manager as string)} · epoch {String(a.epochId)}
      </div>
    );
  }
  if (ev.type === "EpochSettled") {
    const slashed = a.slashedAmount as bigint;
    const slashLabel =
      slashed > 0n ? `SLASH ${formatUSDT6(slashed)} USDT` : "no slash (met promise)";
    return (
      <div className="text-xs font-mono text-white/60 truncate">
        epoch {String(a.epochId)} · actual {formatBps(a.actualAPRBps as bigint)} vs promised{" "}
        {formatBps(a.promisedAPRBps as bigint)} · {slashLabel}
      </div>
    );
  }
  if (ev.type === "Slashed") {
    return (
      <div className="text-xs font-mono text-white/60 truncate">
        agent {shortAddr(a.agent as string)} · {formatUSDT6(a.amount as bigint)} USDT · {String(a.reason)}
      </div>
    );
  }
  if (ev.type === "AgentRegistered") {
    return (
      <div className="text-xs font-mono text-white/60 truncate">
        {String(a.name)} ({shortAddr(a.agent as string)}) · stake {formatUSDT6(a.stake as bigint)} USDT
      </div>
    );
  }
  return null;
}

function eventStyle(type: EventLog["type"]) {
  switch (type) {
    case "BidSubmitted":
      return { icon: Gavel, label: "Bid Submitted", color: "bg-accent/20 text-accent" };
    case "ManagerElected":
      return { icon: Crown, label: "Manager Elected", color: "bg-yellow-400/20 text-yellow-400" };
    case "EpochSettled":
      return { icon: CheckCircle2, label: "Epoch Settled", color: "bg-pink-400/20 text-pink-400" };
    case "Slashed":
      return { icon: AlertTriangle, label: "Slashed", color: "bg-red-400/20 text-red-400" };
    case "AgentRegistered":
      return { icon: Users, label: "Agent Registered", color: "bg-blue-400/20 text-blue-400" };
  }
}

function formatRelative(seconds: number): string {
  if (seconds <= 0) return "NOW";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── active bond detail card ─────────────────────────────────────────────

function ActiveBondCard({
  pid,
  mgr,
}: {
  pid: `0x${string}`;
  mgr: `0x${string}`;
}) {
  const { data: bondRaw } = useReadContract({
    address: ARENA_HOOK_ADDRESS,
    abi: ARENA_HOOK_ABI,
    functionName: "getActiveBond",
    args: [pid],
    chainId: 196,
    query: { refetchInterval: 30_000 },
  });
  // Bond struct from ABI
  const bond = bondRaw as
    | {
        agent: `0x${string}`;
        poolId: `0x${string}`;
        epochId: bigint;
        stakeAmount: bigint;
        promisedAPRBps: bigint;
        minFeeBps: number;
        maxFeeBps: number;
        maxRebalancesPerEpoch: number;
        maxTickRange: number;
        nonce: bigint;
        signature: `0x${string}`;
      }
    | undefined;

  if (!bond) return null;

  return (
    <div className="card border-accent/30 bg-gradient-to-br from-accent/5 via-transparent to-transparent">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <Crown className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold">Active StrategyBond · Epoch {bond.epochId.toString()}</div>
          <div className="text-xs text-white/50 font-mono">
            signed by{" "}
            <a href={addrOklink(mgr)} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              {shortAddr(mgr)} ↗
            </a>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <StatBox label="Promised APR" value={formatBps(bond.promisedAPRBps)} accent="accent" />
        <StatBox label="Stake Locked" value={`${formatUSDT6(bond.stakeAmount)} USDT`} />
        <StatBox label="Fee Band" value={`${(bond.minFeeBps / 100).toFixed(2)}%—${(bond.maxFeeBps / 100).toFixed(2)}%`} />
        <StatBox label="Max Rebalances" value={String(bond.maxRebalancesPerEpoch)} />
      </div>
      <div className="text-xs text-white/40 font-mono mt-4 leading-relaxed">
        Hook enforces every field of this bond in real-time. If the manager's actual APR by epoch end
        is below the promise, a proportional slice of the stake is automatically slashed → forwarded to
        the LP sink. Mechanism = audit trail; zero human intervention required.
      </div>
    </div>
  );
}
