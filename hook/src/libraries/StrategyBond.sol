// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title  StrategyBond
/// @notice The data structure every agent must sign and submit to compete for an epoch's
///         management rights. Verified on-chain; hook enforces every field in real-time.
///
/// @dev    The bond is hashed using EIP-712-style domain separation so it can be safely
///         signed by an off-chain TEE wallet (OnchainOS Agentic Wallet).
library StrategyBond {
    /// @notice Agent's signed commitment for one epoch.
    struct Bond {
        address agent;             // address of the agent (TEE wallet)
        bytes32 poolId;            // PoolId.unwrap() of the target V4 pool
        uint256 epochId;           // which epoch this bond is for
        uint256 stakeAmount;       // amount of stake token locked
        uint256 promisedAPRBps;    // committed annualized return, in basis points
        uint24 minFeeBps;          // minimum dynamic fee the agent will set
        uint24 maxFeeBps;          // maximum dynamic fee the agent will set
        uint16 maxRebalancesPerEpoch; // hard cap on rebalance count
        int24 maxTickRange;        // maximum half-width of LP range, in ticks
        uint256 nonce;             // replay protection (per agent)
        bytes signature;           // ECDSA signature over hash(bond)
    }

    /// @dev EIP-712 typehash (excluding signature field).
    bytes32 internal constant BOND_TYPEHASH =
        keccak256(
            "StrategyBond("
            "address agent,"
            "bytes32 poolId,"
            "uint256 epochId,"
            "uint256 stakeAmount,"
            "uint256 promisedAPRBps,"
            "uint24 minFeeBps,"
            "uint24 maxFeeBps,"
            "uint16 maxRebalancesPerEpoch,"
            "int24 maxTickRange,"
            "uint256 nonce"
            ")"
        );

    /// @notice Compute the EIP-712 struct hash for a bond (signature field excluded).
    function structHash(Bond memory bond) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                BOND_TYPEHASH,
                bond.agent,
                bond.poolId,
                bond.epochId,
                bond.stakeAmount,
                bond.promisedAPRBps,
                bond.minFeeBps,
                bond.maxFeeBps,
                bond.maxRebalancesPerEpoch,
                bond.maxTickRange,
                bond.nonce
            )
        );
    }

    /// @notice Bid score formula — higher = more likely to win election.
    /// @dev    score = stake × promisedAPRBps × reputationMultiplier / committedRiskBand
    ///         committedRiskBand = (maxFeeBps - minFeeBps + 1) — tighter band = more confident
    function bidScore(Bond memory bond, uint256 reputationMul1e4) internal pure returns (uint256) {
        uint256 band = uint256(bond.maxFeeBps - bond.minFeeBps) + 1;
        // stake (wad) × promisedAPRBps × reputation / band — keep in uint256 range
        return (bond.stakeAmount * bond.promisedAPRBps * reputationMul1e4) / (band * 1e4);
    }

    /// @notice Sanity-check spec fields. Reverts on egregious values.
    function validate(Bond memory bond) internal pure {
        require(bond.minFeeBps <= bond.maxFeeBps, "fee range inverted");
        require(bond.maxFeeBps <= 10_000, "fee > 1%"); // hard cap 1%
        require(bond.minFeeBps >= 10, "fee < 0.001%"); // hard floor
        require(bond.maxRebalancesPerEpoch <= 24, "rebalances > 24/epoch");
        require(bond.maxTickRange > 0 && bond.maxTickRange <= 887272, "bad tick range");
        require(bond.promisedAPRBps <= 50_000, "APR > 500%"); // sanity
    }
}
