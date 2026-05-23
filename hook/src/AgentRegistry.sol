// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAgentArena} from "./interfaces/IAgentArena.sol";

/// @title  AgentRegistry
/// @notice On-chain registry for AI agents competing in the AgentArena.
///         Holds stake escrow, tracks reputation, exposes slashing to authorized hooks.
contract AgentRegistry is IAgentArena, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Minimum stake to register (in stake-token wei).
    /// @dev    Hackathon v1: 1 USDT to keep demo barriers low. Production
    ///         versions should raise this to a meaningful slashable amount.
    uint256 public constant MIN_STAKE = 1 * 1e6; // 1 USDT (6 decimals)

    /// @notice Maximum reputation multiplier (×1e4). 20_000 == 2.0×.
    uint256 public constant MAX_REPUTATION = 20_000;

    /// @notice Minimum reputation multiplier (×1e4). 5_000 == 0.5×.
    uint256 public constant MIN_REPUTATION = 5_000;

    /// @notice Starting reputation for new agents (×1e4). 10_000 == 1.0×.
    uint256 public constant INITIAL_REPUTATION = 10_000;

    // ─────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────

    struct Agent {
        bool registered;
        string name;
        string strategyURI;       // ipfs:// or https:// pointer to off-chain spec
        uint256 stake;            // currently escrowed stake
        uint256 reputation;       // reputation × 1e4, starts at INITIAL_REPUTATION
        uint256 cooldownUntil;    // block.timestamp; bidding blocked until then
        uint256 totalSlashed;
        uint256 totalEarned;
        uint256 epochsWon;
        uint256 epochsLost;
    }

    /// @notice The ERC20 token used for staking (e.g. USDT on X Layer).
    IERC20 public immutable stakeToken;

    /// @notice agent address => Agent record.
    mapping(address => Agent) public agents;

    /// @notice Authorized hook contracts that can call slash / reward.
    mapping(address => bool) public authorizedHooks;

    address public owner;

    // ─────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────

    modifier onlyHook() {
        require(authorizedHooks[msg.sender], "not authorized hook");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    constructor(IERC20 _stakeToken) {
        stakeToken = _stakeToken;
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────

    function authorizeHook(address hook, bool ok) external onlyOwner {
        authorizedHooks[hook] = ok;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Registration
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Register a new agent. Locks `initialStake` until withdrawal.
    function register(
        string calldata name,
        string calldata strategyURI,
        uint256 initialStake
    ) external nonReentrant {
        if (agents[msg.sender].registered) revert AlreadyRegistered();
        if (initialStake < MIN_STAKE) revert InsufficientStake();

        stakeToken.safeTransferFrom(msg.sender, address(this), initialStake);

        agents[msg.sender] = Agent({
            registered: true,
            name: name,
            strategyURI: strategyURI,
            stake: initialStake,
            reputation: INITIAL_REPUTATION,
            cooldownUntil: 0,
            totalSlashed: 0,
            totalEarned: 0,
            epochsWon: 0,
            epochsLost: 0
        });

        emit AgentRegistered(msg.sender, name, initialStake);
    }

    /// @notice Top up stake.
    function increaseStake(uint256 amount) external nonReentrant {
        if (!agents[msg.sender].registered) revert NotRegistered();
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        agents[msg.sender].stake += amount;
        emit StakeIncreased(msg.sender, agents[msg.sender].stake);
    }

    /// @notice Withdraw stake. Only allowed if agent is not the current manager of any pool.
    /// @dev    For v1: caller must ensure no active management; checked off-chain.
    ///         v2 will add on-chain hold tracking.
    function withdrawStake(uint256 amount) external nonReentrant {
        Agent storage a = agents[msg.sender];
        if (!a.registered) revert NotRegistered();
        require(a.stake >= amount, "stake underflow");
        require(block.timestamp >= a.cooldownUntil, "in cooldown");
        a.stake -= amount;
        stakeToken.safeTransfer(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Hook-only operations
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Slash a portion of agent's stake. Called by authorized hook on bond violation
    ///         or epoch underperformance. Slashed funds are sent to `to`.
    function slash(
        address agent,
        uint256 amount,
        address to,
        string calldata reason
    ) external onlyHook nonReentrant {
        Agent storage a = agents[agent];
        if (!a.registered) revert NotRegistered();
        uint256 toSlash = amount > a.stake ? a.stake : amount;
        a.stake -= toSlash;
        a.totalSlashed += toSlash;
        if (toSlash > 0) {
            stakeToken.safeTransfer(to, toSlash);
        }
        // Reputation hit (proportional to slash fraction)
        uint256 hit = (toSlash * 1000) / (a.stake + toSlash + 1); // ~ % of pre-slash stake × 10
        _adjustReputation(agent, -int256(hit));
        emit Slashed(agent, toSlash, reason);
    }

    /// @notice Increase reputation (hook calls this on successful epoch).
    function reward(address agent, uint256 reputationBoost, uint256 earnedAmount) external onlyHook {
        Agent storage a = agents[agent];
        if (!a.registered) revert NotRegistered();
        a.totalEarned += earnedAmount;
        a.epochsWon += 1;
        _adjustReputation(agent, int256(reputationBoost));
    }

    /// @notice Record a lost epoch (active manager underperformed).
    function recordLoss(address agent, uint256 reputationPenalty) external onlyHook {
        Agent storage a = agents[agent];
        if (!a.registered) revert NotRegistered();
        a.epochsLost += 1;
        _adjustReputation(agent, -int256(reputationPenalty));
    }

    /// @notice Put agent in cooldown (cannot bid until `until`).
    function setCooldown(address agent, uint256 until) external onlyHook {
        agents[agent].cooldownUntil = until;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function getReputation(address agent) external view returns (uint256) {
        return agents[agent].reputation;
    }

    function getStake(address agent) external view returns (uint256) {
        return agents[agent].stake;
    }

    function isRegistered(address agent) external view returns (bool) {
        return agents[agent].registered;
    }

    function inCooldown(address agent) external view returns (bool) {
        return block.timestamp < agents[agent].cooldownUntil;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────

    function _adjustReputation(address agent, int256 delta) internal {
        Agent storage a = agents[agent];
        int256 newRep = int256(a.reputation) + delta;
        if (newRep > int256(MAX_REPUTATION)) newRep = int256(MAX_REPUTATION);
        if (newRep < int256(MIN_REPUTATION)) newRep = int256(MIN_REPUTATION);
        a.reputation = uint256(newRep);
        emit ReputationUpdated(agent, delta, a.reputation);
    }
}
