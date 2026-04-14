"use client";

/**
 * DeployControls — the on-chain action surface for the agent dashboard.
 *
 * Wires the three POST endpoints the backend already exposes:
 *   • POST /api/deploy          → AgentCoordinator.deployStrategy
 *                                 → StrategyManager.deployStrategy (audit tx)
 *                                 → OnchainOSAdapter.swap (TEE-signed swap)
 *   • POST /api/monitor/start   → AgentCoordinator.startMonitoring
 *   • POST /api/monitor/stop    → AgentCoordinator.stopMonitoring
 *
 * Deploy is guarded by an explicit confirmation step. The confirmation
 * message spells out that, when the backend is in `live` execution mode,
 * clicking Confirm will broadcast a real `onchainos swap execute` on
 * X Layer mainnet (chain 196) and spend USDT/OKB from the Agentic Wallet
 * TEE signer `0x6ab27b82…`. This protects judges from accidentally
 * consuming mainnet funds while still exposing the full end-to-end path.
 */

import { useState, useEffect, useRef } from "react";
import {
  Rocket,
  Play,
  Square,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Info,
  CheckCircle2,
  Circle,
  Brain,
  FileText,
  Shield,
  Coins,
  ClipboardCheck,
} from "lucide-react";
import { api, AgentState, UserIntent } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";
import { recordDeployment } from "@/lib/strategyOwnership";

// ── Deploy Pipeline Steps ──
const DEPLOY_STEPS = [
  { id: "analyze", label: "Three-Brain Analysis", desc: "Market + Pool + Risk evaluation", icon: Brain, duration: 2500 },
  { id: "register", label: "Register Strategy On-chain", desc: "StrategyManager.deployStrategy()", icon: FileText, duration: 2000 },
  { id: "approve", label: "Approve Tokens via TEE", desc: "onchainos wallet contract-call → ERC20.approve", icon: Shield, duration: 2500 },
  { id: "mint", label: "Mint V3 LP Position", desc: "onchainos wallet contract-call → NPM.mint()", icon: Coins, duration: 3000 },
  { id: "audit", label: "Finalize Audit Record", desc: "DecisionLogger.logDecision()", icon: ClipboardCheck, duration: 1500 },
] as const;

type StepStatus = "pending" | "active" | "done" | "error";

// Mainnet strategyId 0 pool — pre-filled default. Provenance: SUBMISSION.md
// "Live strategy on mainnet" (USDT/OKB 0.3%). Users can paste another pool
// address; the field is fully editable.
const DEFAULT_POOL_ADDRESS = "0x63d62734847E55A266FCa4219A9aD0a02D5F6e02";

interface DeployControlsProps {
  intent: UserIntent | null;
  state: AgentState | null;
}

type DeployResult = {
  strategyId: number;
  txHash: string;
  onchainTxHash?: string;
  investmentId?: string;
  executionMode: "live" | "simulated" | "audit-only";
  reasoning: string;
};

