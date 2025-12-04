// Wallet interfaces
export type {
  Address,
  BitcoinNetwork,
  BitcoinWallet,
  EthereumWallet,
  Hash,
  SignPsbtOptions,
  TransactionRequest,
  TypedData,
} from "./interfaces";

// Mock implementations for testing
export { MockBitcoinWallet, MockEthereumWallet } from "./mocks";
export type {
  MockBitcoinWalletConfig,
  MockEthereumWalletConfig,
} from "./mocks";
