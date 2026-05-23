// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-hooks-public/src/utils/HookMiner.sol";

import {AgentArenaHook} from "../src/AgentArenaHook.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Config} from "./Config.sol";

/// @notice One-shot deployment script for AgentArena on X Layer mainnet.
///
/// Usage:
///   forge script script/DeployHook.s.sol \
///     --rpc-url xlayer \
///     --broadcast \
///     --verify \
///     --slow
contract DeployHook is Script {
    /// @dev Flags we need: beforeSwap + afterSwap + afterInitialize + beforeAddLiquidity + beforeRemoveLiquidity.
    uint160 internal constant FLAGS = uint160(
        Hooks.AFTER_INITIALIZE_FLAG |
        Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
        Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
        Hooks.BEFORE_SWAP_FLAG |
        Hooks.AFTER_SWAP_FLAG
    );

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(pk);

        console2.log("=== AgentArena Deployment ===");
        console2.log("Chain:    X Layer Mainnet (196)");
        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        // 1. Deploy AgentRegistry with USDT as the stake token
        AgentRegistry registry = new AgentRegistry(IERC20(Config.USDT));
        console2.log("AgentRegistry:", address(registry));

        // 2. Mine a hook address whose lower 14 bits match required permission flags
        //    (HookMiner uses CREATE2 from CREATE2_DEPLOYER; deployer below uses same salt)
        bytes memory constructorArgs = abi.encode(
            IPoolManager(Config.POOL_MANAGER),
            registry,
            deployer // lpRewardSink = deployer for v1 (replace with vault later)
        );

        (address hookAddress, bytes32 salt) = HookMiner.find(
            Config.CREATE2_DEPLOYER,
            FLAGS,
            type(AgentArenaHook).creationCode,
            constructorArgs
        );
        console2.log("Mined hook address:", hookAddress);
        console2.logBytes32(salt);

        // 3. Deploy hook via CREATE2
        AgentArenaHook hook = new AgentArenaHook{salt: salt}(
            IPoolManager(Config.POOL_MANAGER),
            registry,
            deployer
        );
        require(address(hook) == hookAddress, "hook address mismatch");
        console2.log("AgentArenaHook deployed at:", address(hook));

        // 4. Authorize the hook to slash/reward via the registry
        registry.authorizeHook(address(hook), true);
        console2.log("Hook authorized in registry");

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Summary ===");
        console2.log("Stake token (USDT):", Config.USDT);
        console2.log("PoolManager:       ", Config.POOL_MANAGER);
        console2.log("AgentRegistry:     ", address(registry));
        console2.log("AgentArenaHook:    ", address(hook));
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Initialize a V4 pool with hook + DYNAMIC_FEE_FLAG");
        console2.log("  2. Run RegisterAgent.s.sol to register YieldAgent + submit first bid");
        console2.log("  3. Wait for bid phase to close, then runElection()");
    }
}
