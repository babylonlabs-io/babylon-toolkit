// Export Bitcoin wallet interfaces
export { BitcoinNetworks } from "./BitcoinWallet";
export type {
  BitcoinNetwork,
  BitcoinWallet,
  SignPsbtOptions,
} from "./BitcoinWallet";

// Export Ethereum types (Hash is a convenience alias for viem's Hex)
export type { Hash } from "./EthereumWallet";
