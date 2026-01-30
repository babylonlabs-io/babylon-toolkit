// Wallet interfaces
export type {
  BitcoinNetwork,
  BitcoinWallet,
  Hash,
  SignPsbtOptions,
} from "./interfaces";

// Mock implementations for testing
export { MockBitcoinWallet, MockEthereumWallet } from "./mocks";
export type {
  MockBitcoinWalletConfig,
  MockEthereumWalletConfig,
} from "./mocks";
