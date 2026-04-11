// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IYieldProtocol.sol";
import "./DecisionLogger.sol";

/// @title StrategyManager v2 — On-chain audit & registry for AI-driven LP strategies
/// @notice
/// v2 is a slim, chain-agnostic audit layer. All DEX execution happens off-chain
/// through the OnchainOS `defi` CLI (Agentic Wallet + defi-invest), so the
/// contract has zero dependency on any particular DEX deployment on X Layer.
///
/// What lives on-chain:
///   1. Strategy registry — metadata for each AI-managed LP strategy
///   2. Agent authorization — only whitelisted agents can write
///   3. Execution records — tx hashes and OnchainOS investment IDs for every
///      DEPLOY / REBALANCE / COMPOUND / EMERGENCY_EXIT action
///   4. Decision log hook — every action (including HOLD) goes through
///      DecisionLogger, so judges can scan the full reasoning chain on-chain
///
/// What does NOT live on-chain (by design):
///   - Token custody (Agentic Wallet holds tokens and LP NFTs)
///   - Position NFT references (OnchainOS tracks those externally)
///   - User deposit/withdraw (use FollowVault for copy-trading)
///   - Tick math / pool queries (off-chain agent handles via Uniswap AI Skills)
///
/// Hackathon alignment:
///   - "Best Uniswap AI Skills Integration": off-chain agent uses liquidity-planner
///     + swap-planner to compute strategies, then records the decision here.
///   - "Most Active On-Chain Agent": every execution is an OnchainOS API call,
///     and the resulting tx hash is recorded via `recordExecution()`.
contract StrategyManager is ReentrancyGuard {
    // ============ Immutables ============

    DecisionLogger public immutable decisionLogger;

    // ============ Storage ============

    mapping(uint256 => IYieldProtocol.Strategy) private _strategies;
    uint256 public nextStrategyId;

    /// @notice Per-strategy execution records (OnchainOS tx receipts)
    struct Execution {
        uint256 timestamp;
        IYieldProtocol.ActionType action;
        int24 tickLower;
        int24 tickUpper;
        bytes32 txHash;      // OnchainOS-signed tx hash
        string externalId;   // OnchainOS investment / position id
    }
    mapping(uint256 => Execution[]) private _executions;

    /// @notice Authorized agent addresses
    mapping(address => bool) public agents;

    address public owner;
    address public feeRecipient;

    /// @notice Agent performance fee in basis points (default 10%)
    uint256 public performanceFeeBps = 1000;

    // ============ Events ============

    event StrategyDeployed(
        uint256 indexed strategyId,
        address indexed agent,
        address indexed owner,
        address pool,
        IYieldProtocol.RiskProfile riskProfile
    );

    event StrategyRebalanced(
        uint256 indexed strategyId,
        int24 newTickLower,
        int24 newTickUpper,
        uint8 confidence
    );

    event StrategyCompounded(uint256 indexed strategyId, uint8 confidence);
    event StrategyExited(uint256 indexed strategyId, string reasoning);
    event ExecutionRecorded(
        uint256 indexed strategyId,
        IYieldProtocol.ActionType action,
        bytes32 txHash,
        string externalId
    );

    event AgentUpdated(address indexed agent, bool authorized);
    event PerformanceFeeUpdated(uint256 bps);
    event FeeRecipientUpdated(address indexed recipient);

    // ============ Modifiers ============

    modifier onlyAgent() {
        require(agents[msg.sender], "Not authorized agent");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier strategyExists(uint256 strategyId) {
        require(strategyId < nextStrategyId, "Strategy does not exist");
        _;
    }

    modifier strategyActive(uint256 strategyId) {
        require(_strategies[strategyId].active, "Strategy not active");
        _;
    }

    // ============ Constructor ============

    /// @param _decisionLogger Address of the DecisionLogger contract
    constructor(address _decisionLogger) {
        require(_decisionLogger != address(0), "Zero logger");
        decisionLogger = DecisionLogger(_decisionLogger);
        owner = msg.sender;
        feeRecipient = msg.sender;
    }

    // ============ Admin ============

    function setAgent(address agent, bool authorized) external onlyOwner {
        require(agent != address(0), "Zero agent");
        agents[agent] = authorized;
        emit AgentUpdated(agent, authorized);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Zero address");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setPerformanceFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 3000, "Fee too high"); // Max 30%
        performanceFeeBps = _bps;
        emit PerformanceFeeUpdated(_bps);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // ============ Strategy Deployment ============

    /// @notice Register a new LP strategy on X Layer
    /// @dev
    /// This does NOT mint any Uniswap position. Token custody and the actual
    /// LP NFT stay with the OnchainOS Agentic Wallet. This call is purely an
    /// on-chain audit record: "agent X deployed strategy Y with thesis Z".
    /// The matching on-chain execution (via `onchainos defi invest`) is
    /// recorded separately through `recordExecution()`.
    /// @param pool Pool identifier (can be ZeroAddress if off-chain reference)
    /// @param token0 Token0 of the strategy
    /// @param token1 Token1 of the strategy
    /// @param fee Pool fee tier (e.g., 3000 for 0.3%)
    /// @param positions Planned position parameters (ticks + intended amounts)
    /// @param riskProfile Risk profile for this strategy
    /// @param thesis AI agent's thesis/reasoning for this strategy
    /// @return strategyId The ID of the newly created strategy
    function deployStrategy(
        address pool,
        address token0,
        address token1,
        uint24 fee,
        IYieldProtocol.PositionParams[] calldata positions,
        IYieldProtocol.RiskProfile riskProfile,
        string calldata thesis
    ) external onlyAgent nonReentrant returns (uint256 strategyId) {
        require(positions.length > 0 && positions.length <= 5, "1-5 positions");
        require(token0 != address(0) && token1 != address(0), "Zero token");
        require(token0 != token1, "Same token");
        require(bytes(thesis).length > 0, "Thesis required");

        strategyId = nextStrategyId++;

        IYieldProtocol.Strategy storage strategy = _strategies[strategyId];
        strategy.agent = msg.sender;
        strategy.owner = msg.sender; // agent owns its own strategies
        strategy.pool = pool;
        strategy.token0 = token0;
        strategy.token1 = token1;
        strategy.fee = fee;
        strategy.createdAt = block.timestamp;
        strategy.active = true;
        strategy.riskProfile = riskProfile;

        uint256 totalAmount0;
        uint256 totalAmount1;
        for (uint256 i = 0; i < positions.length; i++) {
            IYieldProtocol.PositionParams calldata pos = positions[i];
            require(pos.tickLower < pos.tickUpper, "Invalid tick range");
            totalAmount0 += pos.amount0Desired;
            totalAmount1 += pos.amount1Desired;
            // Sequential pseudo-id; real LP NFTs are tracked by OnchainOS
            strategy.positionIds.push(i);
        }
        strategy.totalDeposited = totalAmount0 + totalAmount1;

        // Anchor the DEPLOY decision on-chain via DecisionLogger
        int24 mainTickLower = positions[0].tickLower;
        int24 mainTickUpper = positions[0].tickUpper;
        decisionLogger.logDecision(
            strategyId,
            msg.sender,
            IYieldProtocol.ActionType.DEPLOY,
            0, 0,
            mainTickLower, mainTickUpper,
            100,
            thesis
        );

        emit StrategyDeployed(strategyId, msg.sender, msg.sender, pool, riskProfile);
    }

    // ============ Rebalance ============

    /// @notice Record a rebalance decision for a strategy
    /// @dev On-chain execution happens through `onchainos defi withdraw` +
    /// `defi invest`, not through this contract. This call just records the
    /// new target range and reasoning for the audit trail. Call
    /// `recordExecution()` afterwards with the OnchainOS tx hash.
    function rebalance(
        uint256 strategyId,
        IYieldProtocol.PositionParams[] calldata newPositions,
        string calldata reasoning,
        uint8 confidence
    ) external onlyAgent nonReentrant strategyExists(strategyId) strategyActive(strategyId) {
        IYieldProtocol.Strategy storage strategy = _strategies[strategyId];
        require(strategy.agent == msg.sender, "Not strategy agent");
        require(newPositions.length > 0 && newPositions.length <= 5, "1-5 positions");
        require(bytes(reasoning).length > 0, "Reasoning required");
        require(confidence <= 100, "Confidence 0-100");

        // Capture old main range before we rewrite
        int24 oldTickLower;
        int24 oldTickUpper;
        Execution[] storage execHistory = _executions[strategyId];
        if (execHistory.length > 0) {
            Execution storage last = execHistory[execHistory.length - 1];
            oldTickLower = last.tickLower;
            oldTickUpper = last.tickUpper;
        }

        // Replace position descriptors (pseudo-ids only)
        delete strategy.positionIds;
        for (uint256 i = 0; i < newPositions.length; i++) {
            IYieldProtocol.PositionParams calldata pos = newPositions[i];
            require(pos.tickLower < pos.tickUpper, "Invalid tick range");
            strategy.positionIds.push(i);
        }

        int24 newTickLower = newPositions[0].tickLower;
        int24 newTickUpper = newPositions[0].tickUpper;

        decisionLogger.logDecision(
            strategyId,
            msg.sender,
            IYieldProtocol.ActionType.REBALANCE,
            oldTickLower, oldTickUpper,
            newTickLower, newTickUpper,
            confidence,
            reasoning
        );

        emit StrategyRebalanced(strategyId, newTickLower, newTickUpper, confidence);
    }

    // ============ Compound ============

    /// @notice Record a compound (fee-collect + reinvest) decision
    /// @dev Actual fee collection happens via `onchainos defi collect`. Call
    /// `recordExecution()` afterwards.
    function compoundFees(uint256 strategyId, string calldata reasoning, uint8 confidence)
        external
        onlyAgent
        nonReentrant
        strategyExists(strategyId)
        strategyActive(strategyId)
    {
        IYieldProtocol.Strategy storage strategy = _strategies[strategyId];
        require(strategy.agent == msg.sender, "Not strategy agent");
        require(bytes(reasoning).length > 0, "Reasoning required");
        require(confidence <= 100, "Confidence 0-100");

        decisionLogger.logDecision(
            strategyId,
            msg.sender,
            IYieldProtocol.ActionType.COMPOUND,
            0, 0, 0, 0,
            confidence,
            reasoning
        );

        emit StrategyCompounded(strategyId, confidence);
    }

    // ============ Emergency Exit ============

    /// @notice Mark a strategy as exited
    /// @dev Actual position withdrawal happens via `onchainos defi withdraw`.
    function emergencyExit(uint256 strategyId, string calldata reasoning)
        external
        onlyAgent
        nonReentrant
        strategyExists(strategyId)
        strategyActive(strategyId)
    {
        IYieldProtocol.Strategy storage strategy = _strategies[strategyId];
        require(strategy.agent == msg.sender, "Not strategy agent");
        require(bytes(reasoning).length > 0, "Reasoning required");

        strategy.active = false;
        delete strategy.positionIds;

        decisionLogger.logDecision(
            strategyId,
            msg.sender,
            IYieldProtocol.ActionType.EMERGENCY_EXIT,
            0, 0, 0, 0,
            100,
            reasoning
        );

        emit StrategyExited(strategyId, reasoning);
    }

    // ============ HOLD ============

    /// @notice Log a HOLD decision — agent analyzed and chose not to act
    function logHold(
        uint256 strategyId,
        string calldata reasoning,
        uint8 confidence
    ) external onlyAgent strategyExists(strategyId) strategyActive(strategyId) {
        IYieldProtocol.Strategy storage strategy = _strategies[strategyId];
        require(strategy.agent == msg.sender, "Not strategy agent");
        require(bytes(reasoning).length > 0, "Reasoning required");
        require(confidence <= 100, "Confidence 0-100");

        // Latest recorded tick range for context (if any)
        int24 currentTickLower;
        int24 currentTickUpper;
        Execution[] storage execHistory = _executions[strategyId];
        if (execHistory.length > 0) {
            Execution storage last = execHistory[execHistory.length - 1];
            currentTickLower = last.tickLower;
            currentTickUpper = last.tickUpper;
        }

        decisionLogger.logDecision(
            strategyId,
            msg.sender,
            IYieldProtocol.ActionType.HOLD,
            currentTickLower, currentTickUpper,
            currentTickLower, currentTickUpper,
            confidence,
            reasoning
        );
    }

    // ============ OnchainOS Execution Receipts ============

    /// @notice Record the on-chain tx hash from an OnchainOS execution
    /// @dev This is the glue between the off-chain OnchainOS call and the
    /// on-chain audit trail. Judges can verify every action by cross-referencing
    /// these tx hashes against the X Layer explorer.
    /// @param strategyId Target strategy
    /// @param action Action type that was executed
    /// @param tickLower Lower tick of the executed position (0 for non-LP actions)
    /// @param tickUpper Upper tick of the executed position (0 for non-LP actions)
    /// @param txHash On-chain tx hash returned by OnchainOS
    /// @param externalId OnchainOS investment / position id
    function recordExecution(
        uint256 strategyId,
        IYieldProtocol.ActionType action,
        int24 tickLower,
        int24 tickUpper,
        bytes32 txHash,
        string calldata externalId
    ) external onlyAgent strategyExists(strategyId) {
        IYieldProtocol.Strategy storage strategy = _strategies[strategyId];
        require(strategy.agent == msg.sender, "Not strategy agent");
        require(txHash != bytes32(0), "Zero tx hash");

        _executions[strategyId].push(Execution({
            timestamp: block.timestamp,
            action: action,
            tickLower: tickLower,
            tickUpper: tickUpper,
            txHash: txHash,
            externalId: externalId
        }));

        emit ExecutionRecorded(strategyId, action, txHash, externalId);
    }

    // ============ Views ============

    function getStrategy(uint256 strategyId)
        external
        view
        strategyExists(strategyId)
        returns (IYieldProtocol.Strategy memory)
    {
        return _strategies[strategyId];
    }

    function getStrategyPositions(uint256 strategyId)
        external
        view
        returns (uint256[] memory)
    {
        return _strategies[strategyId].positionIds;
    }

    function getExecutions(uint256 strategyId)
        external
        view
        returns (Execution[] memory)
    {
        return _executions[strategyId];
    }

    function getExecutionCount(uint256 strategyId) external view returns (uint256) {
        return _executions[strategyId].length;
    }

    function getLatestExecution(uint256 strategyId)
        external
        view
        returns (Execution memory)
    {
        Execution[] storage execs = _executions[strategyId];
        require(execs.length > 0, "No executions");
        return execs[execs.length - 1];
    }

    function isAgent(address addr) external view returns (bool) {
        return agents[addr];
    }
}
