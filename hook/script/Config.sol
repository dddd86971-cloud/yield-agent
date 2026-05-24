// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  Config — X Layer V4 deployment constants
/// @notice Pinned to verified Uniswap V4 deployment on X Layer mainnet (chainId 196).
library Config {
    // ─────────────────────────────────────────────────────────────────────
    // Uniswap V4 on X Layer mainnet (verified 2026-05)
    // ─────────────────────────────────────────────────────────────────────

    address internal constant POOL_MANAGER          = 0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32;
    address internal constant POSITION_MANAGER      = 0xcF1EAFC6928dC385A342E7C6491d371d2871458b;
    address internal constant POSITION_DESCRIPTOR   = 0x9e9FBbEf0e1Bd752E83De5aCff3D0c936A9E5A4b;
    address internal constant QUOTER                = 0x8928074CA1b241D8Ec02815881c1Af11E8bC5219;
    address internal constant STATE_VIEW            = 0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990;
    address internal constant UNIVERSAL_ROUTER      = 0xDa00aE15d3A71466517129255255db7c0c0956d3;
    address internal constant UNIVERSAL_ROUTER_2_1_1 = 0x8B844f885672f333Bc0042cB669255f93a4C1E6b;
    address internal constant PERMIT2               = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // ─────────────────────────────────────────────────────────────────────
    // X Layer common tokens (verify these for your testnet/staging variant)
    // ─────────────────────────────────────────────────────────────────────

    /// @dev USDT (USD₮0) on X Layer mainnet (6 decimals). Verified on-chain May 2026:
    ///      this is the bridged Tether deployment OKX uses for X Layer withdrawals.
    address internal constant USDT = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;

    /// @dev WOKB on X Layer mainnet (18 decimals)
    address internal constant WOKB = 0xe538905cf8410324e03A5A23C1c177a474D59b2b;

    /// @dev USDC on X Layer mainnet (6 decimals) — alternative stake token
    address internal constant USDC_E = 0x74b7F16337b8972027F6196A17a631aC6dE26d22;

    // ─────────────────────────────────────────────────────────────────────
    // Foundry's deterministic CREATE2 factory
    // ─────────────────────────────────────────────────────────────────────

    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // ─────────────────────────────────────────────────────────────────────
    // V4 fee tier constants
    // ─────────────────────────────────────────────────────────────────────

    /// @dev When pool is initialized with this value, hook can override fee per-swap.
    uint24 internal constant DYNAMIC_FEE_FLAG = 0x800000;

    /// @dev Standard tick spacings.
    int24 internal constant TICK_SPACING_LOW = 10;
    int24 internal constant TICK_SPACING_MEDIUM = 60;
    int24 internal constant TICK_SPACING_HIGH = 200;
}
