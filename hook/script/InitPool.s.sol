// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {Config} from "./Config.sol";

/// @notice Initialize a Uniswap V4 USDT/WOKB pool with our AgentArenaHook attached,
///         using the DYNAMIC_FEE_FLAG so the hook can override fees per-swap.
///
/// Required env vars:
///   DEPLOYER_PK   — private key of the caller
///   HOOK_ADDR     — deployed AgentArenaHook address (mined with correct flag bits)
///   INIT_PRICE_X96 — initial sqrtPriceX96 (optional; defaults to 1:1)
contract InitPool is Script {
    using PoolIdLibrary for PoolKey;

    /// @dev sqrt(1e12) * 2^96 — fair 1:1 starting price for USDT (6dec) / WOKB (18dec) pair.
    /// Production: compute properly with the current spot price.
    uint160 internal constant DEFAULT_SQRT_PRICE_X96 = 79228162514264337593543950336; // 1.0 in Q64.96

    function run() external {
        uint256 pk        = vm.envUint("DEPLOYER_PK");
        address hookAddr  = vm.envAddress("HOOK_ADDR");
        uint160 sqrtPrice = uint160(vm.envOr("INIT_PRICE_X96", uint256(DEFAULT_SQRT_PRICE_X96)));

        console2.log("=== Initialize V4 Pool with AgentArenaHook ===");
        console2.log("Hook:        ", hookAddr);
        console2.log("PoolManager: ", Config.POOL_MANAGER);
        console2.log("token0 (USDT):", Config.USDT);
        console2.log("token1 (WOKB):", Config.WOKB);

        // V4 requires token0 < token1; sort
        (address t0, address t1) = Config.USDT < Config.WOKB
            ? (Config.USDT, Config.WOKB)
            : (Config.WOKB, Config.USDT);

        PoolKey memory key = PoolKey({
            currency0:   Currency.wrap(t0),
            currency1:   Currency.wrap(t1),
            fee:         LPFeeLibrary.DYNAMIC_FEE_FLAG, // 0x800000 → hook controls fee
            tickSpacing: 60,                            // medium granularity
            hooks:       IHooks(hookAddr)
        });

        PoolId pid = key.toId();
        console2.log("PoolId:");
        console2.logBytes32(PoolId.unwrap(pid));

        vm.startBroadcast(pk);
        IPoolManager(Config.POOL_MANAGER).initialize(key, sqrtPrice);
        vm.stopBroadcast();

        console2.log("");
        console2.log("Pool initialized!");
        console2.log("Verify on OKLink:");
        console2.log("  https://www.oklink.com/xlayer/address/", Config.POOL_MANAGER);
        console2.log("");
        console2.log("Next: submitBid() via RegisterAgent.s.sol with POOL_ID above");
    }
}
