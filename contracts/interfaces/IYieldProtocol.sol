// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IYieldProtocol — shared type library for YieldAgent v2
/// @notice v2 NOTE: this file no longer declares function signatures. v2
/// YieldAgent is an audit/registry layer — all real DEX execution happens
/// off-chain through the OnchainOS `defi` module (invest / withdraw /
/// collect), signed by the agent's Agentic Wallet. The on-chain contracts
/// only record decisions and execution receipts.
///
/// This interface now exists purely as a shared namespace for the enums and
/// structs that StrategyManager, DecisionLogger, and FollowVault use. Every
/// concrete function signature and event is declared directly in the
/// implementation contracts so there's no ambiguity about what v2 actually
/// exposes.
interface IYieldProtocol {
    // ============ Enums ============

    /// @notice The action an agent took (or decided not to take)
    enum ActionType {
        DEPLOY,
        REBALANCE,
        COMPOUND,
        EMERGENCY_EXIT,
        HOLD
    }

    /// @notice Risk profile a strategy was deployed with
    enum RiskProfile {
        CONSERVATIVE,
        MODERATE,
        AGGRESSIVE
    }

    // ============ Structs ============

    /// @notice A planned concentrated-LP position range
    /// @dev Amounts are advisory only — token custody lives in the OnchainOS
    /// Agentic Wallet, not in this contract.
    struct PositionParams {
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
    }

    /// @notice Audit metadata for a deployed strategy
    /// @dev `totalDeposited` is a reference number derived from the plan, not
    /// an on-chain balance. Actual token custody is with the OnchainOS
    /// Agentic Wallet.
    struct Strategy {
        address agent;
        address owner;
        address pool;
        address token0;
        address token1;
        uint24 fee;
        uint256[] positionIds;
        uint256 totalDeposited;
        uint256 createdAt;
        bool active;
        RiskProfile riskProfile;
    }

    /// @notice One auditable decision the agent made for a strategy
    struct Decision {
        uint256 strategyId;
        uint256 timestamp;
        ActionType action;
        int24 oldTickLower;
        int24 oldTickUpper;
        int24 newTickLower;
        int24 newTickUpper;
        uint8 confidence;
        string reasoning;
    }
}
