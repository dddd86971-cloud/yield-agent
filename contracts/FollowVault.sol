// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./StrategyManager.sol";

/// @title FollowVault - Allow users to follow/copy successful agent strategies
/// @notice Each vault tracks one strategy. Users deposit USDC, vault mirrors the strategy's positions.
///         Agent earns performance fees from followers' profits.
contract FollowVault is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Immutables ============

    StrategyManager public immutable strategyManager;
    uint256 public immutable strategyId;
    IERC20 public immutable depositToken; // USDC

    // ============ Storage ============

    address public agent;
    uint256 public totalDeposits;
    uint256 public highWaterMark; // For performance fee calculation
    uint256 public performanceFeeBps; // Agent's cut of profits (basis points)

    bool public acceptingDeposits;

    // ============ Events ============

    event Followed(address indexed follower, uint256 amount, uint256 shares);
    event Unfollowed(address indexed follower, uint256 shares, uint256 amount);
    event PerformanceFeeCollected(address indexed agent, uint256 fee);

    // ============ Constructor ============

    constructor(
        address _strategyManager,
        uint256 _strategyId,
        address _depositToken,
        address _agent,
        uint256 _performanceFeeBps,
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        require(_performanceFeeBps <= 3000, "Max 30% fee");

        strategyManager = StrategyManager(_strategyManager);
        strategyId = _strategyId;
        depositToken = IERC20(_depositToken);
        agent = _agent;
        performanceFeeBps = _performanceFeeBps;
        acceptingDeposits = true;
    }

    // ============ Follow (Deposit) ============

    /// @notice Follow a strategy by depositing USDC
    /// @param amount Amount of USDC to deposit
    function follow(uint256 amount) external nonReentrant {
        require(acceptingDeposits, "Vault closed");
        require(amount > 0, "Zero amount");

        depositToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 shares;
        if (totalSupply() == 0) {
            shares = amount;
        } else {
            shares = (amount * totalSupply()) / totalAssets();
        }

        _mint(msg.sender, shares);
        totalDeposits += amount;

        emit Followed(msg.sender, amount, shares);
    }

    /// @notice Unfollow (withdraw) from a strategy
    /// @param shares Number of vault shares to redeem
    function unfollow(uint256 shares) external nonReentrant {
        require(shares > 0, "Zero shares");
        require(balanceOf(msg.sender) >= shares, "Insufficient shares");

        uint256 assets = (shares * totalAssets()) / totalSupply();

        _burn(msg.sender, shares);

        // Collect performance fee on profit
        uint256 fee = _calculatePerformanceFee(shares, assets);
        uint256 netAmount = assets - fee;

        if (fee > 0) {
            depositToken.safeTransfer(agent, fee);
            emit PerformanceFeeCollected(agent, fee);
        }

        depositToken.safeTransfer(msg.sender, netAmount);

        emit Unfollowed(msg.sender, shares, netAmount);
    }

    // ============ Agent Operations ============

    /// @notice Agent can close the vault to new deposits
    function setAcceptingDeposits(bool _accepting) external {
        require(msg.sender == agent, "Not agent");
        acceptingDeposits = _accepting;
    }

    // ============ Views ============

    /// @notice Total assets held by the vault
    function totalAssets() public view returns (uint256) {
        return depositToken.balanceOf(address(this));
    }

    /// @notice Preview how many shares you'd get for a deposit
    function previewFollow(uint256 amount) external view returns (uint256) {
        if (totalSupply() == 0) return amount;
        return (amount * totalSupply()) / totalAssets();
    }

    /// @notice Preview how much you'd get for redeeming shares
    function previewUnfollow(uint256 shares) external view returns (uint256) {
        if (totalSupply() == 0) return 0;
        return (shares * totalAssets()) / totalSupply();
    }

    /// @notice Get vault info
    function getVaultInfo()
        external
        view
        returns (
            uint256 _strategyId,
            address _agent,
            uint256 _totalAssets,
            uint256 _totalShares,
            uint256 _performanceFeeBps,
            bool _acceptingDeposits
        )
    {
        return (
            strategyId,
            agent,
            totalAssets(),
            totalSupply(),
            performanceFeeBps,
            acceptingDeposits
        );
    }

    // ============ Internal ============

    function _calculatePerformanceFee(uint256 shares, uint256 assets)
        internal
        view
        returns (uint256)
    {
        // Calculate the proportional deposit amount for these shares
        uint256 depositPortion = (shares * totalDeposits) / (totalSupply() + shares);

        // Only charge fee on profit
        if (assets <= depositPortion) return 0;

        uint256 profit = assets - depositPortion;
        return (profit * performanceFeeBps) / 10000;
    }
}

/// @title FollowVaultFactory - Creates FollowVaults for strategies
contract FollowVaultFactory {
    StrategyManager public immutable strategyManager;

    mapping(uint256 => address) public vaults; // strategyId => vault
    uint256[] public allStrategyIds;

    event VaultCreated(uint256 indexed strategyId, address indexed vault, address indexed agent);

    constructor(address _strategyManager) {
        strategyManager = StrategyManager(_strategyManager);
    }

    /// @notice Create a follow vault for a strategy
    function createVault(
        uint256 strategyId,
        address depositToken,
        uint256 performanceFeeBps,
        string calldata name,
        string calldata symbol
    ) external returns (address vault) {
        require(vaults[strategyId] == address(0), "Vault exists");

        IYieldProtocol.Strategy memory strategy = strategyManager.getStrategy(strategyId);
        require(strategy.agent == msg.sender, "Not strategy agent");
        require(strategy.active, "Strategy not active");

        FollowVault newVault = new FollowVault(
            address(strategyManager),
            strategyId,
            depositToken,
            msg.sender,
            performanceFeeBps,
            name,
            symbol
        );

        vault = address(newVault);
        vaults[strategyId] = vault;
        allStrategyIds.push(strategyId);

        emit VaultCreated(strategyId, vault, msg.sender);
    }

    /// @notice Get all strategy IDs that have vaults
    function getAllVaults() external view returns (uint256[] memory) {
        return allStrategyIds;
    }

    /// @notice Get vault count
    function vaultCount() external view returns (uint256) {
        return allStrategyIds.length;
    }
}
