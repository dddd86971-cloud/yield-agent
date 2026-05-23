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

/// @dev Minimal ERC20 for tests (no need for OZ for this purpose).
contract MockERC20 {
    string public name = "Mock USDT";
    string public symbol = "USDT";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @notice Smoke tests for AgentArena on a forked X Layer mainnet.
///
/// Run with:
///   forge test --fork-url https://rpc.xlayer.tech -vvv
contract AgentArenaHookTest is Test {
    using PoolIdLibrary for PoolKey;

    AgentArenaHook hook;
    AgentRegistry registry;
    IERC20 stakeToken;

    address constant AGENT_A = address(0xA1);
    address constant AGENT_B = address(0xB2);
    address constant LP_SINK = address(0xCAFE);

    PoolKey poolKey;
    PoolId  poolId;

    function setUp() public {
        // Mock stake token (we just need an IERC20 that we can mint)
        stakeToken = IERC20(address(new MockERC20()));

        // Deploy registry
        registry = new AgentRegistry(stakeToken);

        // Mine + deploy hook with correct permission flags
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

        // Deploy through the CREATE2 deployer
        bytes memory creationCode = abi.encodePacked(type(AgentArenaHook).creationCode, constructorArgs);
        vm.prank(Config.CREATE2_DEPLOYER);
        assembly {
            let p := add(creationCode, 32)
            let deployed := create2(0, p, mload(creationCode), salt)
            if iszero(deployed) { revert(0, 0) }
        }
        hook = AgentArenaHook(hookAddr);
        registry.authorizeHook(hookAddr, true);

        // Make a poolKey we'll use for bidding
        poolKey = PoolKey({
            currency0:   Currency.wrap(address(stakeToken)),
            currency1:   Currency.wrap(address(0x123456)),
            fee:         LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks:       IHooks(hookAddr)
        });
        poolId = poolKey.toId();
    }

    /// @notice Test: agent can register and stake.
    function test_RegisterAgent() public {
        _mintAndApprove(AGENT_A, 1000 * 1e6);
        vm.prank(AGENT_A);
        registry.register("AgentA", "ipfs://specA", 1000 * 1e6);

        assertEq(registry.getStake(AGENT_A), 1000 * 1e6, "stake mismatch");
        assertEq(registry.getReputation(AGENT_A), 10_000, "initial rep mismatch");
        assertTrue(registry.isRegistered(AGENT_A), "not registered");
    }

    /// @notice Test: bidScore formula favors confident agents (tight band).
    function test_BidScoreFormula() public pure {
        StrategyBond.Bond memory confident = _mkBond(address(0), 1000e6, 1800, 30, 50, 6, 200, 0);
        StrategyBond.Bond memory cautious  = _mkBond(address(0), 1000e6, 1800, 30, 200, 6, 200, 0);

        uint256 confidentScore = StrategyBond.bidScore(confident, 10_000);
        uint256 cautiousScore  = StrategyBond.bidScore(cautious, 10_000);

        assertGt(confidentScore, cautiousScore, "tighter band should score higher");
    }

    /// @notice Test: bond validation reverts on bad spec (use external wrapper to make
    ///         the library revert observable to the cheatcode).
    function test_BondValidation_RevertsOnBadFeeRange() public {
        StrategyBond.Bond memory bad = _mkBond(address(0), 1000e6, 1800, 200, 100, 6, 200, 0); // inverted
        ValidatorWrapper w = new ValidatorWrapper();
        vm.expectRevert(bytes("fee range inverted"));
        w.checkValidate(bad);
    }

    function test_BondValidation_RevertsOnHighAPR() public {
        StrategyBond.Bond memory bad = _mkBond(address(0), 1000e6, 100_000, 30, 80, 6, 200, 0); // 1000% APR
        ValidatorWrapper w = new ValidatorWrapper();
        vm.expectRevert(bytes("APR > 500%"));
        w.checkValidate(bad);
    }

    /// @notice Test: only authorized hook can slash.
    function test_OnlyHookCanSlash() public {
        _mintAndApprove(AGENT_A, 1000 * 1e6);
        vm.prank(AGENT_A);
        registry.register("AgentA", "", 1000 * 1e6);

        vm.expectRevert(bytes("not authorized hook"));
        registry.slash(AGENT_A, 100, LP_SINK, "test");
    }

    // ─── helpers ─────────────────────────────────────────────────────────

    function _mkBond(
        address agent,
        uint256 stake,
        uint256 promisedAPR,
        uint24 minFee,
        uint24 maxFee,
        uint16 maxReb,
        int24 maxTick,
        uint256 nonce
    ) internal pure returns (StrategyBond.Bond memory) {
        return StrategyBond.Bond({
            agent: agent,
            poolId: bytes32(0),
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

    function _mintAndApprove(address to, uint256 amount) internal {
        MockERC20(address(stakeToken)).mint(to, amount);
        vm.prank(to);
        stakeToken.approve(address(registry), type(uint256).max);
    }
}

/// @dev External wrapper so vm.expectRevert can capture library require()s.
contract ValidatorWrapper {
    function checkValidate(StrategyBond.Bond calldata bond) external pure {
        StrategyBond.validate(bond);
    }
}
