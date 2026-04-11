// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — test-only ERC20 used by FollowVault / StrategyManager unit tests
/// @dev Lives under contracts/test/ so it still gets compiled by hardhat, but
/// the production deploy script (scripts/deploy.ts) never references it, so
/// it cannot accidentally ship to mainnet.
contract MockERC20 is ERC20 {
    uint8 private immutable _customDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _customDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
