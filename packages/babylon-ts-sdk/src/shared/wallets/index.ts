/**
 * Framework-agnostic BTC wallet interface. ETH uses viem's `WalletClient` directly.
 *
 * See the [Wallet Interfaces Guide](https://github.com/babylonlabs-io/babylon-toolkit/blob/main/packages/babylon-ts-sdk/docs/guides/wallet-interfaces.md)
 * for adapter patterns and the planned `deriveContextHash` method.
 *
 * @module wallets
 */

export { BitcoinNetworks } from "./interfaces";
export type {
  BitcoinNetwork,
  BitcoinWallet,
  Hash,
  SignInputOptions,
  SignPsbtOptions,
} from "./interfaces";
