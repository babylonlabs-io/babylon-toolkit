export { createMockBtcWallet } from "./mockBtcWallet";
export type {
  MockBtcScript,
  MockBtcWallet,
  MockBtcWalletOptions,
} from "./mockBtcWallet";
export { createMockEthWallet } from "./mockEthWallet";
export type {
  MockEthScript,
  MockEthWallet,
  MockEthWalletOptions,
} from "./mockEthWallet";
export {
  E2E_WALLETS_GLOBAL,
  clearInjectedWallets,
  getInjectedWallets,
  injectWallets,
} from "./walletInjection";
export type { InjectedWallets } from "./walletInjection";
