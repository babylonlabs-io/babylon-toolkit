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

// ERC20
export * as ERC20 from './erc20/query';
export type { TokenMetadata } from './erc20/types';

// Morpho
export * as Morpho from './morpho/query';
export type { MarketTokenRef, MorphoMarketSummary } from './morpho/types';
