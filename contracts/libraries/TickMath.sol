// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

/// @title Minimal TickMath helpers used by YieldAgent
/// @notice Subset of Uniswap V3 TickMath for tick <-> sqrtPriceX96 conversions
library TickMath {
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = 887272;

    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    /// @notice Validates tick is within Uniswap V3 bounds
    function validateTick(int24 tick) internal pure returns (bool) {
        return tick >= MIN_TICK && tick <= MAX_TICK;
    }

    /// @notice Rounds tick down to nearest multiple of tickSpacing
    function roundTickDown(int24 tick, int24 tickSpacing) internal pure returns (int24) {
        int24 compressed = tick / tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) compressed--;
        return compressed * tickSpacing;
    }

    /// @notice Rounds tick up to nearest multiple of tickSpacing
    function roundTickUp(int24 tick, int24 tickSpacing) internal pure returns (int24) {
        int24 compressed = tick / tickSpacing;
        if (tick > 0 && tick % tickSpacing != 0) compressed++;
        return compressed * tickSpacing;
    }
}
