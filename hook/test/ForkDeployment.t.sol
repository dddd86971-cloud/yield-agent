// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {HookMiner} from "@uniswap/v4-hooks-public/src/utils/HookMiner.sol";

import {AgentArenaHook} from "../src/AgentArenaHook.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {StrategyBond} from "../src/libraries/StrategyBond.sol";
import {IAgentArena} from "../src/interfaces/IAgentArena.sol";
import {Config} from "../script/Config.sol";

/// @dev Minimal ERC20 for stake (deployed on-fork).
contract ForkUSDT {
    string public constant name = "Mock USDT";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @title  ForkDeploymentTest
/// @notice Proves that AgentArena Hook can be deployed and attached to a REAL Uniswap V4 pool
///         on the actual X Layer mainnet state. Forks live X Layer at the latest block.
///
/// Run with:
///   forge test --match-path "test/ForkDeployment.t.sol" --fork-url xlayer -vv
contract ForkDeploymentTest is Test {
    using PoolIdLibrary for PoolKey;

    AgentArenaHook hook;
    AgentRegistry  registry;
    ForkUSDT       stakeToken;
    IPoolManager   poolManager;

    address constant AGENT_A = address(0xA1);
    address constant AGENT_B = address(0xB2);
    address constant LP_SINK = address(0xCAFE);

    /// @dev Pre-condition for the entire suite: must be on X Layer fork.
    function setUp() public {
        // Pick up RPC from foundry.toml [rpc_endpoints] xlayer
        // If --fork-url isn't supplied, vm.createSelectFork still works via foundry.toml resolution.
        try vm.createSelectFork("xlayer") returns (uint256) {
            // Verify we're on chain 196
            assertEq(block.chainid, 196, "expected X Layer mainnet (196)");
        } catch {
            // RPC unavailable — mark skipped via revert with a clear message.
            revert("X Layer RPC not reachable -- set --fork-url https://rpc.xlayer.tech");
        }

        // 1) Reference the LIVE PoolManager on X Layer
        poolManager = IPoolManager(Config.POOL_MANAGER);

        // 2) Deploy our stake token + registry on the fork
        stakeToken = new ForkUSDT();
        registry = new AgentRegistry(IERC20(address(stakeToken)));

        // 3) Mine hook salt then deploy via THIS contract's CREATE2 (no factory dep)
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG |
            Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );
        bytes memory constructorArgs = abi.encode(poolManager, registry, LP_SINK);
        (address minedAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(AgentArenaHook).creationCode,
            constructorArgs
        );

        hook = new AgentArenaHook{salt: salt}(poolManager, registry, LP_SINK);
        assertEq(address(hook), minedAddr, "hook address != mined address");
        registry.authorizeHook(address(hook), true);

        console2.log("=== Fork Deployment Initialized ===");
        console2.log("Chain ID:    ", block.chainid);
        console2.log("Block:       ", block.number);
        console2.log("PoolManager: ", address(poolManager));
        console2.log("Hook:        ", address(hook));
        console2.log("Registry:    ", address(registry));
    }

    // ─────────────────────────────────────────────────────────────────────
    // CRITICAL TEST: prove our hook is accepted by REAL X Layer V4 PoolManager
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Initialize a Uniswap V4 pool on the actual X Layer mainnet PoolManager
    ///         with our hook attached. Verifies the hook permissions are correctly
    ///         encoded into the address and the hook is accepted by the real V4 protocol.
    function test_Fork_RealPoolManagerAcceptsOurHook() public {
        // Build a V4 pool key targeting our hook with dynamic fee
        // Sort currencies (V4 requires currency0 < currency1)
        address c0 = address(stakeToken) < Config.WOKB ? address(stakeToken) : Config.WOKB;
        address c1 = address(stakeToken) < Config.WOKB ? Config.WOKB : address(stakeToken);

        PoolKey memory key = PoolKey({
            currency0:   Currency.wrap(c0),
            currency1:   Currency.wrap(c1),
            fee:         LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks:       IHooks(address(hook))
        });

        // 1:1 price in Q64.96
        uint160 sqrtPriceX96 = 79228162514264337593543950336;

        console2.log("");
        console2.log("--- Calling PoolManager.initialize on LIVE X Layer ---");
        console2.log("currency0:", c0);
        console2.log("currency1:", c1);
        console2.log("fee (dynamic):", uint256(LPFeeLibrary.DYNAMIC_FEE_FLAG));
        console2.log("tickSpacing: 60");

        // Call the REAL X Layer V4 PoolManager
        int24 tickReturned = poolManager.initialize(key, sqrtPriceX96);

        console2.log("Initial tick:", uint256(int256(tickReturned)));

        // Verify our afterInitialize hook actually fired and bootstrapped epoch state
        PoolId pid = key.toId();
        assertEq(hook.getCurrentEpoch(pid), 1, "epoch should be 1 after init");
        assertGt(hook.getEpochStartTime(pid), 0, "epochStartTime should be set");
        assertEq(hook.getActiveManager(pid), address(0), "no manager before bid phase");

        console2.log("--- Hook afterInitialize fired correctly ---");
        console2.log("currentEpoch:    ", hook.getCurrentEpoch(pid));
        console2.log("epochStartTime:  ", hook.getEpochStartTime(pid));
        console2.log("activeManager:    address(0) (none yet)");
        console2.log("");
        console2.log("PROOF: V4 PoolManager on X Layer accepted our hook.");
        console2.log("PROOF: afterInitialize callback executed.");
    }

    /// @notice Full deploy + init + bid + election + settle pipeline on fork.
    function test_Fork_FullPipeline_DeployToSettlement() public {
        // Phase 1: Initialize V4 pool
        address c0 = address(stakeToken) < Config.WOKB ? address(stakeToken) : Config.WOKB;
        address c1 = address(stakeToken) < Config.WOKB ? Config.WOKB : address(stakeToken);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolManager.initialize(key, 79228162514264337593543950336);
        PoolId pid = key.toId();

        console2.log("");
        console2.log("--- Phase 1: V4 Pool initialized on X Layer fork ---");

        // Phase 2: Two agents register + bid
        _setupAgent(AGENT_A, "AgentA", 1000e6);
        _setupAgent(AGENT_B, "AgentB", 1000e6);

        // Agent A: confident — high APR, tight band
        _submitBid(AGENT_A, pid, 500e6, 2000, 30, 50, 6, 200);
        // Agent B: cautious — low APR, wide band
        _submitBid(AGENT_B, pid, 500e6, 1200, 30, 200, 12, 300);

        console2.log("--- Phase 2: 2 agents bid ---");

        // Phase 3: Election after bid phase ends
        vm.warp(block.timestamp + 5 minutes + 1);
        hook.runElection(pid);

        address winner = hook.getActiveManager(pid);
        console2.log("--- Phase 3: Election winner:", winner, "---");
        assertEq(winner, AGENT_A, "AgentA should win on score");

        // Phase 4: Manager sets TVL
        vm.prank(AGENT_A);
        hook.setEpochStartTVL(pid, 10_000e6);

        // Phase 5: Fast-forward + settle
        vm.warp(block.timestamp + 4 hours + 1);
        uint256 stakeBefore = registry.getStake(AGENT_A);
        uint256 sinkBefore = stakeToken.balanceOf(LP_SINK);

        hook.settleEpoch(pid);

        uint256 stakeAfter = registry.getStake(AGENT_A);
        uint256 sinkAfter = stakeToken.balanceOf(LP_SINK);

        console2.log("--- Phase 5: Settled ---");
        console2.log("Slashed:        ", (stakeBefore - stakeAfter) / 1e6, "USDT");
        console2.log("LP sink received:", (sinkAfter - sinkBefore) / 1e6, "USDT");
        console2.log("Reputation:      ", registry.getReputation(AGENT_A));

        // Phase 6: Verify advance to next epoch
        assertEq(hook.getCurrentEpoch(pid), 2, "should advance to epoch 2");
        console2.log("");
        console2.log("PROOF: Full pipeline ran on X Layer fork.");
    }

    /// @notice Verify all 5 V4 hook flags are encoded in hook address.
    function test_Fork_HookFlagsCorrect() public view {
        uint160 addr = uint160(address(hook));
        uint160 expected = uint160(
            Hooks.AFTER_INITIALIZE_FLAG |
            Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );
        uint160 lower14 = addr & uint160(0x3FFF); // mask lower 14 bits
        assertEq(lower14, expected, "hook address flags mismatch");

        console2.log("Hook address:", address(hook));
        console2.log("Lower-14 flags:", uint256(lower14));
        console2.log("Expected:       ", uint256(expected));
        console2.log("PROOF: all 5 required hook callbacks encoded in address.");
    }

    // ─── helpers ─────────────────────────────────────────────────────────

    function _setupAgent(address agent, string memory name, uint256 stake) internal {
        stakeToken.mint(agent, stake);
        vm.startPrank(agent);
        stakeToken.approve(address(registry), type(uint256).max);
        registry.register(name, "ipfs://spec", stake);
        vm.stopPrank();
    }

    function _submitBid(
        address agent,
        PoolId pid,
        uint256 stake,
        uint256 promisedAPR,
        uint24 minFee,
        uint24 maxFee,
        uint16 maxReb,
        int24 maxTick
    ) internal {
        uint256 nonce = hook.nonces(agent);
        StrategyBond.Bond memory bond = StrategyBond.Bond({
            agent: agent,
            poolId: PoolId.unwrap(pid),
            epochId: 1,
            stakeAmount: stake,
            promisedAPRBps: promisedAPR,
            minFeeBps: minFee,
            maxFeeBps: maxFee,
            maxRebalancesPerEpoch: maxReb,
            maxTickRange: maxTick,
            nonce: nonce,
            signature: ""
        });
        vm.prank(agent);
        hook.submitBid(bond);
    }
}
