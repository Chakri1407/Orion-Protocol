// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockAggregatorV3
 * @dev Mock Chainlink price feed for local Hardhat testing.
 *      Simulates a USDC/USD feed returning a configurable price with 8 decimals.
 */
contract MockAggregatorV3 {
    int256 private _price;
    uint8 private _decimals;
    uint80 private _roundId;

    constructor(int256 initialPrice) {
        _price = initialPrice;
        _decimals = 8;
        _roundId = 1;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _price, block.timestamp, block.timestamp, _roundId);
    }

    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _roundId++;
    }
}
