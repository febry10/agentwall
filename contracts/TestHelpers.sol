// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only helpers. Never deployed to mainnet.
///         BalanceReader reads balances inside the EVM (authoritative even if a
///         local chain's eth_getBalance RPC misbehaves), and TipJar is a
///         contract recipient that records what it actually receives.
contract BalanceReader {
    function bal(address who) external view returns (uint256) {
        return who.balance;
    }
}

contract TipJar {
    uint256 public received;
    uint256 public calls;

    receive() external payable {
        received += msg.value;
        calls += 1;
    }
}
