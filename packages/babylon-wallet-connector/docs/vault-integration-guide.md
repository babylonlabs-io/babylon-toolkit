# Vault Wallet Integration Guide

Trustless Bitcoin Vaults (TBV) — Wallet Partner Documentation

- [Overview](#overview)
- [For Wallets Already Supporting BTC Staking](#for-wallets-already-supporting-btc-staking)
- [Bitcoin Wallet Interface](#bitcoin-wallet-interface)
  - [Methods](#methods)
  - [SignPsbtOptions](#signpsbtoptions)
  - [Critical Requirements](#critical-requirements)
- [Ethereum Wallet Interface](#ethereum-wallet-interface)
- [Vault Deposit Flow](#vault-deposit-flow)
- [Reference Implementations](#reference-implementations)
  - [Unisat](#unisat)
  - [OKX](#okx)
- [Testing](#testing)

## Overview

Babylon's Trustless Bitcoin Vaults (TBV) let users lock BTC on Bitcoin and receive vaultBTC on Ethereum for use as DeFi collateral (e.g., lending on Aave). Wallet partners integrating TBV must support **two chains**: a Bitcoin wallet for PSBT signing and message signing, and an Ethereum wallet for on-chain vault registration and DeFi operations.

## For Wallets Already Supporting BTC Staking

If your wallet already implements `IBTCProvider` for Babylon BTC staking, here's what's new for TBV:

- **`signPsbts()` is now critical** — TBV signs multiple PSBTs per deposit + payout pre-signing. Without batch signing, each PSBT requires a separate user approval.
- **`SignPsbtOptions` expanded** — New fields: `contracts`, `action` (required for Ledger policy derivation), `signInputs` with `disableTweakSigner` (required for Taproot script path spends).
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
| Signing prompts per deposit | 6+ (see [flow below](#vault-deposit-flow)) | Fewer — no ETH step, no payout pre-signing |

## Bitcoin Wallet Interface

TBV uses the `IBTCProvider` interface from `@babylonlabs-io/wallet-connector`. Full type definitions are in [`src/core/types.ts`](../src/core/types.ts).

### Methods

All methods below are required for TBV integration.

| Method | Signature | Purpose |
|--------|-----------|---------|
| `connectWallet` | `() => Promise<void>` | Connect to the wallet |
| `getAddress` | `() => Promise<string>` | Get the wallet's current Bitcoin address |
| `getPublicKeyHex` | `() => Promise<string>` | Get the wallet's public key as hex. For Taproot: x-only (32 bytes, 64 hex chars, no `0x` prefix). Compressed (33 bytes, 66 hex chars) also accepted — SDK strips the first byte. |
| `signPsbt` | `(psbtHex: string, options?: SignPsbtOptions) => Promise<string>` | Sign a single PSBT, return signed hex |
| `signPsbts` | `(psbtsHexes: string[], options?: SignPsbtOptions[]) => Promise<string[]>` | Batch sign multiple PSBTs in a single prompt |
| `signMessage` | `(message: string, type: "bip322-simple" \| "ecdsa") => Promise<string>` | Sign a message (BIP-322 or ECDSA), return base64 signature |
| `getNetwork` | `() => Promise<Network>` | Get the connected Bitcoin network |
| `getInscriptions` | `() => Promise<InscriptionIdentifier[]>` | Get inscriptions for UTXO filtering |
| `on` | `(eventName: string, callBack: () => void) => void` | Register event listener (e.g., `"accountChanged"`) |
| `off` | `(eventName: string, callBack: () => void) => void` | Unregister event listener |
| `getWalletProviderName` | `() => Promise<string>` | Get wallet name for display |
| `getWalletProviderIcon` | `() => Promise<string>` | Get wallet icon URL |

### SignPsbtOptions

```ts
interface SignPsbtOptions {
  autoFinalized?: boolean;
  signInputs?: SignInputOptions[];
  contracts?: Contract[];
  action?: Action;
}

interface SignInputOptions {
  index: number;
  address?: string;
  publicKey?: string;
  sighashTypes?: number[];
  disableTweakSigner?: boolean;
  useTweakedSigner?: boolean;
}
```

| Field | Used by TBV | Notes |
|-------|-------------|-------|
| `autoFinalized` | Yes | Whether to finalize PSBT after signing. Unisat defaults `true`, OKX defaults `false`. |
| `signInputs` | Yes | Per-input signing instructions. If omitted, wallet signs all inputs it can. |
| `signInputs[].index` | Yes | Input index to sign |
| `signInputs[].disableTweakSigner` | Yes | **Critical for TBV** — set `true` for Taproot script path spends (untweaked internal key) |
| `signInputs[].useTweakedSigner` | Yes | Set `true` for Taproot key path spends (tweaked key). Used by Unisat auto-detection. |
| `signInputs[].sighashTypes` | Sometimes | Sighash override for specific inputs |
| `contracts` | Ledger only | Contract context for Ledger policy derivation |
| `action` | Ledger only | Action metadata for Ledger |

### Critical Requirements

**`signPsbts()` — Batch Signing**: TBV deposits require signing multiple PSBTs in a single user interaction (PegIn inputs per vault, payout pre-signing). Implementing `signPsbts` gives users a single signing prompt instead of one per PSBT. If your wallet does not support batch signing, the SDK falls back to calling `signPsbt()` sequentially — this works but results in more signing prompts.

**`signMessage()` — Type Parameter**: The `type` parameter is required. TBV uses `"bip322-simple"` for Proof-of-Possession signatures. Your wallet must route to the correct signing algorithm based on this parameter.

**`disableTweakSigner` — Taproot Script Path**: TBV vault transactions use Taproot **script path** spends. When `signInputs` contains `disableTweakSigner: true`, the wallet must sign with the **untweaked** private key (raw internal key), not the key-path-tweaked key. Signing with the tweaked key produces an invalid signature.

## Ethereum Wallet Interface

TBV uses viem's `WalletClient` directly. If your wallet supports any of the following, it works out of the box:

- EIP-1193 provider
- wagmi connector
- WalletConnect

Connection is handled via AppKit / WalletConnect. No `window.ethwallet` injection is required or supported.

The key methods used by TBV are:

| Method | Purpose |
|--------|---------|
| `sendTransaction()` | Register vault on-chain, activate vault, DeFi operations |
| `switchChain()` | Ensure correct network before transactions |

The full `IETHProvider` interface is documented in the [main README](../README.md#iethprovider).

## Vault Deposit Flow

From the wallet's perspective, a deposit triggers these signing prompts in order:

### Step 1: Batch Sign PegIn Input PSBTs

**Method**: `signPsbts(psbtsHexes, options)`

The SDK constructs one PegIn input PSBT per vault in the deposit. All PSBTs are presented for batch signing. These are Taproot script path spends — `signInputs` will include `disableTweakSigner: true`.

### Step 2: Sign Proof-of-Possession

**Method**: `signMessage(message, "bip322-simple")`

A BIP-322 message proving the depositor owns the Bitcoin address. Signed once per deposit session — for multi-vault deposits, the first signature is reused for subsequent vaults.

### Step 3: Register Vaults on Ethereum

**Method**: ETH `sendTransaction()`

A single Ethereum transaction batch-registers all vaults in the deposit on the TBV smart contract with the signed PegIn data and PoP signature.

### Step 4: Sign Pre-PegIn Funding Transaction

**Method**: `signPsbt(psbtHex, options)`

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

### Summary

| Step | Method | Prompts | Notes |
|------|--------|---------|-------|
| 1 | `signPsbts()` | 1 | N PSBTs (one per vault), Taproot script path |
| 2 | `signMessage()` | 1 | BIP-322, reused across vaults |
| 3 | ETH `sendTransaction()` | 1 | Batch registration for all vaults |
| 4 | `signPsbt()` | 1 | Funds the PegIn address |
| 5 | `signPsbts()` | N | Two signing passes per vault (payouts + depositor graph) |
| 6 | ETH `sendTransaction()` | N | Activate each vault after verification |

## Reference Implementations

### Unisat

Source: [`src/core/wallets/btc/unisat/provider.ts`](../src/core/wallets/btc/unisat/provider.ts)

Key behaviors:
- **`signPsbt`**: When `signInputs` is provided, maps to Unisat's `toSignInputs` format passing `useTweakedSigner`. When no `signInputs`, auto-detects Taproot addresses and sets `useTweakedSigner: true` for them. Defaults `autoFinalized: true`.
- **`signPsbts`**: Applies per-PSBT options, same logic as `signPsbt` per entry.
- **`getNetwork`**: Dynamic — calls Unisat's `getChain()`. Maps both `BITCOIN_TESTNET` and `BITCOIN_SIGNET` to `SIGNET`.

### OKX

Source: [`src/core/wallets/btc/okx/provider.ts`](../src/core/wallets/btc/okx/provider.ts)

Key behaviors:
- **`signPsbt`**: When `signInputs` is provided, maps to OKX format. Defaults `autoFinalized: false`. Without `signInputs`, delegates to OKX wallet with no options.
- **`signPsbts`**: Same per-PSBT mapping. Without options, calls OKX directly.
- **`getNetwork`**: Static — returns `config.network` set at construction time. OKX does not support runtime network detection for Signet/Testnet.

### Key Differences

| Behavior | Unisat | OKX |
|----------|--------|-----|
| `autoFinalized` default | `true` | `false` |
| `useTweakedSigner` | Passed through and auto-detected | Ignored |
| Network detection | Dynamic (runtime) | Static (config) |
| Default signing (no `signInputs`) | Auto-generates per-input options | Delegates to wallet |

## Testing

1. **Signet environment** — TBV provides a signet deployment for testing. Contact the Babylon team for access.
2. **Key checks**:
   - `getPublicKeyHex()` returns 64-char hex (x-only, no prefix)
   - `signPsbt()` with `disableTweakSigner: true` signs using the untweaked key
   - `signPsbts()` handles arrays of 5-20 PSBTs without timeout
   - `signMessage("test", "bip322-simple")` returns a valid BIP-322 signature
   - Ethereum `sendTransaction()` works for contract interactions (not just transfers)

## Source Code References

| Component | Path |
|-----------|------|
| `IBTCProvider` interface | [`src/core/types.ts`](../src/core/types.ts) |
| `IETHProvider` interface | [`src/core/types.ts`](../src/core/types.ts) |
| Unisat provider | [`src/core/wallets/btc/unisat/provider.ts`](../src/core/wallets/btc/unisat/provider.ts) |
| OKX provider | [`src/core/wallets/btc/okx/provider.ts`](../src/core/wallets/btc/okx/provider.ts) |
| Ledger provider | [`src/core/wallets/btc/ledger-v2/provider.ts`](../src/core/wallets/btc/ledger-v2/provider.ts) |
| Keystone provider | [`src/core/wallets/btc/keystone/provider.ts`](../src/core/wallets/btc/keystone/provider.ts) |
