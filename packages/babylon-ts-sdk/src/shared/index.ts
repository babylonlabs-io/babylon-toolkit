// Shared utilities and cross-cutting concerns
// This module contains wallet interfaces, errors, and common utilities

// Wallet interfaces and implementations
export type {
  BitcoinNetwork,
  BitcoinWallet,
  Hash,
  SignPsbtOptions,
} from "./wallets";

export { MockBitcoinWallet, MockEthereumWallet } from "./wallets";

export type {
  MockBitcoinWalletConfig,
  MockEthereumWalletConfig,
} from "./wallets";
