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

/// @dev Minimal ERC20 for tests.
contract MockUSDT {
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

/// @notice The headline demo test:
/// Three AI agents — Confident, Cautious, Aggressive — compete in a single epoch.
/// One wins the election, gets slashed at settlement (because mock accumulated fees = 0),
/// and the slashed stake flows to the LP reward sink. Verifies the entire mechanism.
contract MultiAgentEpochTest is Test {
    using PoolIdLibrary for PoolKey;

    AgentArenaHook hook;
    AgentRegistry  registry;
    MockUSDT       stakeToken;

    // Three named agents with distinct strategy profiles
    address constant AGENT_CONFIDENT  = address(0xA1); // 18% APR, fee 30-50bps, narrow band
    address constant AGENT_CAUTIOUS   = address(0xB2); // 12% APR, fee 30-200bps, wide band
    address constant AGENT_AGGRESSIVE = address(0xC3); // 25% APR, fee 40-60bps, very narrow band

    address constant LP_SINK = address(0xCAFE);

    PoolKey poolKey;
    PoolId  poolId;

    function setUp() public {
        stakeToken = new MockUSDT();
        registry = new AgentRegistry(IERC20(address(stakeToken)));

        // Mine + deploy hook
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG |
            Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );
        bytes memory constructorArgs = abi.encode(
            IPoolManager(Config.POOL_MANAGER),
            registry,
            LP_SINK
        );
        (address hookAddr, bytes32 salt) = HookMiner.find(
            Config.CREATE2_DEPLOYER,
            flags,
            type(AgentArenaHook).creationCode,
            constructorArgs
        );
        bytes memory creationCode = abi.encodePacked(type(AgentArenaHook).creationCode, constructorArgs);
        vm.prank(Config.CREATE2_DEPLOYER);
        assembly {
            let p := add(creationCode, 32)
            let deployed := create2(0, p, mload(creationCode), salt)
            if iszero(deployed) { revert(0, 0) }
        }
        hook = AgentArenaHook(hookAddr);
        registry.authorizeHook(hookAddr, true);

        // Configure poolKey + manually bootstrap epoch state (no real PoolManager fork)
        poolKey = PoolKey({
            currency0:   Currency.wrap(address(stakeToken)),
            currency1:   Currency.wrap(address(0x123456)),
            fee:         LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks:       IHooks(hookAddr)
        });
        poolId = poolKey.toId();

        // Bootstrap pool epoch state via vm.store (would be done by afterInitialize in real flow)
        _bootstrapEpoch(poolId);

        // Mint + approve stake for each agent (1000 USDT each)
        _setupAgent(AGENT_CONFIDENT,  "ConfidentAgent",  1000 * 1e6);
        _setupAgent(AGENT_CAUTIOUS,   "CautiousAgent",   1000 * 1e6);
        _setupAgent(AGENT_AGGRESSIVE, "AggressiveAgent", 1000 * 1e6);
    }

    // ─────────────────────────────────────────────────────────────────────
    // The headline test
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Full epoch story: 3 agents bid -> AggressiveAgent wins -> time passes
    ///         -> settleEpoch slashes AggressiveAgent (accumulated fees=0, didn't meet promise).
    function test_FullEpochLifecycle_3AgentsCompete_AggressiveWinsAndGetsSlashed() public {
        console2.log("");
        console2.log("--- Stage 1: Bid Phase ---");

        // Three distinct strategy profiles compete:
        // ConfidentAgent:  18% APR, tight  band (30-50bps),  6 rebalances, 1000 USDT stake
        // CautiousAgent:   12% APR, wide   band (30-200bps), 12 rebalances, 1000 USDT stake
        // AggressiveAgent: 25% APR, narrow band (40-60bps),  4 rebalances, 1000 USDT stake
        _submitBid(AGENT_CONFIDENT,  500e6, 1800, 30, 50,  6, 200);
        _submitBid(AGENT_CAUTIOUS,   500e6, 1200, 30, 200, 12, 300);
        _submitBid(AGENT_AGGRESSIVE, 500e6, 2500, 40, 60,  4, 150);

        // Compute expected scores
        StrategyBond.Bond memory confidentBond  = _mkBond(AGENT_CONFIDENT,  500e6, 1800, 30, 50,  6, 200, 0);
        StrategyBond.Bond memory cautiousBond   = _mkBond(AGENT_CAUTIOUS,   500e6, 1200, 30, 200, 12, 300, 0);
        StrategyBond.Bond memory aggressiveBond = _mkBond(AGENT_AGGRESSIVE, 500e6, 2500, 40, 60,  4, 150, 0);

        uint256 sConfident  = StrategyBond.bidScore(confidentBond,  10_000);
        uint256 sCautious   = StrategyBond.bidScore(cautiousBond,   10_000);
        uint256 sAggressive = StrategyBond.bidScore(aggressiveBond, 10_000);

        console2.log("  Confident  score:", sConfident);
        console2.log("  Cautious   score:", sCautious);
        console2.log("  Aggressive score:", sAggressive);

        // AggressiveAgent has highest stake × APR / band -> expected winner
        assertGt(sAggressive, sConfident,  "aggressive should beat confident");
        assertGt(sAggressive, sCautious,   "aggressive should beat cautious");

        console2.log("");
        console2.log("--- Stage 2: Election ---");

        // Skip past bid phase
        vm.warp(block.timestamp + 5 minutes + 1);

        // Anyone can trigger election (permissionless)
        vm.expectEmit(true, true, true, false);
        emit IAgentArena.ManagerElected(PoolId.unwrap(poolId), 1, AGENT_AGGRESSIVE, sAggressive);
        hook.runElection(poolId);

        assertEq(hook.getActiveManager(poolId), AGENT_AGGRESSIVE, "wrong winner elected");
        console2.log("  Active Manager: AggressiveAgent (0x...C3)");

        console2.log("");
        console2.log("--- Stage 3: Manager Sets TVL Snapshot ---");

        // Manager declares starting TVL of $10,000
        vm.prank(AGENT_AGGRESSIVE);
        hook.setEpochStartTVL(poolId, 10_000 * 1e6);
        console2.log("  startTVL set to $10,000");

        console2.log("");
        console2.log("--- Stage 4: Epoch Runs (4 hours, no swaps in this test) ---");
        console2.log("  Accumulated fees = 0 -> manager will MISS promised APR");

        // Fast-forward past EPOCH_DURATION (4 hours)
        vm.warp(block.timestamp + 4 hours + 1);

        console2.log("");
        console2.log("--- Stage 5: Settlement ---");

        // Record balances before settlement
        uint256 stakeBefore = registry.getStake(AGENT_AGGRESSIVE);
        uint256 sinkBefore  = stakeToken.balanceOf(LP_SINK);
        uint256 repBefore   = registry.getReputation(AGENT_AGGRESSIVE);

        // Anyone can trigger settlement
        hook.settleEpoch(poolId);

        uint256 stakeAfter = registry.getStake(AGENT_AGGRESSIVE);
        uint256 sinkAfter  = stakeToken.balanceOf(LP_SINK);
        uint256 repAfter   = registry.getReputation(AGENT_AGGRESSIVE);

        uint256 slashed = stakeBefore - stakeAfter;
        uint256 received = sinkAfter - sinkBefore;

        console2.log("  Stake slashed:", slashed / 1e6, "USDT");
        console2.log("  LP sink received:", received / 1e6, "USDT");
        console2.log("  Reputation: ", repBefore, "->", repAfter);

        // Expected slash: 50% of BOND stake (capped at SLASH_MAX_BPS)
        // bond stake was 500e6 (not full registry stake) — so slash should be 500e6 * 50% = 250e6
        assertEq(slashed, 250e6, "wrong slash amount (expected 50% of bond stake)");
        assertEq(received, slashed, "LP sink mismatch (all slash should flow to sink)");
        assertLt(repAfter, repBefore, "reputation should drop after loss");

        console2.log("");
        console2.log("--- Stage 6: Verify Next Epoch Advances ---");
        assertEq(hook.getCurrentEpoch(poolId), 2, "epoch should have advanced to 2");
        assertEq(hook.getActiveManager(poolId), address(0), "next epoch starts with no manager");
        console2.log("  Now in Epoch 2 -- bidding open for next round");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Targeted tests
    // ─────────────────────────────────────────────────────────────────────

    function test_Election_PicksHighestScore() public {
        _submitBid(AGENT_CONFIDENT,  100e6, 1500, 30, 60, 5, 200);  // moderate
        _submitBid(AGENT_AGGRESSIVE, 800e6, 2000, 40, 50, 4, 150);  // high stake + tight band
        vm.warp(block.timestamp + 5 minutes + 1);
        hook.runElection(poolId);
        assertEq(hook.getActiveManager(poolId), AGENT_AGGRESSIVE, "wrong winner");
    }

    function test_Election_NoBids_NoManager() public {
        vm.warp(block.timestamp + 5 minutes + 1);
        hook.runElection(poolId);
        assertEq(hook.getActiveManager(poolId), address(0), "should be no manager");
    }

    function test_Election_RerunIdempotent() public {
        _submitBid(AGENT_CONFIDENT, 500e6, 1800, 30, 50, 6, 200);
        vm.warp(block.timestamp + 5 minutes + 1);
        hook.runElection(poolId);
        address firstWinner = hook.getActiveManager(poolId);

        // Re-run should be a no-op
        hook.runElection(poolId);
        assertEq(hook.getActiveManager(poolId), firstWinner, "election should not re-elect");
    }

    function test_BidPhase_RejectsLateBids() public {
        vm.warp(block.timestamp + 6 minutes); // past bid phase
        vm.prank(AGENT_CONFIDENT);
        vm.expectRevert(IAgentArena.BidPhaseClosed.selector);
        StrategyBond.Bond memory bond = _mkBond(AGENT_CONFIDENT, 500e6, 1800, 30, 50, 6, 200, 0);
        hook.submitBid(bond);
    }

    function test_Bid_RejectsUnregisteredAgent() public {
        address ghost = address(0xDEAD);
        vm.prank(ghost);
        vm.expectRevert(IAgentArena.NotRegistered.selector);
        StrategyBond.Bond memory bond = _mkBond(ghost, 500e6, 1800, 30, 50, 6, 200, 0);
        hook.submitBid(bond);
    }

    function test_Bid_RejectsBondStakeExceedingRegistryStake() public {
        vm.prank(AGENT_CONFIDENT);
        vm.expectRevert(IAgentArena.InsufficientStake.selector);
        // Confident has 1000 USDT in registry, but bid claims 2000 USDT
        StrategyBond.Bond memory bond = _mkBond(AGENT_CONFIDENT, 2000e6, 1800, 30, 50, 6, 200, 0);
        hook.submitBid(bond);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────

    function _bootstrapEpoch(PoolId pid) internal {
        // Replicate what afterInitialize would do — set currentEpoch=1 and epochStartTime=now.
        // PoolState struct layout (slot order): currentEpoch, epochStartTime, activeManager, activeBond, ...
        // poolState mapping is at storage slot 1 (after AgentRegistry at slot 0... actually need to inspect)
        // Simpler: call a public bootstrap via the manager pranking as PoolManager.
        // But we don't have one; instead just write directly to storage.

        // Storage slot of poolState mapping — find via reading the layout.
        // From AgentArenaHook order: `registry` (immutable, no slot), `lpRewardSink` (slot 0),
        // `poolState` mapping (slot 1), `bids` (slot 2), `bidders` (slot 3), `nonces` (slot 4).
        // Within PoolState: currentEpoch @ +0, epochStartTime @ +1.
        bytes32 baseSlot = keccak256(abi.encode(pid, uint256(1)));
        vm.store(address(hook), baseSlot, bytes32(uint256(1)));                        // currentEpoch = 1
        vm.store(address(hook), bytes32(uint256(baseSlot) + 1), bytes32(block.timestamp)); // epochStartTime = now
    }

    function _setupAgent(address agent, string memory name, uint256 stake) internal {
        stakeToken.mint(agent, stake);
        vm.startPrank(agent);
        stakeToken.approve(address(registry), type(uint256).max);
        registry.register(name, "ipfs://spec", stake);
        vm.stopPrank();
    }

    function _submitBid(
        address agent,
        uint256 stake,
        uint256 promisedAPR,
        uint24 minFee,
        uint24 maxFee,
        uint16 maxReb,
        int24 maxTick
    ) internal {
        uint256 nonce = hook.nonces(agent);
        StrategyBond.Bond memory bond = _mkBond(agent, stake, promisedAPR, minFee, maxFee, maxReb, maxTick, nonce);
        vm.prank(agent);
        hook.submitBid(bond);
    }

    function _mkBond(
        address agent,
        uint256 stake,
        uint256 promisedAPR,
        uint24 minFee,
        uint24 maxFee,
        uint16 maxReb,
        int24 maxTick,
        uint256 nonce
    ) internal view returns (StrategyBond.Bond memory) {
        return StrategyBond.Bond({
            agent: agent,
            poolId: PoolId.unwrap(poolId),
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
    }
}
