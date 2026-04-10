<p align="center">
    <img
        alt="Babylon Logo"
        src="https://github.com/user-attachments/assets/dc74271e-90f1-44bd-9122-2b7438ab375c"
        width="100"
    />
    <h3 align="center">@babylonlabs-io/wallet-connector</h3>
    <p align="center">Babylon Wallet Connector</p>
</p>
<br/>

- [Key Features](#key-features)
- [Overview](#overview)
- [Installation](#installation)
- [Version Release](#version-release)
  - [Stable version](#stable-version)
- [Storybook](#storybook)
- [Wallet Integration](#wallet-integration)
  - [1. Browser extension wallets](#1-browser-extension-wallets)
  - [2. Mobile wallets](#2-mobile-wallets)
  - [IProvider](#iprovider)
    - [IBTCProvider](#ibtcprovider)
    - [IBBNProvider](#ibbnprovider)
    - [SignPsbtOptions](#signpsbtoptions)
    - [IETHProvider](#iethprovider)
  - [Wallet Injection](#wallet-injection)
- [Vault Integration Guide](#vault-integration-guide)

The Babylon Wallet Connector repository provides the wallet connection component
used in Babylon dApps. This component enables the connection of Bitcoin, Babylon
Genesis chain, and Ethereum wallets.

## 🔑 Key Features

- Unified interfaces for Bitcoin, Babylon, and Ethereum wallet connections
- Support for browser extension wallets
- Support for hardware wallets
- Mobile wallet compatibility through injectable interfaces
- Tomo Connect integration for broader wallet ecosystem

## 🧐 Overview

The Babylon Wallet Connector provides a unified interface for integrating
Bitcoin, Babylon, and Ethereum wallets into Babylon dApps. It supports native
wallet extensions, injectable mobile wallets, and AppKit/WalletConnect for ETH.

The main architectural difference is that native wallets are built into the
library, while injectable wallets can be dynamically added by injecting their
implementation into the webpage's `window` object before the dApp loads.

## 👨🏻‍💻 Installation

```bash
npm i @babylonlabs-io/wallet-connector
```

## 📝 Commit Format & Automated Releases

This project uses
[**Conventional Commits**](https://www.conventionalcommits.org/en/v1.0.0/) and
[**semantic-release**](https://semantic-release.gitbook.io/) to automate
versioning, changelog generation, and npm publishing.

### ✅ How It Works

1. All commits must follow the **Conventional Commits** format.
2. When changes are merged into the `main` branch:
   - `semantic-release` analyzes commit messages
   - Determines the appropriate semantic version bump (`major`, `minor`,
     `patch`)
   - Tags the release in Git with release change log
   - Publishes the new version to npm

### 🧱 Commit Message Examples

```console
feat: add support for slashing script
fix: handle invalid staking tx gracefully
docs: update README with commit conventions
refactor!: remove deprecated method and cleanup types
```

> **Note:** For breaking changes, add a `!` after the type ( e.g. `feat!:` or
> `refactor!:`) and include a description of the breaking change in the commit
> body.

### 🚀 Releasing

Just commit your changes using the proper format and merge to `main`. The CI
pipeline will handle versioning and releasing automatically — no manual tagging
or version bumps needed.

## 📖 Storybook

```bash
npm run dev
```

## 💳 Wallet Integration

> ⚠️ **IMPORTANT**: Breaking changes to the wallet methods used by the Babylon
> web application are likely to cause incompatibility with it or lead to
> unexpected behavior with severe consequences.
>
> Please make sure to always maintain backwards compatibility and test
> thoroughly all changes affecting the methods required by the Babylon web
> application. If you are unsure about a change, please reach out to the Babylon
> Labs team.

This guide explains how to integrate wallets with Babylon dApps. The
wallet connector supports Bitcoin, Babylon, and Ethereum wallets through two integration paths:

### 1. Browser extension wallets

The recommended way to integrate your wallet with Babylon dApps is through
[Tomo Connect SDK Lite](https://docs.tomo.inc/tomo-sdk/tomo-connect-sdk-lite).
Please refer to Tomo's documentation for integration details.

### 2. Mobile wallets

Full interface definitions can be found in
[src/core/types.ts](src/core/types.ts).

Below we outline the interfaces for Bitcoin, Babylon, and Ethereum wallets that need to be
implemented for integration with Babylon dApps.

### IProvider

```ts
export interface IProvider {
  /**
   * Connects to the wallet and returns the instance of the wallet provider.
   * Currently Bitcoin only supports Native SegWit and Taproot address types.
   * @returns A promise that resolves to an instance of the wrapper wallet provider.
   * @throws An error if the wallet is not installed or if connection fails.
   */
  connectWallet(): Promise<void>;

  /**
   * Gets the address of the connected wallet.
   * @returns A promise that resolves to the address of the connected wallet.
   */
  getAddress(): Promise<string>;

  /**
   * Gets the public key of the connected wallet.
   * @returns A promise that resolves to the public key of the connected wallet.
   */
  getPublicKeyHex(): Promise<string>;
}
```

#### IBTCProvider

```ts
interface IBTCProvider extends IProvider {
  /**
   * Signs the given PSBT in hex format.
   * @param psbtHex - The hex string of the unsigned PSBT to sign.
   * @param options - Optional parameters for signing the PSBT.
   * @returns A promise that resolves to the hex string of the signed PSBT.
   */
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;

  /**
   * Signs multiple PSBTs in hex format.
   * @param psbtsHexes - The hex strings of the unsigned PSBTs to sign.
   * @param options - Optional parameters for signing the PSBTs.
   * @returns A promise that resolves to an array of hex strings, each representing a signed PSBT.
   */
  signPsbts(
    psbtsHexes: string[],
    options?: SignPsbtOptions[],
  ): Promise<string[]>;

  /**
   * Gets the network of the current account.
   * @returns A promise that resolves to the network of the current account.
   */
  getNetwork(): Promise<Network>;

  /**
   * Signs a message using either BIP322-Simple or ECDSA signing method.
   * @param message - The message to sign.
   * @param type - The signing method to use.
   * @returns A promise that resolves to the signed message.
   */
  signMessage(
    message: string,
    type: "bip322-simple" | "ecdsa",
  ): Promise<string>;

  /**
   * Retrieves the inscriptions for the connected wallet.
   * @returns A promise that resolves to an array of inscriptions.
   */
  getInscriptions(): Promise<InscriptionIdentifier[]>;

  /**
   * Registers an event listener for the specified event.
   * At the moment, only the "accountChanged" event is supported.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  on(eventName: string, callBack: () => void): void;

  /**
   * Unregisters an event listener for the specified event.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  off(eventName: string, callBack: () => void): void;

  /**
   * Gets the name of the wallet provider.
   * @returns A promise that resolves to the name of the wallet provider.
   */
  getWalletProviderName(): Promise<string>;

  /**
   * Gets the icon of the wallet provider.
   * @returns A promise that resolves to the icon of the wallet provider.
   */
  getWalletProviderIcon(): Promise<string>;

  /**
   * Gets the version of the wallet provider.
   * @returns A promise that resolves to the version of the wallet provider.
   */
  getVersion?(): Promise<string>;
}
```

#### IBBNProvider

```ts
export interface IBBNProvider extends IProvider {
  /**
   * Gets the name of the wallet provider.
   * @returns A promise that resolves to the name of the wallet provider.
   */
  getWalletProviderName(): Promise<string>;

  /**
   * Gets the icon of the wallet provider.
   * @returns A promise that resolves to the icon of the wallet provider.
   */
  getWalletProviderIcon(): Promise<string>;

  /**
   * Retrieves an offline signer that supports both Amino and Direct signing methods.
   * This signer is used for signing transactions offline before broadcasting them to the network.
   *
   * @returns {Promise<OfflineAminoSigner & OfflineDirectSigner>} A promise that resolves to a signer supporting both Amino and Direct signing
   * @throws {Error} If wallet connection is not established or signer cannot be retrieved
   */
  getOfflineSigner(): Promise<OfflineAminoSigner & OfflineDirectSigner>;

  /**
   * Retrieves an offline signer that supports either Amino or Direct signing methods.
   * This is required for compatibility with older wallets and hardware wallets (like Ledger) that do not support both signing methods.
   * This signer is used for signing transactions offline before broadcasting them to the network.
   *
   * @returns {Promise<OfflineAminoSigner & OfflineDirectSigner>} A promise that resolves to a signer supporting either Amino or Direct signing
   * @throws {Error} If wallet connection is not established or signer cannot be retrieved
   */
  getOfflineSignerAuto?(): Promise<OfflineAminoSigner | OfflineDirectSigner>;

  /**
   * Registers an event listener for the specified event.
   * At the moment, only the "accountChanged" event is supported.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  on(eventName: string, callBack: () => void): void;

  /**
   * Unregisters an event listener for the specified event.
   * @param eventName - The name of the event to listen for.
   * @param callBack - The callback function to be executed when the event occurs.
   */
  off(eventName: string, callBack: () => void): void;

  /**
   * Gets the version of the wallet provider.
   * @returns A promise that resolves to the version of the wallet provider.
   */
  getVersion?(): Promise<string>;
}
```

#### SignPsbtOptions

```ts
export interface SignInputOptions {
  /** Input index to sign */
  index: number;
  /** Address for signing (optional) */
  address?: string;
  /** Public key for signing (optional, hex string) */
  publicKey?: string;
  /** Sighash types (optional) */
  sighashTypes?: number[];
  /**
   * Disable tweak signer for Taproot script path spend.
   * When true, sign with the untweaked internal key.
   */
  disableTweakSigner?: boolean;
}

export interface SignPsbtOptions {
  /** Whether to automatically finalize the PSBT after signing */
  autoFinalized?: boolean;
  /**
   * Specific inputs to sign.
   * If not provided, wallet will attempt to sign all inputs it
   * can.
   */
  signInputs?: SignInputOptions[];
}
```

#### IETHProvider

```ts
export interface IETHProvider extends IProvider {
  /**
   * Signs a message using personal_sign (EIP-191).
   */
  signMessage(message: string): Promise<string>;

  /**
   * Signs structured data using eth_signTypedData_v4 (EIP-712).
   */
  signTypedData(typedData: ETHTypedData): Promise<string>;

  /**
   * Sends a transaction to the blockchain.
   * @returns Transaction hash
   */
  sendTransaction(
    tx: ETHTransactionRequest,
  ): Promise<string>;

  /**
   * Estimates gas for a transaction.
   */
  estimateGas(
    tx: ETHTransactionRequest,
  ): Promise<bigint>;

  /**
   * Gets the current chain ID.
   */
  getChainId(): Promise<number>;

  /**
   * Switches to a different chain.
   */
  switchChain(chainId: number): Promise<void>;

  /**
   * Gets the account balance in wei.
   */
  getBalance(): Promise<bigint>;

  /**
   * Gets the account nonce.
   */
  getNonce(): Promise<number>;

  /**
   * Gets network information.
   */
  getNetworkInfo(): Promise<NetworkInfo>;

  /**
   * Gets the wallet provider name (synchronous).
   */
  getWalletProviderName(): string;

  /**
   * Gets the wallet provider icon (synchronous).
   */
  getWalletProviderIcon(): string;

  on(eventName: string, handler: Function): void;
  off(eventName: string, handler: Function): void;
}

export interface ETHTransactionRequest {
  to: string;
  value?: string;
  data?: string;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export interface ETHTypedData {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  types: Record<
    string,
    Array<{ name: string; type: string }>
  >;
  primaryType: string;
  message: Record<string, any>;
}

export interface NetworkInfo {
  name: string;
  chainId: string;
}
```

> **Note**: `getWalletProviderName()` and
> `getWalletProviderIcon()` on `IETHProvider` are **synchronous**
> (return `string`), unlike the async versions on `IBTCProvider`
> and `IBBNProvider`.

ETH wallets connect via AppKit / WalletConnect (standard
EIP-1193). No `window.ethwallet` injection is supported.

### Wallet Injection

1. Implement provider interface
2. Inject into `window` before loading dApp:

```ts
// For Bitcoin wallets
window.btcwallet = new BTCWalletImplementation();

// For Babylon wallets
window.bbnwallet = new BBNWalletImplementation();

// For Ethereum wallets — no injection needed.
// ETH connects via AppKit / WalletConnect.
```

## Vault Integration Guide

For detailed documentation on integrating wallets with Babylon's Trustless Bitcoin Vaults (TBV), including the full deposit transaction flow, signing options, and reference implementations, see the [Vault Integration Guide](docs/vault-integration-guide.md).
