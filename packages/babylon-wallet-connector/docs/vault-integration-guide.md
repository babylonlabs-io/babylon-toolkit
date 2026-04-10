# Vault Wallet Integration Guide

- [Overview](#overview)
- [For Wallets Already Supporting BTC Staking](#for-wallets-already-supporting-btc-staking)
- [Bitcoin Wallet Interface](#bitcoin-wallet-interface)
  - [SignPsbtOptions](#signpsbtoptions)
- [Ethereum Wallet Interface](#ethereum-wallet-interface)
- [Vault Deposit Flow](#vault-deposit-flow)
- [Source Code References](#source-code-references)

## Overview

Babylon's Trustless Bitcoin Vaults (TBV) let users lock BTC on Bitcoin and receive vaultBTC on Ethereum for use as DeFi collateral. Wallet partners must support **two chains**: a Bitcoin wallet for PSBT signing and message signing, and an Ethereum wallet via WalletConnect.

## For Wallets Already Supporting BTC Staking

If your wallet already implements `IBTCProvider` for Babylon BTC staking, here's what's new for TBV:

- **`signPsbts()` is now critical** — TBV signs multiple PSBTs per deposit + payout pre-signing. Without batch signing, each PSBT requires a separate user approval.
- **`SignPsbtOptions` expanded** — New field `signInputs` with `disableTweakSigner` (required for Taproot script path spends).
- **Ethereum wallet required** — Staking was BTC-only. TBV requires an ETH wallet for on-chain registration and DeFi. Uses viem `WalletClient` — any EIP-1193/wagmi/WalletConnect wallet works.
- **No more BBN/Cosmos** — Staking used `IBBNProvider`. TBV replaces this with Ethereum.

| Aspect | TBV Vault | BTC Staking |
|--------|-----------|-------------|
| Bitcoin wallet interface | `IBTCProvider` from wallet-connector | Same interface |
| Ethereum wallet | **Required** — viem `WalletClient` via AppKit/WalletConnect | Not required |
| Batch signing (`signPsbts`) | Critical — multiple PSBTs per deposit + payouts | Used for delegation |
| Message signing | `"bip322-simple"` for Proof-of-Possession | Same |
| Taproot script path | `disableTweakSigner: true` | Same |
| Chain requirement | **Dual-chain**: Bitcoin + Ethereum | Single-chain: Bitcoin + Babylon Genesis (Cosmos) |

## Bitcoin Wallet Interface

TBV uses the `IBTCProvider` interface from `@babylonlabs-io/wallet-connector`. Full type definitions are in [`src/core/types.ts`](../src/core/types.ts).

| Method | Signature | Purpose |
|--------|-----------|---------|
| `connectWallet` | `() => Promise<void>` | Connect to the wallet |
| `getAddress` | `() => Promise<string>` | Get the wallet's current Bitcoin address |
| `getPublicKeyHex` | `() => Promise<string>` | Get the wallet's public key as hex. For Taproot: x-only (32 bytes, 64 hex chars, no `0x` prefix). Compressed (33 bytes, 66 hex chars) also accepted — SDK strips the first byte. |
| `signPsbt` | `(psbtHex: string, options?: SignPsbtOptions) => Promise<string>` | Sign a single PSBT, return signed hex. See [SignPsbtOptions](#signpsbtoptions) — must support `disableTweakSigner` for Taproot script path spends. |
| `signPsbts` | `(psbtsHexes: string[], options?: SignPsbtOptions[]) => Promise<string[]>` | Batch sign multiple PSBTs in a single prompt. TBV signs multiple PSBTs per deposit + payout pre-signing. Without this, the SDK falls back to sequential `signPsbt()` calls (more user prompts). |
| `signMessage` | `(message: string, type: "bip322-simple" \| "ecdsa") => Promise<string>` | Sign a message. The `type` parameter is required — TBV uses `"bip322-simple"` for Proof-of-Possession. Route to the correct signing algorithm based on this parameter. |
| `getNetwork` | `() => Promise<Network>` | Get the connected Bitcoin network |
| `on` | `(eventName: string, callBack: () => void) => void` | Register event listener (e.g., `"accountChanged"`) |
| `off` | `(eventName: string, callBack: () => void) => void` | Unregister event listener |
| `getInscriptions` | `() => Promise<InscriptionIdentifier[]>` | Optional. Get inscriptions for UTXO filtering. |

### SignPsbtOptions

```ts
interface SignPsbtOptions {
  autoFinalized?: boolean;
  signInputs?: SignInputOptions[];
}

interface SignInputOptions {
  index: number;
  address?: string;
  publicKey?: string;
  sighashTypes?: number[];
  disableTweakSigner?: boolean;
}
```

**`disableTweakSigner`**: TBV vault transactions use Taproot **script path** spends. When `disableTweakSigner: true`, the wallet must sign with the **untweaked** private key (raw internal key). Signing with the tweaked key produces an invalid signature.

## Ethereum Wallet Interface

The ETH wallet must be compatible with WalletConnect. Connection is handled via AppKit / WalletConnect.

The full `IETHProvider` interface is documented in the [main README](../README.md#iethprovider).

## Vault Deposit Flow

From the wallet's perspective, a deposit triggers these signing prompts in order:

### Step 1: Sign Proof-of-Possession

**Method**: `signMessage(message, "bip322-simple")`

A BIP-322 message proving the depositor owns the Bitcoin address. Signed once per deposit session — for multi-vault deposits, the first signature is reused for subsequent vaults.

### Step 2: Batch Sign PegIn Input PSBTs

**Method**: `signPsbts(psbtsHexes, options)`

The SDK constructs one PegIn input PSBT per vault in the deposit. All PSBTs are presented for batch signing. These are Taproot script path spends — `signInputs` will include `disableTweakSigner: true`.

### Step 3: Register Vaults on Ethereum

**Method**: ETH `sendTransaction()`

A single Ethereum transaction batch-registers all vaults in the deposit on the TBV smart contract with the signed PegIn data and PoP signature.

### Step 4: Sign Pre-PegIn Funding Transaction

**Method**: `signPsbts(psbtsHexes, options)`

After Ethereum registration succeeds, the Bitcoin funding transaction (Pre-PegIn) is signed and broadcast. This funds the PegIn address on Bitcoin.

### Step 5: Sign Payout Transactions

**Method**: `signPsbts(psbtsHexes, options)`

After Bitcoin confirmation, the wallet pre-signs payout transactions in two passes per vault:
1. **Claimer payout signing** — payout, no-payout, challenge-assert PSBTs per challenger
2. **Depositor-as-claimer presigning** — depositor graph PSBTs

These signatures are stored by the vault provider and used if a payout event occurs later.

### Step 6: Activate Vault on Ethereum

**Method**: ETH `sendTransaction()`

After vault verification completes (~12 min), the wallet sends an `activateVaultWithSecret` transaction per vault to finalize activation.

## Source Code References

| Component | Path |
|-----------|------|
| `IBTCProvider` interface | [`src/core/types.ts`](../src/core/types.ts) |
| `IETHProvider` interface | [`src/core/types.ts`](../src/core/types.ts) |
| Unisat provider (reference) | [`src/core/wallets/btc/unisat/provider.ts`](../src/core/wallets/btc/unisat/provider.ts) |
| OKX provider (reference) | [`src/core/wallets/btc/okx/provider.ts`](../src/core/wallets/btc/okx/provider.ts) |
