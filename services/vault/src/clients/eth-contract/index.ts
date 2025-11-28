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
export type { Vault } from "./btc-vaults-manager/types";

// Morpho (using direct contract calls)
export * as Morpho from "./morpho";
export type { MorphoMarketSummary, MorphoUserPosition } from "./morpho/types";

// Morpho Oracle (for price feeds in Morpho markets)
export * as MorphoOracle from "./oracle/query";

// ERC20
export * as ERC20 from "./erc20";
