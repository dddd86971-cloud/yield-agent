"use client";

import { Header } from "@/components/Header";
import { useState, useEffect, useMemo } from "react";
import {
  Users,
  TrendingUp,
  Trophy,
  Loader2,
  Activity,
  ExternalLink,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronDown,
  Wallet,
  LogIn,
} from "lucide-react";
import {
  fetchRecentDecisions,
  type OnchainDecision,
  poolLabelForStrategy,
} from "@/lib/onchainDecisions";
import { formatTimeAgo, cn } from "@/lib/utils";
import { CONTRACTS, TOKENS, explorerUrl } from "@/config/contracts";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";

// ============================================================================
// Types
// ============================================================================

interface StrategyInfo {
  strategyId: number;
  decisionCount: number;
  pool: string;
  lastDecision?: OnchainDecision;
  lastActionTime: number; // ms since epoch
  actionTypes: Set<string>;
}

type SortKey = "decisions" | "recent" | "id";
type FilterPool = "all" | "USDT/WOKB" | "WETH/USDT" | "other";

const PAGE_SIZE = 10;

// ============================================================================
// FollowVault ABI (minimal — only the functions we call)
// ============================================================================

const FACTORY_ABI = [
  "function vaults(uint256 strategyId) view returns (address)",
  "function getAllVaults() view returns (uint256[])",
  "function vaultCount() view returns (uint256)",
  "function createVault(uint256 strategyId, address depositToken, uint256 performanceFeeBps, string name, string symbol) returns (address)",
] as const;

const VAULT_ABI = [
  "function follow(uint256 amount) external",
  "function unfollow(uint256 shares) external",
  "function getVaultInfo() view returns (uint256, address, uint256, uint256, uint256, bool)",
  "function previewFollow(uint256 amount) view returns (uint256)",
  "function previewUnfollow(uint256 shares) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function acceptingDeposits() view returns (bool)",
] as const;

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
] as const;

// ============================================================================
// Main Page
// ============================================================================

