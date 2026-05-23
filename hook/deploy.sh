#!/usr/bin/env bash
# AgentArena Hook — one-shot deployment to X Layer mainnet.
#
# Pre-requisites:
#   1. ./setup.sh ran successfully (forge build passes)
#   2. .env file with DEPLOYER_PK and AGENT_PK
#   3. Deployer wallet has ≥ 0.01 OKB on X Layer for gas
#   4. Agent wallet has ≥ 1000 USDT on X Layer for initial stake
#
# Run:
#   ./deploy.sh             # full broadcast to mainnet
#   ./deploy.sh --dry-run   # simulate only, no real tx

set -euo pipefail

cd "$(dirname "$0")"

DRY_RUN=""
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN="--dry-run"
  BROADCAST_FLAG=""
  echo "🧪 DRY-RUN MODE — no real transactions will be broadcast"
else
  BROADCAST_FLAG="--broadcast --slow"
  echo "🚀 LIVE MODE — broadcasting real transactions to X Layer mainnet"
fi

# ── env ────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "❌ .env file not found. Create it first:"
  echo ""
  echo "   cat > .env <<EOF"
  echo "   DEPLOYER_PK=0x..."
  echo "   AGENT_PK=0x..."
  echo "   INITIAL_STAKE=1000000000  # 1000 USDT in wei (6 decimals)"
  echo "   EOF"
  exit 1
fi
# shellcheck disable=SC1091
set -a
. ./.env
set +a
: "${DEPLOYER_PK:?DEPLOYER_PK not set in .env}"
: "${AGENT_PK:?AGENT_PK not set in .env}"
: "${INITIAL_STAKE:=1000000000}"  # 1000 USDT default

export PATH="$HOME/.foundry/bin:$PATH"

# Derive addresses from keys (without exposing keys)
DEPLOYER_ADDR=$(cast wallet address --private-key "$DEPLOYER_PK")
AGENT_ADDR=$(cast wallet address --private-key "$AGENT_PK")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AgentArena Hook — deployment script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  RPC:          https://rpc.xlayer.tech (X Layer mainnet, chain 196)"
echo "  Deployer:     $DEPLOYER_ADDR"
echo "  Agent:        $AGENT_ADDR"
echo "  Initial stake: $INITIAL_STAKE wei (≈ $((INITIAL_STAKE / 1000000)) USDT)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$DRY_RUN" ]; then
  # Show OKB balance + warn if low
  BAL_WEI=$(cast balance "$DEPLOYER_ADDR" --rpc-url https://rpc.xlayer.tech 2>/dev/null || echo 0)
  if [ "$BAL_WEI" = "0" ]; then
    echo "⚠️  WARNING: deployer balance is 0 OKB. Send at least 0.01 OKB to:"
    echo "   $DEPLOYER_ADDR"
    exit 1
  fi
fi

# ── STEP 1: Deploy Hook + Registry ─────────────────────────────────────
echo "━━━ Step 1/3: Deploy AgentRegistry + AgentArenaHook ━━━"
echo ""

forge script script/DeployHook.s.sol \
  --rpc-url https://rpc.xlayer.tech \
  $BROADCAST_FLAG \
  --private-key "$DEPLOYER_PK" \
  2>&1 | tee /tmp/agentarena-deploy.log | tail -30

# Parse deployed addresses from log
REGISTRY_ADDR=$(grep "AgentRegistry:" /tmp/agentarena-deploy.log | tail -1 | awk '{print $NF}')
HOOK_ADDR=$(grep "AgentArenaHook deployed at:" /tmp/agentarena-deploy.log | awk '{print $NF}')

if [ -z "$REGISTRY_ADDR" ] || [ -z "$HOOK_ADDR" ]; then
  echo ""
  echo "❌ Failed to parse deployed addresses from log. Aborting."
  exit 1
fi

echo ""
echo "✅ Step 1 done. REGISTRY_ADDR=$REGISTRY_ADDR  HOOK_ADDR=$HOOK_ADDR"
echo ""

# In dry-run, skip Steps 2+3 since the hook isn't actually deployed on-chain
# so PoolManager would reject the (nonexistent) hook. Fork test covers this.
if [ -n "$DRY_RUN" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🧪 DRY-RUN COMPLETE for Step 1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Steps 2 (InitPool) + 3 (RegisterAgent) require a real deployed hook"
  echo "  on-chain to succeed — they would fail in dry-run mode because"
  echo "  PoolManager.initialize() needs to invoke the hook's afterInitialize."
  echo ""
  echo "  Full end-to-end flow is verified by test/ForkDeployment.t.sol"
  echo "  (passes 3/3 on real X Layer mainnet fork @ block 60735890)."
  echo ""
  echo "  Mined addresses (would be deployed for real):"
  echo "  · AgentRegistry:  $REGISTRY_ADDR"
  echo "  · AgentArenaHook: $HOOK_ADDR"
  echo ""
  echo "  Gas estimate (Step 1 alone): ~5,050,658 gas ≈ 0.0003 OKB"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
fi

# ── STEP 2: Initialize V4 Pool ─────────────────────────────────────────
echo "━━━ Step 2/3: Initialize V4 USDT/WOKB Pool ━━━"
echo ""

HOOK_ADDR="$HOOK_ADDR" forge script script/InitPool.s.sol \
  --rpc-url https://rpc.xlayer.tech \
  $BROADCAST_FLAG \
  --private-key "$DEPLOYER_PK" \
  2>&1 | tee /tmp/agentarena-init.log | tail -20

# PoolId is logged as a bytes32 in the script output
POOL_ID=$(grep "0x" /tmp/agentarena-init.log | grep -oE "0x[0-9a-f]{64}" | tail -1)

if [ -z "$POOL_ID" ]; then
  echo ""
  echo "❌ Failed to parse PoolId from log. Aborting."
  exit 1
fi

echo ""
echo "✅ Step 2 done. POOL_ID=$POOL_ID"
echo ""

# ── STEP 3: Register YieldAgent + Submit First Bid ─────────────────────
echo "━━━ Step 3/3: Register YieldAgent + Submit StrategyBond ━━━"
echo ""

REGISTRY_ADDR="$REGISTRY_ADDR" HOOK_ADDR="$HOOK_ADDR" POOL_ID="$POOL_ID" INITIAL_STAKE="$INITIAL_STAKE" \
forge script script/RegisterAgent.s.sol \
  --rpc-url https://rpc.xlayer.tech \
  $BROADCAST_FLAG \
  --private-key "$AGENT_PK" \
  2>&1 | tee /tmp/agentarena-register.log | tail -20

echo ""
echo "✅ All steps complete!"
echo ""

# ── SUMMARY ────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎉 AgentArena Hook is LIVE on X Layer Mainnet"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AgentRegistry:   $REGISTRY_ADDR"
echo "  AgentArenaHook:  $HOOK_ADDR"
echo "  PoolId:          $POOL_ID"
echo ""
echo "  Verify on OKLink:"
echo "  https://www.oklink.com/xlayer/address/$REGISTRY_ADDR"
echo "  https://www.oklink.com/xlayer/address/$HOOK_ADDR"
echo ""
echo "  Next steps:"
echo "  1. Wait for bid phase to close (5 min)"
echo "  2. Anyone can call hook.runElection(PoolId.wrap($POOL_ID))"
echo "  3. Update SUBMISSION.md with these addresses"
echo "  4. Tweet from @YieldAgent_Aiz with OKLink links"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
