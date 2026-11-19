// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only stand-in for the Agent ID NFT: a balanceOf anyone can mint to.
///         Never deployed to mainnet; it exists so AgentWall's gate can be tested
///         on a local chain where the real Agent ID contract does not exist.
contract MockAgentId {
    mapping(address => uint256) private _balances;

    function mint(address to) external {
        _balances[to] += 1;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return _balances[owner];
    }
}
