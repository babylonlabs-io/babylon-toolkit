// ETH smart contract client - re-exports for all contract modules

// Shared client
export { ethClient } from './client';

// Vault Controller
export * as VaultController from './vault-controller/query';
export * as VaultControllerTx from './vault-controller/transaction';
export type { MarketParams } from './vault-controller/transaction';
export type { VaultMetadata } from './vault-controller/query';

// BTC Vaults Manager
export * as BTCVaultsManager from './btc-vaults-manager/query';
export type { PeginRequest } from './btc-vaults-manager/query';

// Morpho (using official SDK)
export * as Morpho from './morpho/query';
export type { MarketTokenRef, MorphoMarketSummary, MorphoUserPosition } from './morpho/types';

// Oracle (Chainlink)
export * as Oracle from './oracle/chainlinkOracle';

// ERC20
export * as ERC20 from './erc20';
