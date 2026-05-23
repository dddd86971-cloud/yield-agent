// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {AgentArenaHook} from "../src/AgentArenaHook.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {StrategyBond} from "../src/libraries/StrategyBond.sol";
import {Config} from "./Config.sol";

/// @notice End-to-end script: registers YieldAgent in the registry,
///         then submits the first StrategyBond for the current epoch.
///
/// Required env vars:
///   AGENT_PK         — private key of the agent (e.g. TEE signer EOA)
///   REGISTRY_ADDR    — deployed AgentRegistry address
///   HOOK_ADDR        — deployed AgentArenaHook address
///   POOL_ID          — bytes32 PoolId of the target V4 pool
///   INITIAL_STAKE    — amount of USDT to stake (in wei, 6 decimals)
contract RegisterAgent is Script {
    function run() external {
        uint256 pk           = vm.envUint("AGENT_PK");
        address agent        = vm.addr(pk);
        AgentRegistry registry = AgentRegistry(vm.envAddress("REGISTRY_ADDR"));
        AgentArenaHook hook  = AgentArenaHook(payable(vm.envAddress("HOOK_ADDR")));
        bytes32 poolId       = vm.envBytes32("POOL_ID");
        uint256 initialStake = vm.envOr("INITIAL_STAKE", uint256(5 * 1e6)); // default 5 USDT (demo)

        IERC20 usdt = IERC20(Config.USDT);

        console2.log("=== YieldAgent Registration + Bid ===");
        console2.log("Agent address:", agent);
        console2.log("Registry:     ", address(registry));
        console2.log("Hook:         ", address(hook));
        console2.log("Initial stake:", initialStake / 1e6, "USDT");

        vm.startBroadcast(pk);

        // 1. Approve registry to pull stake
        usdt.approve(address(registry), initialStake);

        // 2. Register if not already
        if (!registry.isRegistered(agent)) {
            registry.register(
                "YieldAgent",
                "ipfs://QmYieldAgentStrategySpec",
                initialStake
            );
            console2.log("Registered YieldAgent in registry");
        } else {
            console2.log("YieldAgent already registered");
        }

        // 3. Fetch current epoch
        uint256 currentEpoch = hook.getCurrentEpoch(PoolId.wrap(poolId));
        console2.log("Current epoch:", currentEpoch);

        // 4. Build a StrategyBond
        //    Promise: 18% APR (1800 bps), fee 30-80 bps, max 6 rebalances, ±200 ticks
        StrategyBond.Bond memory bond = StrategyBond.Bond({
            agent:                  agent,
            poolId:                 poolId,
            epochId:                currentEpoch,
            stakeAmount:            initialStake / 2, // bid half of stake
            promisedAPRBps:         1_800,           // 18%
            minFeeBps:              30,              // 0.003%
            maxFeeBps:              80,              // 0.008%
            maxRebalancesPerEpoch:  6,
            maxTickRange:           200,
            nonce:                  hook.nonces(agent),
            signature:              ""               // self-submission: msg.sender check
        });

        // 5. Submit the bid
        hook.submitBid(bond);
        console2.log("Bid submitted:");
        console2.log("  promised APR:        ", bond.promisedAPRBps, "bps");
        console2.log("  fee range [min, max]:", bond.minFeeBps, bond.maxFeeBps);
        console2.log("  max rebalances:      ", bond.maxRebalancesPerEpoch);
        console2.log("  max tick range:      ", uint256(int256(bond.maxTickRange)));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Next: wait for bid phase to close (5 min after epoch start),");
        console2.log("then anyone can call hook.runElection(PoolId.wrap(poolId))");
    }
}