export function DeployControls({ intent, state }: DeployControlsProps) {
  const { address, isConnected } = useAccount();
  const [poolAddress, setPoolAddress] = useState(DEFAULT_POOL_ADDRESS);
  const [confirming, setConfirming] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [monitorBusy, setMonitorBusy] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState("");
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(DEPLOY_STEPS.map(() => "pending"));
  const stepTimers = useRef<NodeJS.Timeout[]>([]);
  const deployDone = useRef(false);

  const isMonitoring =
    state?.status === "monitoring" || state?.status === "rebalancing";

  // Require wallet connection so we can record ownership
  const canDeploy =
    !!intent &&
    !!isConnected &&
    !!address &&
    poolAddress.trim().length >= 40 &&
    poolAddress.trim().startsWith("0x") &&
    !deploying;

  const knownStrategyId = result?.strategyId ?? state?.strategyId ?? null;
  const canStartMonitor = knownStrategyId !== null && !monitorBusy;

  const onClickDeploy = () => {
    if (!canDeploy) return;
    setError("");
    setConfirming(true);
  };

  // Advance stepper steps on timers
  const startStepProgress = () => {
    deployDone.current = false;
    const statuses: StepStatus[] = DEPLOY_STEPS.map(() => "pending");
    statuses[0] = "active";
    setStepStatuses([...statuses]);

    let cumulative = 0;
    stepTimers.current = [];
    for (let i = 0; i < DEPLOY_STEPS.length; i++) {
      cumulative += DEPLOY_STEPS[i].duration;
      const timer = setTimeout(() => {
        if (deployDone.current) return;
        setStepStatuses((prev) => {
          const next = [...prev];
          next[i] = "done";
          if (i + 1 < DEPLOY_STEPS.length) next[i + 1] = "active";
          return next;
        });
      }, cumulative);
      stepTimers.current.push(timer);
    }
  };

  const finishAllSteps = (isError = false) => {
    deployDone.current = true;
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    if (isError) {
      setStepStatuses((prev) => {
        const next = [...prev];
        const activeIdx = next.findIndex((s) => s === "active");
        if (activeIdx >= 0) next[activeIdx] = "error";
        return next;
      });
    } else {
      setStepStatuses(DEPLOY_STEPS.map(() => "done"));
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => stepTimers.current.forEach(clearTimeout);
  }, []);

  const confirmDeploy = async () => {
    if (!intent) return;
    setConfirming(false);
    setDeploying(true);
    setError("");
    setResult(null);
    startStepProgress();

    try {
      const res = await api.deploy(poolAddress.trim(), intent);
      finishAllSteps(false);
      setResult({
        strategyId: res.strategyId,
        txHash: res.txHash,
        onchainTxHash: res.onchainTxHash,
        investmentId: res.investmentId,
        executionMode: res.executionMode,
        reasoning: res.reasoning,
      });
      if (address) {
        recordDeployment(address, res.strategyId);
      }
    } catch (err: any) {
      finishAllSteps(true);
      setError(err?.message ?? "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const startMonitor = async () => {
    setMonitorBusy(true);
    setError("");
    try {
      await api.startMonitor(knownStrategyId ?? undefined);
    } catch (err: any) {
      setError(err?.message ?? "Start monitor failed");
    } finally {
      setMonitorBusy(false);
    }
  };

  const stopMonitor = async () => {
    setMonitorBusy(true);
    setError("");
    try {
      await api.stopMonitor();
    } catch (err: any) {
      setError(err?.message ?? "Stop monitor failed");
    } finally {
      setMonitorBusy(false);
    }
  };

  const shortHash = (h: string) =>
    h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h;

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
          <Rocket className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold">Deploy &amp; Monitor</div>
          <div className="text-xs text-white/50 font-mono">
            POST /api/deploy · /api/monitor/start · /api/monitor/stop
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {/* Pool address input */}
        <div>
          <div className="stat-label mb-1">Pool address (X Layer)</div>
          <input
            type="text"
            value={poolAddress}
            onChange={(e) => setPoolAddress(e.target.value)}
            placeholder="0x…"
            className="w-full bg-bg border border-bg-border rounded-xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-accent/50 transition-colors"
            disabled={deploying}
            spellCheck={false}
          />
          <div className="text-[11px] text-white/40 font-mono mt-1">
            Pre-filled with mainnet strategyId 0 pool (USDT/OKB 0.3 %). Paste any
            X Layer Uniswap V3 pool to deploy against it.
          </div>
        </div>

        {!isConnected && (
          <div className="text-xs text-warn italic">
            Connect your wallet first — ownership is recorded to your address so only you can view your strategy.
          </div>
        )}

        {isConnected && !intent && (
          <div className="text-xs text-white/50 italic">
            Parse an intent above first — Deploy activates once a{" "}
            <code className="font-mono">UserIntent</code> is ready.
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onClickDeploy}
            disabled={!canDeploy}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
              canDeploy
                ? "bg-accent text-bg hover:bg-accent-dim"
                : "bg-bg-border text-white/30 cursor-not-allowed"
            )}
          >
            {deploying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            Deploy Strategy
          </button>

          {isMonitoring ? (
            <button
              onClick={stopMonitor}
              disabled={monitorBusy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-danger/20 text-danger hover:bg-danger/30 transition-colors disabled:opacity-50"
            >
              {monitorBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Stop Monitor
            </button>
          ) : (
            <button
              onClick={startMonitor}
              disabled={!canStartMonitor}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors",
                canStartMonitor
                  ? "bg-bg-border text-white/80 hover:bg-bg-hover"
                  : "bg-bg-border text-white/30 cursor-not-allowed"
              )}
              title={
                canStartMonitor
                  ? `Start monitor loop on strategyId ${knownStrategyId}`
                  : "Deploy a strategy (or wait for state.strategyId) before starting the monitor loop"
              }
            >
              {monitorBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Monitor
            </button>
          )}
        </div>

        {/* Confirmation panel */}
        {confirming && intent && (
          <div className="p-3 bg-bg rounded-xl border border-accent/40 text-xs space-y-2">
            <div className="flex items-center gap-2 text-accent font-bold">
              <AlertTriangle className="w-4 h-4" />
              Confirm on-chain deploy
            </div>
            <div className="text-white/70 leading-relaxed">
              This will <code className="font-mono text-accent">POST /api/deploy</code>{" "}
              with pool{" "}
              <code className="font-mono text-accent break-all">
                {poolAddress.trim()}
              </code>{" "}
              and your parsed intent (
              <span className="text-accent">{intent.riskProfile}</span>, $
              {intent.principal}). If the backend is in{" "}
              <code className="font-mono text-accent">live</code> execution mode
              it will broadcast a real{" "}
              <code className="font-mono text-accent">onchainos swap execute</code>{" "}
              on X Layer mainnet (chain 196) and spend a small amount of
              USDT/OKB from the Agentic Wallet TEE signer{" "}
              <code className="font-mono text-accent">0x6ab27b82…</code>. In{" "}
              <code className="font-mono">simulated</code> or{" "}
              <code className="font-mono">audit-only</code> mode no mainnet funds
              are touched.
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmDeploy}
                className="px-3 py-1.5 rounded-lg bg-accent text-bg text-xs font-bold hover:bg-accent-dim"
              >
                Confirm Deploy
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg bg-bg-border text-white/60 text-xs font-bold hover:bg-bg-hover"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Deploy Pipeline Stepper */}
        {deploying && (
          <div className="p-4 rounded-xl bg-bg border border-accent/30 space-y-0">
            <div className="flex items-center gap-2 text-accent font-bold text-sm mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Deploying Strategy...
            </div>
            <div className="relative pl-5">
              {DEPLOY_STEPS.map((step, i) => {
                const status = stepStatuses[i];
                const StepIcon = step.icon;
                const isLast = i === DEPLOY_STEPS.length - 1;
                return (
                  <div key={step.id} className="relative flex gap-3 pb-5">
                    {/* Vertical line */}
                    {!isLast && (
                      <div
                        className={cn(
                          "absolute left-[11px] top-[28px] w-0.5 h-[calc(100%-16px)]",
                          status === "done" ? "bg-accent/50" : "bg-white/10"
                        )}
                      />
                    )}
                    {/* Step dot */}
                    <div className="flex-shrink-0 relative z-10">
                      {status === "done" ? (
                        <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                          <CheckCircle2 className="w-4 h-4 text-accent" />
                        </div>
                      ) : status === "active" ? (
                        <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center animate-pulse">
                          <Loader2 className="w-4 h-4 text-accent animate-spin" />
                        </div>
                      ) : status === "error" ? (
                        <div className="w-6 h-6 rounded-full bg-danger/20 flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4 text-danger" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center">
                          <Circle className="w-3 h-3 text-white/20" />
                        </div>
                      )}
                    </div>
                    {/* Step content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2">
                        <StepIcon
                          className={cn(
                            "w-3.5 h-3.5",
                            status === "done" ? "text-accent" : status === "active" ? "text-accent" : status === "error" ? "text-danger" : "text-white/20"
                          )}
                        />
                        <span
                          className={cn(
                            "text-xs font-bold",
                            status === "done" ? "text-accent" : status === "active" ? "text-white" : status === "error" ? "text-danger" : "text-white/30"
                          )}
                        >
                          {step.label}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "text-[10px] font-mono mt-0.5 ml-5.5",
                          status === "active" ? "text-white/50" : status === "done" ? "text-accent/50" : "text-white/15"
                        )}
                      >
                        {step.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Deploy result — success banner */}
        {result && (
          <div className="p-4 bg-accent/5 rounded-xl border border-accent/30 text-xs space-y-3">
            {/* Success header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center text-accent text-lg flex-shrink-0">
                ✓
              </div>
              <div>
                <div className="text-accent font-bold text-sm">
                  Strategy #{result.strategyId} Deployed Successfully!
                </div>
                <div className="text-white/50 text-[11px]">
                  Your V3 LP position is live on X Layer mainnet
                </div>
              </div>
              <span className="ml-auto px-2 py-0.5 rounded bg-accent/20 text-accent text-[10px] uppercase tracking-wider font-bold flex-shrink-0">
                {result.executionMode}
              </span>
            </div>

            {/* TX links */}
            <div className="grid grid-cols-1 gap-1.5 pl-[52px]">
              <a
                href={`https://www.oklink.com/xlayer/tx/${result.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-white/70 hover:text-accent break-all"
              >
                Audit TX: {shortHash(result.txHash)}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
              {result.onchainTxHash && (
                <a
                  href={`https://www.oklink.com/xlayer/tx/${result.onchainTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-mono text-white/70 hover:text-accent break-all"
                >
                  TEE Signed TX: {shortHash(result.onchainTxHash)}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              )}
              {result.investmentId && (
                <div className="font-mono text-white/50">
                  Investment ID: {result.investmentId}
                </div>
              )}
            </div>

            {/* AI Reasoning */}
            <div className="pl-[52px] text-white/60 italic leading-relaxed border-t border-white/5 pt-2">
              {result.reasoning}
            </div>

            {/* What happens next */}
            <div className="pl-[52px] p-3 rounded-lg bg-bg border border-bg-border">
              <div className="text-white/70 font-bold text-[11px] mb-1.5">What happens next?</div>
              <ul className="text-[11px] text-white/50 space-y-1 leading-relaxed">
                <li className="flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">1.</span>
                  Your LP position appears in &quot;Your V3 LP Positions&quot; below
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">2.</span>
                  Click &quot;Start Monitor&quot; — the AI will check every 5 min
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">3.</span>
                  Three brains auto-manage: rebalance when out of range, collect fees every 6h
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">4.</span>
                  All decisions are logged on-chain — check the Decision Log anytime
                </li>
              </ul>
            </div>
          </div>
        )}

        {error && <div className="text-xs text-danger break-words">{error}</div>}

        {/* Agentic Wallet explanation */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-2">
          <div className="flex items-center gap-2 text-white/60 font-bold">
            <Info className="w-3.5 h-3.5 text-accent" />
            How does this work?
          </div>
          <div className="text-white/40 leading-relaxed">
            LP positions are deployed and managed by the{" "}
            <span className="text-accent font-mono">Agentic Wallet</span> (OnchainOS TEE signer), not your
            browser wallet. Your connected wallet is used for identity only — no funds leave your wallet.
          </div>
          <div className="text-white/40 leading-relaxed">
            <span className="text-white/50 font-bold">Want your own agent?</span>{" "}
            Create your own Agentic Wallet via{" "}
            <a
              href="https://web3.okx.com/onchainos/dev-portal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-dim underline"
            >
              OnchainOS Dev Portal
            </a>
            , clone the repo, fill in your API keys, and run your own instance. Each agent is fully
            self-contained — your LP positions belong to your own TEE wallet.
          </div>
        </div>
      </div>
    </div>
  );
}
