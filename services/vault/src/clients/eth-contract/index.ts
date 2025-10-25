// ETH smart contract client - re-exports for all contract modules

// Shared client
export { ethClient } from "./client";

// Vault Controller
export * as VaultController from "./vault-controller/query";
export type { MarketPosition } from "./vault-controller/query";
export * as VaultControllerTx from "./vault-controller/transaction";
export type { MarketParams } from "./vault-controller/transaction";

// BTC Vaults Manager
export * as BTCVaultsManager from "./btc-vaults-manager/query";
export type { PeginRequest } from "./btc-vaults-manager/query";

// Morpho (using direct contract calls)
export * as Morpho from "./morpho";
export type { MorphoMarketSummary, MorphoUserPosition } from "./morpho/types";

// Morpho Oracle (for price feeds in Morpho markets)
export * as MorphoOracle from "./oracle/query";

// ERC20
export * as ERC20 from "./erc20";
