// ETH smart contract client - re-exports for all contract modules

// Shared client
export { ethClient } from "./client";

// Protocol Params
export * as ProtocolParamsQuery from "./protocol-params";
export type { PegInConfiguration, TBVProtocolParams } from "./protocol-params";

// Chainlink Oracle (for independent BTC/USD price)
export * as ChainlinkOracle from "./chainlink";
export type { ChainlinkRoundData } from "./chainlink";

// ERC20
export * as ERC20 from "./erc20";
