// Shared utilities and cross-cutting concerns
// This module contains wallet interfaces, errors, and common utilities

// Wallet interfaces
export { BitcoinNetworks } from "./wallets";
export type {
  BitcoinNetwork,
  BitcoinWallet,
  Hash,
  SignInputOptions,
  SignPsbtOptions,
} from "./wallets";
