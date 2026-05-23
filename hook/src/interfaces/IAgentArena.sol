// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  IAgentArena
/// @notice Shared types + events for the AgentArena ecosystem.
interface IAgentArena {
    // ─────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────

    error NotRegistered();
    error AlreadyRegistered();
    error InsufficientStake();
    error InvalidEpoch();
    error InvalidSignature();
    error NotActiveManager();
    error SpecViolation(string field);
    error BidPhaseClosed();
    error EpochNotSettled();
    error InCooldown();

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    event AgentRegistered(address indexed agent, string name, uint256 stake);
    event StakeIncreased(address indexed agent, uint256 newStake);
    event Slashed(address indexed agent, uint256 amount, string reason);
    event ReputationUpdated(address indexed agent, int256 delta, uint256 newReputation);

    event BidSubmitted(
        bytes32 indexed poolId,
        uint256 indexed epochId,
        address indexed agent,
        uint256 promisedAPRBps,
        uint256 bidScore
    );

    event ManagerElected(
        bytes32 indexed poolId,
        uint256 indexed epochId,
        address indexed manager,
        uint256 winningScore
    );

    event EpochSettled(
        bytes32 indexed poolId,
        uint256 indexed epochId,
        address indexed manager,
        uint256 actualAPRBps,
        uint256 promisedAPRBps,
        uint256 slashedAmount
    );

    event SpecEnforced(
        bytes32 indexed poolId,
        uint256 indexed epochId,
        address indexed manager,
        string field
    );

    event ActionRecorded(
        bytes32 indexed poolId,
        uint256 indexed epochId,
        address indexed manager,
        bytes32 actionType,
        uint256 value
    );
}
