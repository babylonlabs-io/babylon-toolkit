// ETH smart contract client - re-exports for all contract modules

// Shared client
export { ethClient } from "./client";

// Morpho Integration Controller
export * as MorphoController from "./morpho-controller/query";
export type { MarketPosition } from "./morpho-controller/query";
export * as MorphoControllerTx from "./morpho-controller/transaction";
export type { MarketParams } from "./morpho-controller/transaction";

// BTC Vaults Manager
export * as BTCVaultsManagerTx from "./btc-vaults-manager/transaction";

// Morpho (using direct contract calls, includes market oracle)
export * as Morpho from "./morpho";
export type { MorphoMarketSummary, MorphoUserPosition } from "./morpho/types";

// Chainlink Oracle (for independent BTC/USD price)
export * as ChainlinkOracle from "./chainlink";
export type { ChainlinkRoundData } from "./chainlink";

// ERC20
export * as ERC20 from "./erc20";