export default function FollowPage() {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("decisions");
  const [filterPool, setFilterPool] = useState<FilterPool>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyInfo | null>(null);
  const [followAmount, setFollowAmount] = useState("");
  const [followLoading, setFollowLoading] = useState(false);
  const [followResult, setFollowResult] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  useEffect(() => {
    fetchRecentDecisions(9999)
      .then((decisions) => {
        const map = new Map<number, OnchainDecision[]>();
        for (const d of decisions) {
          const sid = Number(d.strategyId);
          if (!map.has(sid)) map.set(sid, []);
          map.get(sid)!.push(d);
        }
        const infos: StrategyInfo[] = [];
        for (const [sid, decs] of map) {
          const actions = new Set(decs.map((d) => d.action));
          infos.push({
            strategyId: sid,
            decisionCount: decs.length,
            pool: poolLabelForStrategy(BigInt(sid)),
            lastDecision: decs[0],
            lastActionTime: decs[0]?.timestampMs ?? 0,
            actionTypes: actions,
          });
        }
        setStrategies(infos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ---- Filtering + Sorting + Pagination ----

  // A strategy is "active" if it has more than 1 decision (not just a single deploy)
  const activeStrategies = useMemo(
    () => strategies.filter((s) => s.decisionCount > 1),
    [strategies]
  );
  const inactiveCount = strategies.length - activeStrategies.length;

  const filtered = useMemo(() => {
    let list = showInactive ? [...strategies] : [...activeStrategies];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          `#${s.strategyId}`.includes(q) ||
          s.pool.toLowerCase().includes(q) ||
          (s.lastDecision?.action ?? "").toLowerCase().includes(q)
      );
    }

    // Pool filter
    if (filterPool !== "all") {
      if (filterPool === "other") {
        list = list.filter(
          (s) => !s.pool.includes("USDT/WOKB") && !s.pool.includes("WETH/USDT")
        );
      } else {
        list = list.filter((s) => s.pool.includes(filterPool));
      }
    }

    // Sort
    if (sortBy === "decisions") {
      list.sort((a, b) => b.decisionCount - a.decisionCount);
    } else if (sortBy === "recent") {
      list.sort((a, b) => b.lastActionTime - a.lastActionTime);
    } else {
      list.sort((a, b) => b.strategyId - a.strategyId);
    }

    return list;
  }, [strategies, activeStrategies, showInactive, search, sortBy, filterPool]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalDecisions = strategies.reduce((s, a) => s + a.decisionCount, 0);

  // ---- Follow handler ----
  const handleFollow = async (strategy: StrategyInfo) => {
    if (!isConnected) {
      connect({ connector: injected() });
      return;
    }
    setSelectedStrategy(strategy);
    setFollowAmount("");
    setFollowResult(null);
  };

  const confirmFollow = async () => {
    if (!selectedStrategy || !followAmount || !address) return;
    setFollowLoading(true);
    setFollowResult(null);

    try {
      const amount = parseFloat(followAmount);
      if (isNaN(amount) || amount <= 0) {
        setFollowResult("Invalid amount");
        setFollowLoading(false);
        return;
      }

      // Use ethers for contract interaction (via window.ethereum)
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const factory = new ethers.Contract(
        CONTRACTS[196].followVaultFactory,
        FACTORY_ABI,
        signer
      );

      // Check if vault exists for this strategy
      let vaultAddr = await factory.vaults(selectedStrategy.strategyId);

      if (vaultAddr === "0x0000000000000000000000000000000000000000") {
        // Create vault first
        setFollowResult("Creating vault for Strategy #" + selectedStrategy.strategyId + "...");
        const createTx = await factory.createVault(
          selectedStrategy.strategyId,
          TOKENS.USDT,
          1000, // 10% performance fee
          `Follow Strategy #${selectedStrategy.strategyId}`,
          `fYA-${selectedStrategy.strategyId}`
        );
        await createTx.wait();
        vaultAddr = await factory.vaults(selectedStrategy.strategyId);
      }

      // Approve USDT
      const usdt = new ethers.Contract(TOKENS.USDT, ERC20_ABI, signer);
      const amountWei = ethers.parseUnits(followAmount, 6); // USDT = 6 decimals

      setFollowResult("Approving USDT...");
      const allowance = await usdt.allowance(address, vaultAddr);
      if (allowance < amountWei) {
        const approveTx = await usdt.approve(vaultAddr, amountWei);
        await approveTx.wait();
      }

      // Follow (deposit)
      setFollowResult("Depositing into vault...");
      const vault = new ethers.Contract(vaultAddr, VAULT_ABI, signer);
      const followTx = await vault.follow(amountWei);
      const receipt = await followTx.wait();

      setFollowResult(
        `✅ Successfully followed Strategy #${selectedStrategy.strategyId}! TX: ${receipt.hash.slice(0, 10)}...`
      );
    } catch (err: any) {
      console.error("[Follow] error:", err);
      setFollowResult(`❌ ${err?.reason || err?.message?.slice(0, 100) || "Transaction failed"}`);
    } finally {
      setFollowLoading(false);
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Trophy className="w-9 h-9 text-accent" />
            Agent Leaderboard
          </h1>
          <p className="text-white/60 max-w-2xl">
            AI agents running live on X Layer. FollowVault copy-trading lets
            you mirror their strategies automatically.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Active Strategies"
            value={loading ? null : String(activeStrategies.length)}
            sub={`${strategies.length} total on-chain`}
          />
          <StatCard
            label="Total Decisions"
            value={loading ? null : String(totalDecisions)}
            sub="DecisionLogger"
            accent
          />
          <StatCard label="Followers" value="0" sub="be the first" dim />
          <StatCard label="Total TVL" value="$0" sub="FollowVault" dim />
        </div>

        {/* FollowVault status */}
        <div className="p-4 rounded-xl bg-accent/5 border border-accent/20 text-sm font-mono">
          <div className="flex items-center gap-2 text-accent mb-1 font-bold">
            <Activity className="w-4 h-4" />
            FollowVault — Deployed, Ready for Followers
          </div>
          <div className="text-white/60">
            Factory at{" "}
            <a
              href={explorerUrl(196, CONTRACTS[196].followVaultFactory)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {CONTRACTS[196].followVaultFactory.slice(0, 6)}...{CONTRACTS[196].followVaultFactory.slice(-4)}
              <ExternalLink className="w-3 h-3 inline ml-1" />
            </a>{" "}
            — Connect wallet and deposit USDT to follow any strategy.
          </div>
        </div>

        {/* Search + Filter + Sort Bar */}
        <div className="card">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-5">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold">Live Strategies</div>
                <div className="text-xs text-white/50 font-mono">
                  {filtered.length} strategies · {totalDecisions} decisions on-chain
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 md:flex-initial">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search #ID or pool..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-bg border border-bg-border focus:border-accent/50 outline-none w-full md:w-44"
                />
              </div>

              {/* Pool filter */}
              <select
                value={filterPool}
                onChange={(e) => { setFilterPool(e.target.value as FilterPool); setPage(0); }}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-bg border border-bg-border focus:border-accent/50 outline-none cursor-pointer"
              >
                <option value="all">All Pools</option>
                <option value="USDT/WOKB">USDT/WOKB</option>
                <option value="WETH/USDT">WETH/USDT</option>
                <option value="other">Other</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as SortKey); setPage(0); }}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-bg border border-bg-border focus:border-accent/50 outline-none cursor-pointer"
              >
                <option value="decisions">Most Decisions</option>
                <option value="recent">Most Recent</option>
                <option value="id">Newest Strategy</option>
              </select>

              {/* Show inactive toggle */}
              {inactiveCount > 0 && (
                <button
                  onClick={() => { setShowInactive((v) => !v); setPage(0); }}
                  className={cn(
                    "px-2.5 py-1.5 text-xs rounded-lg border transition-colors",
                    showInactive
                      ? "bg-white/10 border-white/20 text-white/70"
                      : "bg-bg border-bg-border text-white/40 hover:text-white/60"
                  )}
                >
                  {showInactive ? `Hide ${inactiveCount} inactive` : `+${inactiveCount} inactive`}
                </button>
              )}
            </div>
          </div>

          {/* Strategy List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 rounded-xl bg-bg border border-bg-border animate-pulse">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-bg-border" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-bg-border rounded w-1/3" />
                      <div className="h-3 bg-bg-border rounded w-2/3" />
                    </div>
                    <div className="h-10 w-28 bg-bg-border rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              {search || filterPool !== "all"
                ? "No strategies match your filter"
                : "No strategies found on chain"}
            </div>
          ) : (
            <div className="space-y-3">
              {paged.map((s, idx) => {
                const rank = page * PAGE_SIZE + idx + 1;
                const isTop3 = rank <= 3 && sortBy === "decisions" && !search && filterPool === "all" && !showInactive;
                const isInactive = s.decisionCount <= 1;
                return (
                  <div
                    key={s.strategyId}
                    className={cn(
                      "p-4 md:p-5 rounded-xl bg-bg border transition-colors",
                      isInactive
                        ? "border-white/5 opacity-50"
                        : isTop3
                        ? "border-accent/30 bg-accent/5"
                        : "border-bg-border hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center gap-3 md:gap-5">
                      {/* Rank + ID */}
                      <div
                        className={cn(
                          "w-11 h-11 rounded-xl flex items-center justify-center font-bold font-mono text-base flex-shrink-0",
                          isInactive
                            ? "bg-white/5 text-white/30"
                            : isTop3
                            ? "bg-accent/20 text-accent"
                            : "bg-white/5 text-white/50"
                        )}
                      >
                        {sortBy === "decisions" && !search && filterPool === "all"
                          ? `#${rank}`
                          : `#${s.strategyId}`}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-bold text-sm">Strategy #{s.strategyId}</span>
                          <span className="badge-neutral text-[10px]">{s.pool}</span>
                          {isInactive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-bold">
                              INACTIVE
                            </span>
                          )}
                          {!isInactive && isTop3 && rank === 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold">
                              TOP
                            </span>
                          )}
                        </div>
                        {s.lastDecision && (
                          <div className="text-[11px] text-white/40 font-mono truncate">
                            {s.lastDecision.action} ({formatTimeAgo(s.lastDecision.timestampMs)}) — {s.lastDecision.reasoning.slice(0, 60)}...
                          </div>
                        )}
                      </div>

                      {/* Stats (desktop) */}
                      <div className="hidden md:flex items-center gap-5 text-right">
                        <div>
                          <div className="text-[10px] text-white/40 uppercase">Decisions</div>
                          <div className={cn("text-lg font-bold font-mono", isTop3 ? "text-accent" : "text-white")}>
                            {s.decisionCount}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-white/40 uppercase">TVL</div>
                          <div className="text-lg font-bold font-mono text-white/30">$0</div>
                        </div>
                      </div>

                      {/* Follow button */}
                      <button
                        onClick={() => handleFollow(s)}
                        className={cn(
                          "px-4 py-2 text-xs rounded-xl font-bold transition-all flex-shrink-0",
                          isConnected
                            ? "bg-accent text-bg hover:bg-accent-dim"
                            : "bg-accent/20 text-accent hover:bg-accent/30"
                        )}
                      >
                        {isConnected ? (
                          <>
                            <Wallet className="w-3.5 h-3.5 inline mr-1" />
                            Follow
                          </>
                        ) : (
                          <>
                            <LogIn className="w-3.5 h-3.5 inline mr-1" />
                            Connect
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
              <span className="text-xs text-white/40">
                Page {page + 1} of {totalPages} ({filtered.length} strategies)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 text-xs rounded-lg bg-bg-border text-white/60 disabled:opacity-30 hover:bg-bg-hover"
                >
                  Prev
                </button>
                {/* Page number buttons (show max 5) */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pageNum =
                    totalPages <= 5
                      ? i
                      : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "w-7 h-7 text-xs rounded-lg font-mono",
                        pageNum === page
                          ? "bg-accent text-bg font-bold"
                          : "bg-bg-border text-white/60 hover:bg-bg-hover"
                      )}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 text-xs rounded-lg bg-bg-border text-white/60 disabled:opacity-30 hover:bg-bg-hover"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="card">
          <div className="font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent" />
            How Copy-Trading Works
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <Step n={1} title="Pick a Strategy" desc="Browse the leaderboard, filter by pool or sort by decisions. Click Follow on any strategy." />
            <Step n={2} title="Deposit USDT" desc="Approve and deposit USDT into the FollowVault. You receive vault shares representing your stake." />
            <Step n={3} title="Auto-mirror + Withdraw" desc="The vault mirrors agent LP positions. Withdraw anytime — agent takes 10% of profit, you keep 90%." />
          </div>
        </div>

        {/* Follow Modal */}
        {selectedStrategy && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-bg-card border border-bg-border rounded-2xl p-6 w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">
                  Follow Strategy #{selectedStrategy.strategyId}
                </h3>
                <button
                  onClick={() => setSelectedStrategy(null)}
                  className="text-white/40 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="text-sm text-white/60 space-y-1">
                <div>Pool: <span className="text-white font-mono">{selectedStrategy.pool}</span></div>
                <div>Decisions: <span className="text-accent font-mono">{selectedStrategy.decisionCount}</span></div>
                <div>Performance fee: <span className="text-white font-mono">10%</span> of profit</div>
              </div>

              <div>
                <label className="text-xs text-white/40 block mb-1">Deposit Amount (USDT)</label>
                <input
                  type="number"
                  value={followAmount}
                  onChange={(e) => setFollowAmount(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full px-3 py-2.5 rounded-lg bg-bg border border-bg-border focus:border-accent/50 outline-none font-mono"
                  min="0.01"
                  step="0.01"
                />
              </div>

              {followResult && (
                <div
                  className={cn(
                    "text-xs p-3 rounded-lg font-mono break-words",
                    followResult.startsWith("✅")
                      ? "bg-accent/10 text-accent"
                      : followResult.startsWith("❌")
                      ? "bg-red-500/10 text-red-400"
                      : "bg-white/5 text-white/60"
                  )}
                >
                  {followResult}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={confirmFollow}
                  disabled={followLoading || !followAmount}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-bg font-bold text-sm hover:bg-accent-dim disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {followLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      Approve & Follow
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedStrategy(null)}
                  className="px-4 py-2.5 rounded-xl bg-bg-border text-white/60 font-bold text-sm hover:bg-bg-hover"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[10px] text-white/30 text-center">
                Your browser wallet signs USDT approval + vault deposit.
                Agent operations are handled by the TEE Agentic Wallet.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  label,
  value,
  sub,
  accent,
  dim,
}: {
  label: string;
  value: string | null;
  sub: string;
  accent?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="card">
      <div className="stat-label mb-1">{label}</div>
      <div
        className={cn(
          "text-2xl md:text-3xl font-bold font-mono",
          accent ? "text-accent" : dim ? "text-white/30" : "text-white"
        )}
      >
        {value === null ? <Loader2 className="w-6 h-6 animate-spin" /> : value}
      </div>
      <div className="text-xs text-white/40 font-mono mt-1">{sub}</div>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="p-4 bg-bg rounded-xl border border-bg-border">
      <div className="text-xs uppercase tracking-wider text-accent font-mono mb-1">Step {n}</div>
      <div className="font-bold mb-1">{title}</div>
      <div className="text-sm text-white/60">{desc}</div>
    </div>
  );
}
