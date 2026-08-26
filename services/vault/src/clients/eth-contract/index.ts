// ETH smart contract client - re-exports for all contract modules

// BTCVaultRegistry
export type { OnChainVaultData } from "./btc-vault-registry/query";

// Chainlink Oracle (for independent BTC/USD price)
export type { ChainlinkRoundData } from "./chainlink";

// ERC20
export * as ERC20 from "./erc20";
