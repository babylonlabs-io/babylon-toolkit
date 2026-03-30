// ETH smart contract client - re-exports for all contract modules

// Shared client
export { ethClient } from "./client";

// BTCVaultRegistry
export type { OnChainVaultData } from "./btc-vault-registry/query";

// Protocol Params
export type { PegInConfiguration, TBVProtocolParams } from "./protocol-params";

// Chainlink Oracle (for independent BTC/USD price)
export type { ChainlinkRoundData } from "./chainlink";

// ERC20
export * as ERC20 from "./erc20";
