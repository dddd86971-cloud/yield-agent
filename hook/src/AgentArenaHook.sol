// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@uniswap/v4-hooks-public/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {IAgentArena} from "./interfaces/IAgentArena.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {StrategyBond} from "./libraries/StrategyBond.sol";

/// @title  AgentArenaHook
/// @notice The main V4 hook for AgentArena. Each epoch, AI agents submit signed StrategyBonds
///         competing for management rights. Winner becomes Active Manager for one epoch and
///         controls dynamic fee + LP modifications. Hook enforces every committed spec field
///         in real-time. Failure to meet commitments triggers automatic slashing.
contract AgentArenaHook is BaseHook, IAgentArena {
    using PoolIdLibrary for PoolKey;
    using LPFeeLibrary for uint24;

    // ─────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────

    uint256 public constant EPOCH_DURATION = 4 hours;
    uint256 public constant BID_PHASE_DURATION = 5 minutes;

    /// @dev Slash percentages (in basis points of stake).
    uint256 public constant SLASH_SPEC_VIOLATION_BPS = 2_000;    // 20% — fee out of band, etc.
    uint256 public constant SLASH_MAX_BPS = 5_000;                // hard cap at 50% per epoch
    uint256 public constant REPUTATION_BOOST_PER_WIN = 200;       // +0.02× per won epoch
    uint256 public constant REPUTATION_PENALTY_PER_LOSS = 500;    // -0.05× per missed epoch

    /// @notice Fallback dynamic fee when no active manager is set (e.g., epoch transitions).
    uint24 public constant FALLBACK_FEE_BPS = 3000; // 0.3%

    // ─────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────

    AgentRegistry public immutable registry;

    /// @notice LP recipient address for slashed stake distributions.
    address public lpRewardSink;

    struct PoolState {
        uint256 currentEpoch;
        uint256 epochStartTime;
        address activeManager;
        StrategyBond.Bond activeBond;
        uint256 currentEpochRebalanceCount;
        uint256 currentEpochAccumulatedFees; // tracked from afterSwap
        uint256 currentEpochStartTVL;        // snapshot at epoch start, set off-chain
    }

    mapping(PoolId => PoolState) internal poolState;

    /// @notice bid book — poolId => epochId => agent => bond.
    mapping(PoolId => mapping(uint256 => mapping(address => StrategyBond.Bond))) public bids;

    /// @notice list of bidders per epoch (for election iteration).
    mapping(PoolId => mapping(uint256 => address[])) public bidders;

    /// @notice per-agent nonce for replay protection.
    mapping(address => uint256) public nonces;

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor(IPoolManager _poolManager, AgentRegistry _registry, address _lpRewardSink)
        BaseHook(_poolManager)
    {
        registry = _registry;
        lpRewardSink = _lpRewardSink;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Hook permissions
    // ─────────────────────────────────────────────────────────────────────

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Hook callbacks
    // ─────────────────────────────────────────────────────────────────────

    function _afterInitialize(
        address /* sender */,
        PoolKey calldata key,
        uint160 /* sqrtPriceX96 */,
        int24 /* tick */
    ) internal override returns (bytes4) {
        PoolId pid = key.toId();
        PoolState storage s = poolState[pid];
        s.currentEpoch = 1;
        s.epochStartTime = block.timestamp;
        return BaseHook.afterInitialize.selector;
    }

    function _beforeSwap(
        address /* sender */,
        PoolKey calldata key,
        SwapParams calldata /* params */,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId pid = key.toId();
        PoolState storage s = poolState[pid];

        // Try to advance epoch if needed (permissionless, in-band)
        _maybeAdvanceEpoch(pid);

        uint24 dynamicFee = _computeDynamicFee(s);

        // Override fee using LPFeeLibrary's flag
        return (
            BaseHook.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            dynamicFee | LPFeeLibrary.OVERRIDE_FEE_FLAG
        );
    }

    function _afterSwap(
        address /* sender */,
        PoolKey calldata key,
        SwapParams calldata /* params */,
        BalanceDelta delta,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, int128) {
        PoolId pid = key.toId();
        PoolState storage s = poolState[pid];

        // Simple fee revenue accounting — approximate from BalanceDelta amounts
        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();
        uint256 absAmount0 = uint256(int256(amount0 < 0 ? -amount0 : amount0));
        uint256 absAmount1 = uint256(int256(amount1 < 0 ? -amount1 : amount1));
        uint24 fee = _computeDynamicFee(s);
        // Heuristic fee revenue: avg(abs(amount0), abs(amount1)) × fee/1e6
        s.currentEpochAccumulatedFees += ((absAmount0 + absAmount1) * fee) / 2_000_000;

        emit ActionRecorded(PoolId.unwrap(pid), s.currentEpoch, s.activeManager, "swap", 1);
        return (BaseHook.afterSwap.selector, 0);
    }

    function _beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata /* hookData */
    ) internal override returns (bytes4) {
        _enforceManagerAction(key, sender, params.tickLower, params.tickUpper);
        return BaseHook.beforeAddLiquidity.selector;
    }

    function _beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata /* hookData */
    ) internal override returns (bytes4) {
        _enforceManagerAction(key, sender, params.tickLower, params.tickUpper);
        return BaseHook.beforeRemoveLiquidity.selector;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Bid + Election
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Submit a StrategyBond for the current epoch's bid phase.
    ///         Must be called within first BID_PHASE_DURATION of an epoch.
    function submitBid(StrategyBond.Bond calldata bond) external {
        // basic validity
        StrategyBond.validate(bond);
        if (bond.agent != msg.sender) revert InvalidSignature();
        if (!registry.isRegistered(msg.sender)) revert NotRegistered();
        if (registry.inCooldown(msg.sender)) revert InCooldown();
        if (registry.getStake(msg.sender) < bond.stakeAmount) revert InsufficientStake();
        if (bond.nonce != nonces[msg.sender]) revert InvalidSignature();

        PoolId pid = PoolId.wrap(bond.poolId);
        PoolState storage s = poolState[pid];

        // Must be within bid phase of the bond's epoch
        if (bond.epochId != s.currentEpoch) revert InvalidEpoch();
        if (block.timestamp > s.epochStartTime + BID_PHASE_DURATION) revert BidPhaseClosed();

        // Store bid
        bids[pid][bond.epochId][msg.sender] = bond;
        bidders[pid][bond.epochId].push(msg.sender);
        unchecked { nonces[msg.sender]++; }

        uint256 reputation = registry.getReputation(msg.sender);
        uint256 score = StrategyBond.bidScore(bond, reputation);
        emit BidSubmitted(bond.poolId, bond.epochId, msg.sender, bond.promisedAPRBps, score);
    }

    /// @notice Run the election for the current epoch. Permissionless; callable after bid phase ends.
    function runElection(PoolId pid) public {
        PoolState storage s = poolState[pid];
        if (block.timestamp <= s.epochStartTime + BID_PHASE_DURATION) revert BidPhaseClosed();
        if (s.activeManager != address(0)) return; // already elected

        address[] storage epochBidders = bidders[pid][s.currentEpoch];
        if (epochBidders.length == 0) return; // no bids, no manager

        address winner;
        uint256 bestScore;

        for (uint256 i = 0; i < epochBidders.length; i++) {
            address bidder = epochBidders[i];
            StrategyBond.Bond memory b = bids[pid][s.currentEpoch][bidder];
            uint256 rep = registry.getReputation(bidder);
            uint256 score = StrategyBond.bidScore(b, rep);
            if (score > bestScore) {
                bestScore = score;
                winner = bidder;
            }
        }

        s.activeManager = winner;
        s.activeBond = bids[pid][s.currentEpoch][winner];
        s.currentEpochRebalanceCount = 0;
        s.currentEpochAccumulatedFees = 0;

        emit ManagerElected(PoolId.unwrap(pid), s.currentEpoch, winner, bestScore);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Epoch settlement
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Settle the current epoch. Permissionless; callable after EPOCH_DURATION elapsed.
    ///         Computes actual APR, slashes underperformance, advances to next epoch.
    function settleEpoch(PoolId pid) public {
        PoolState storage s = poolState[pid];
        require(block.timestamp >= s.epochStartTime + EPOCH_DURATION, "epoch active");
        if (s.activeManager == address(0)) {
            _advanceEpoch(s);
            return;
        }

        StrategyBond.Bond memory bond = s.activeBond;

        // Compute actual APR (approx): fees/TVL annualized
        uint256 actualAPRBps = 0;
        if (s.currentEpochStartTVL > 0) {
            actualAPRBps =
                (s.currentEpochAccumulatedFees * 365 days * 10_000) /
                (EPOCH_DURATION * s.currentEpochStartTVL);
        }

        uint256 slashAmount = 0;

        if (actualAPRBps < bond.promisedAPRBps) {
            uint256 shortfallBps = bond.promisedAPRBps - actualAPRBps;
            uint256 slashBps = (shortfallBps * 10_000) / bond.promisedAPRBps; // % of shortfall
            if (slashBps > SLASH_MAX_BPS) slashBps = SLASH_MAX_BPS;
            slashAmount = (bond.stakeAmount * slashBps) / 10_000;

            if (slashAmount > 0) {
                registry.slash(bond.agent, slashAmount, lpRewardSink, "APR_SHORTFALL");
                registry.recordLoss(bond.agent, REPUTATION_PENALTY_PER_LOSS);
            }
        } else {
            // Met or beat promise — reward
            uint256 earned = s.currentEpochAccumulatedFees / 10; // 10% manager fee (paid off-chain)
            registry.reward(bond.agent, REPUTATION_BOOST_PER_WIN, earned);
        }

        emit EpochSettled(
            PoolId.unwrap(pid),
            s.currentEpoch,
            bond.agent,
            actualAPRBps,
            bond.promisedAPRBps,
            slashAmount
        );

        _advanceEpoch(s);
    }

    /// @notice Manager can set the TVL snapshot at start of epoch (called once per epoch).
    function setEpochStartTVL(PoolId pid, uint256 tvl) external {
        PoolState storage s = poolState[pid];
        require(msg.sender == s.activeManager, "only active manager");
        require(s.currentEpochStartTVL == 0, "already set");
        s.currentEpochStartTVL = tvl;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Explicit views (avoid auto-getter quirks with nested-struct dynamic fields)
    // ─────────────────────────────────────────────────────────────────────

    function getCurrentEpoch(PoolId pid) external view returns (uint256) {
        return poolState[pid].currentEpoch;
    }

    function getEpochStartTime(PoolId pid) external view returns (uint256) {
        return poolState[pid].epochStartTime;
    }

    function getActiveManager(PoolId pid) external view returns (address) {
        return poolState[pid].activeManager;
    }

    function getActiveBond(PoolId pid) external view returns (StrategyBond.Bond memory) {
        return poolState[pid].activeBond;
    }

    function getEpochCounters(PoolId pid)
        external
        view
        returns (uint256 rebalanceCount, uint256 accumulatedFees, uint256 startTVL)
    {
        PoolState storage s = poolState[pid];
        return (s.currentEpochRebalanceCount, s.currentEpochAccumulatedFees, s.currentEpochStartTVL);
    }

    function getBidderList(PoolId pid, uint256 epochId) external view returns (address[] memory) {
        return bidders[pid][epochId];
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev If epoch has ended, try to settle automatically + advance.
    function _maybeAdvanceEpoch(PoolId pid) internal {
        PoolState storage s = poolState[pid];
        if (block.timestamp >= s.epochStartTime + EPOCH_DURATION) {
            // Settle ended epoch (best-effort; reverts only if mid-bid-phase)
            settleEpoch(pid);
        }
    }

    function _advanceEpoch(PoolState storage s) internal {
        s.currentEpoch += 1;
        s.epochStartTime = block.timestamp;
        s.activeManager = address(0);
        delete s.activeBond;
        s.currentEpochRebalanceCount = 0;
        s.currentEpochAccumulatedFees = 0;
        s.currentEpochStartTVL = 0;
    }

    /// @dev Compute current effective dynamic fee within active bond's committed range.
    function _computeDynamicFee(PoolState storage s) internal view returns (uint24) {
        if (s.activeManager == address(0)) return FALLBACK_FEE_BPS;
        // For v1: use midpoint of committed range; v2 can read off-chain volatility hint.
        return uint24((uint256(s.activeBond.minFeeBps) + uint256(s.activeBond.maxFeeBps)) / 2);
    }

    function _enforceManagerAction(
        PoolKey calldata key,
        address sender,
        int24 tickLower,
        int24 tickUpper
    ) internal {
        PoolId pid = key.toId();
        PoolState storage s = poolState[pid];

        // Only active manager can mutate liquidity in this pool
        if (sender != s.activeManager) revert NotActiveManager();

        // Rebalance count cap
        s.currentEpochRebalanceCount += 1;
        if (s.currentEpochRebalanceCount > s.activeBond.maxRebalancesPerEpoch) {
            // Slash for overshooting commitment
            registry.slash(
                s.activeBond.agent,
                (s.activeBond.stakeAmount * SLASH_SPEC_VIOLATION_BPS) / 10_000,
                lpRewardSink,
                "MAX_REBALANCES_EXCEEDED"
            );
            emit SpecEnforced(PoolId.unwrap(pid), s.currentEpoch, s.activeManager, "maxRebalances");
            revert SpecViolation("maxRebalances");
        }

        // Tick range cap (relative half-width vs committed maxTickRange)
        int24 halfWidth = (tickUpper - tickLower) / 2;
        if (halfWidth > s.activeBond.maxTickRange) {
            registry.slash(
                s.activeBond.agent,
                (s.activeBond.stakeAmount * SLASH_SPEC_VIOLATION_BPS) / 10_000,
                lpRewardSink,
                "TICK_RANGE_EXCEEDED"
            );
            emit SpecEnforced(PoolId.unwrap(pid), s.currentEpoch, s.activeManager, "tickRange");
            revert SpecViolation("tickRange");
        }

        emit ActionRecorded(
            PoolId.unwrap(pid),
            s.currentEpoch,
            s.activeManager,
            "modifyLiquidity",
            s.currentEpochRebalanceCount
        );
    }
}
