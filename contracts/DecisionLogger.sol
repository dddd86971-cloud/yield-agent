// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IYieldProtocol.sol";

/// @title DecisionLogger - On-chain verifiable AI decision log
/// @notice Records every decision made by YieldAgent, including HOLD decisions.
///         AI judges can scan these logs to verify agent intelligence and autonomy.
contract DecisionLogger {
    // ============ Storage ============

    /// @notice strategyId => Decision[]
    mapping(uint256 => IYieldProtocol.Decision[]) private _decisions;

    /// @notice agent address => stats
    mapping(address => AgentStats) public agentStats;

    /// @notice Authorized callers (StrategyManager contract)
    mapping(address => bool) public authorized;

    address public owner;

    struct AgentStats {
        uint256 totalDecisions;
        uint256 deployCount;
        uint256 rebalanceCount;
        uint256 compoundCount;
        uint256 exitCount;
        uint256 holdCount;
        uint256 totalConfidence;
    }

    // ============ Events ============

    event DecisionRecorded(
        uint256 indexed strategyId,
        address indexed agent,
        IYieldProtocol.ActionType action,
        uint8 confidence,
        string reasoning
    );

    event AuthorizationUpdated(address indexed caller, bool authorized);

    // ============ Modifiers ============

    modifier onlyAuthorized() {
        require(authorized[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
    }

    // ============ Admin ============

    function setAuthorized(address caller, bool _authorized) external onlyOwner {
        authorized[caller] = _authorized;
        emit AuthorizationUpdated(caller, _authorized);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // ============ Core Functions ============

    /// @notice Log a decision made by an agent
    /// @param strategyId The strategy this decision is for
    /// @param agent The agent address making the decision
    /// @param action The type of action taken
    /// @param oldTickLower Previous lower tick (0 if DEPLOY/HOLD)
    /// @param oldTickUpper Previous upper tick (0 if DEPLOY/HOLD)
    /// @param newTickLower New lower tick (0 if HOLD/EXIT)
    /// @param newTickUpper New upper tick (0 if HOLD/EXIT)
    /// @param confidence Agent's confidence level 0-100
    /// @param reasoning Human-readable reasoning chain
    function logDecision(
        uint256 strategyId,
        address agent,
        IYieldProtocol.ActionType action,
        int24 oldTickLower,
        int24 oldTickUpper,
        int24 newTickLower,
        int24 newTickUpper,
        uint8 confidence,
        string calldata reasoning
    ) external onlyAuthorized {
        require(confidence <= 100, "Confidence 0-100");
        require(bytes(reasoning).length > 0, "Reasoning required");

        IYieldProtocol.Decision memory decision = IYieldProtocol.Decision({
            strategyId: strategyId,
            timestamp: block.timestamp,
            action: action,
            oldTickLower: oldTickLower,
            oldTickUpper: oldTickUpper,
            newTickLower: newTickLower,
            newTickUpper: newTickUpper,
            confidence: confidence,
            reasoning: reasoning
        });

        _decisions[strategyId].push(decision);

        // Update agent stats
        AgentStats storage stats = agentStats[agent];
        stats.totalDecisions++;
        stats.totalConfidence += confidence;

        if (action == IYieldProtocol.ActionType.DEPLOY) stats.deployCount++;
        else if (action == IYieldProtocol.ActionType.REBALANCE) stats.rebalanceCount++;
        else if (action == IYieldProtocol.ActionType.COMPOUND) stats.compoundCount++;
        else if (action == IYieldProtocol.ActionType.EMERGENCY_EXIT) stats.exitCount++;
        else if (action == IYieldProtocol.ActionType.HOLD) stats.holdCount++;

        emit DecisionRecorded(strategyId, agent, action, confidence, reasoning);
    }

    // ============ Views ============

    /// @notice Get all decisions for a strategy
    function getDecisionHistory(uint256 strategyId)
        external
        view
        returns (IYieldProtocol.Decision[] memory)
    {
        return _decisions[strategyId];
    }

    /// @notice Get the latest N decisions for a strategy
    function getRecentDecisions(uint256 strategyId, uint256 count)
        external
        view
        returns (IYieldProtocol.Decision[] memory)
    {
        IYieldProtocol.Decision[] storage all = _decisions[strategyId];
        uint256 len = all.length;
        if (count > len) count = len;

        IYieldProtocol.Decision[] memory recent = new IYieldProtocol.Decision[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = all[len - count + i];
        }
        return recent;
    }

    /// @notice Get decision count for a strategy
    function getDecisionCount(uint256 strategyId) external view returns (uint256) {
        return _decisions[strategyId].length;
    }

    /// @notice Get agent statistics
    function getAgentStats(address agent)
        external
        view
        returns (
            uint256 totalDecisions,
            uint256 averageConfidence,
            uint256 rebalanceCount,
            uint256 holdCount
        )
    {
        AgentStats storage stats = agentStats[agent];
        totalDecisions = stats.totalDecisions;
        averageConfidence = stats.totalDecisions > 0
            ? stats.totalConfidence / stats.totalDecisions
            : 0;
        rebalanceCount = stats.rebalanceCount;
        holdCount = stats.holdCount;
    }

    /// @notice Get the latest decision for a strategy
    function getLatestDecision(uint256 strategyId)
        external
        view
        returns (IYieldProtocol.Decision memory)
    {
        uint256 len = _decisions[strategyId].length;
        require(len > 0, "No decisions");
        return _decisions[strategyId][len - 1];
    }
}
