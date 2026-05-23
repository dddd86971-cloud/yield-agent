#!/usr/bin/env bash
# AgentArena Hook — initial setup
# Installs Uniswap v4-core + v4-periphery + OZ + forge-std, then runs forge build.

set -euo pipefail

cd "$(dirname "$0")"

echo "📦 Installing Uniswap V4 + OpenZeppelin + forge-std..."

# Idempotent installs (skip if already present)
[ -d lib/v4-core ]               || forge install Uniswap/v4-core --no-commit
[ -d lib/v4-periphery ]          || forge install Uniswap/v4-periphery --no-commit
[ -d lib/openzeppelin-contracts ] || forge install OpenZeppelin/openzeppelin-contracts --no-commit
[ -d lib/forge-std ]             || forge install foundry-rs/forge-std --no-commit

echo ""
echo "🛠️  Building contracts..."
forge build

echo ""
echo "✅ Setup complete."
echo ""
echo "Next steps:"
echo "  1. Set env: DEPLOYER_PK=0x... (in .env)"
echo "  2. Deploy:  forge script script/DeployHook.s.sol --rpc-url xlayer --broadcast"
echo "  3. Then run RegisterAgent.s.sol with AGENT_PK + HOOK_ADDR + POOL_ID"
