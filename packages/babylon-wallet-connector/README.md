<p align="center">
    <img
        alt="Babylon Logo"
        src="https://github.com/user-attachments/assets/dc74271e-90f1-44bd-9122-2b7438ab375c"
        width="100"
    />
    <h3 align="center">@babylonlabs-io/wallet-connect</h3>
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

The Babylon Wallet Connector repository provides the wallet connection component
used in the Babylon Staking Dashboard. This component enables the connection of
both Bitcoin and Babylon Genesis chain wallets.

## 🔑 Key Features

- Unified interfaces for Bitcoin and Babylon wallet connections
- Support for browser extension wallets
- Support for hardware wallets
- Mobile wallet compatibility through injectable interfaces
- Tomo Connect integration for broader wallet ecosystem

## 🧐 Overview

The Babylon Wallet Connector provides a unified interface for integrating both
Bitcoin and Babylon wallets into Babylon dApp. It supports both native wallet
extensions and injectable mobile wallets.

The main architectural difference is that native wallets are built into the
library, while injectable wallets can be dynamically added by injecting their
implementation into the webpage's `window` object before the dApp loads.

## 👨🏻‍💻 Installation

```bash
npm i @babylonlabs-io/wallet-connect
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

This guide explains how to integrate wallets with the Babylon staking app. The
dApp supports both Bitcoin and Babylon wallets through two integration paths:

### 1. Browser extension wallets

The recommended way to integrate your wallet with Babylon staking app is through
[Tomo Connect SDK Lite](https://docs.tomo.inc/tomo-sdk/tomo-connect-sdk-lite).
Please refer to Tomo's documentation for integration details.

### 2. Mobile wallets

Full interface definitions can be found in
[src/core/types.ts](src/core/types.ts).

Below we outline the interfaces for Bitcoin and Babylon wallets that need to be
implemented for integration with the Babylon staking app.

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

1. Implement provider interface
2. Inject into `window` before loading dApp:

```ts
// For Bitcoin wallets
window.btcwallet = new BTCWalletImplementation();

// For Babylon wallets
window.bbnwallet = new BBNWalletImplementation();
```
