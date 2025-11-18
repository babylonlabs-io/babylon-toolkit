// Wallet interfaces
export type {
  BitcoinWallet,
  BitcoinNetwork,
  EthereumWallet,
  Address,
  Hash,
  TransactionRequest,
  TypedData,
} from "./interfaces";

// Mock implementations for testing
export {
  MockBitcoinWallet,
  MockEthereumWallet,
} from "./mocks";
export type {
  MockBitcoinWalletConfig,
  MockEthereumWalletConfig,
} from "./mocks";
