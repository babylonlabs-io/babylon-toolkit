# Vault Wallet Integration Guide

- [Overview](#overview)
- [For Wallets Already Supporting BTC Staking][staking]
- [Bitcoin Wallet Interface](#bitcoin-wallet-interface)
  - [SignPsbtOptions](#signpsbtoptions)
  - [deriveContextHash](#derivecontexthash)
- [Ethereum Wallet Interface](#ethereum-wallet-interface)
- [Vault Deposit Flow](#vault-deposit-flow)
- [Source Code References](#source-code-references)

[staking]: #for-wallets-already-supporting-btc-staking

## Overview

Babylon's Trustless Bitcoin Vaults (TBV) let users lock
BTC on Bitcoin and receive vaultBTC on Ethereum for use
as DeFi collateral. Wallet partners must support **two
chains**: a Bitcoin wallet for PSBT signing and message
signing, and an Ethereum wallet via WalletConnect.

## For Wallets Already Supporting BTC Staking

If your wallet already implements `IBTCProvider` for
Babylon BTC staking, here's what's new for TBV:

- **`signPsbts()` is now critical** — TBV signs multiple
  PSBTs per deposit + payout pre-signing. Without batch
  signing, each PSBT requires a separate user approval.
- **`SignPsbtOptions` expanded** — New field `signInputs`
  with `disableTweakSigner` (required for Taproot script
  path spends).
- **`deriveContextHash()` required** — TBV derives
  hashlock secrets from wallet key material. See
  [deriveContextHash](#derivecontexthash).
- **Ethereum wallet required** — Staking was BTC-only.
  TBV requires an ETH wallet for on-chain registration
  and DeFi. Uses viem `WalletClient` — any
  EIP-1193/wagmi/WalletConnect wallet works.
- **No more BBN/Cosmos** — Staking used `IBBNProvider`.
  TBV replaces this with Ethereum.

| Aspect | TBV Vault | BTC Staking |
|--------|-----------|-------------|
| BTC wallet | `IBTCProvider` | Same |
| ETH wallet | **Required** — viem `WalletClient` | N/A |
| Batch signing | Critical — multiple PSBTs | Delegation |
| Message signing | `"bip322-simple"` for PoP | Same |
| Taproot path | `disableTweakSigner: true` | Same |
| Hashlock | `deriveContextHash` — new | N/A |
| Chains | **Dual**: BTC + ETH | BTC + Cosmos |

## Bitcoin Wallet Interface

TBV uses the `IBTCProvider` interface from
`@babylonlabs-io/wallet-connector`. Full type definitions
are in [`src/core/types.ts`](../src/core/types.ts).

| Method | Signature | Purpose |
|--------|-----------|---------|
| `connectWallet` | `() => Promise<void>` | Connect to the wallet |
| `getAddress` | `() => Promise<string>` | Get BTC address |
| `getPublicKeyHex` | `() => Promise<string>` | Get public key hex. Taproot: x-only (32 bytes, 64 hex, no `0x`). Compressed (33 bytes) also accepted — SDK strips first byte. |
| `signPsbt` | `(psbtHex: string, options?: SignPsbtOptions) => Promise<string>` | Sign a single PSBT. Must support `disableTweakSigner`. See [SignPsbtOptions](#signpsbtoptions). |
| `signPsbts` | `(psbtsHexes: string[], options?: SignPsbtOptions[]) => Promise<string[]>` | Batch sign PSBTs in one prompt. Falls back to sequential `signPsbt()` if unavailable. |
| `signMessage` | `(message: string, type: "bip322-simple" \| "ecdsa") => Promise<string>` | Sign a message. TBV uses `"bip322-simple"` for PoP. |
| `deriveContextHash` | `(appName: string, context: string) => Promise<string>` | Derive 32-byte value via HKDF-SHA-256. See [deriveContextHash](#derivecontexthash) and [spec][spec]. |
| `getNetwork` | `() => Promise<Network>` | Get BTC network |
| `on` | `(eventName: string, cb: () => void) => void` | Register event listener |
| `off` | `(eventName: string, cb: () => void) => void` | Unregister event listener |
| `getInscriptions` | `() => Promise<InscriptionIdentifier[]>` | Optional. UTXO filtering. |

[spec]: ../../../docs/specs/derive-context-hash.md

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

**`disableTweakSigner`**: TBV vault transactions use
Taproot **script path** spends. When
`disableTweakSigner: true`, the wallet must sign with the
**untweaked** private key (raw internal key). Signing with
the tweaked key produces an invalid signature.

### deriveContextHash

TBV uses `deriveContextHash("babylon-vault", context)` to
derive hashlock secrets for HTLC deposits. The derived
value is committed as a SHA-256 hashlock during vault
creation and later revealed during activation.

```ts
deriveContextHash(
  appName: string,
  context: string
): Promise<string>
```

- **`appName`** — `"babylon-vault"`. Must be
  `[a-z0-9\-]`, 1–64 bytes. The wallet MUST display
  this in the approval dialog alongside the requesting
  origin.
- **`context`** — Hex-encoded application-specific data
  (e.g., transaction ID + output index + public key).
  Must be non-empty, lowercase hex, even-length, no
  `0x` prefix, max 1024 bytes. Different contexts
  produce independent outputs.
- **Returns** — 64-character lowercase hex string
  (32 bytes).

The wallet MUST reject invalid `appName` or `context`
inputs and MUST require user approval before returning
the derived value.

The wallet must implement HKDF-SHA-256 derivation per
the [full specification][spec], which includes the
derivation algorithm, BIP-32 key path, input validation
rules, and test vectors for conformance testing.

## Ethereum Wallet Interface

The ETH wallet must be compatible with WalletConnect.
Connection is handled via AppKit / WalletConnect.

The full `IETHProvider` interface is documented in the
[main README](../README.md#iethprovider).

## Vault Deposit Flow

From the wallet's perspective, a deposit triggers these
signing prompts in order:

### Step 1: Derive Hashlock Secret

**Method**: `deriveContextHash("babylon-vault", context)`

The SDK derives a deterministic secret for each vault's
hashlock. The secret is hashed (SHA-256) to produce the
hashlock committed in the Bitcoin HTLC script and later
revealed on Ethereum during activation.

### Step 2: Sign Proof-of-Possession

**Method**: `signMessage(message, "bip322-simple")`

A BIP-322 message proving the depositor owns the Bitcoin
address. Signed once per deposit session — for
multi-vault deposits, the first signature is reused for
subsequent vaults.

### Step 3: Batch Sign PegIn Input PSBTs

**Method**: `signPsbts(psbtsHexes, options)`

The SDK constructs one PegIn input PSBT per vault in the
deposit. All PSBTs are presented for batch signing. These
are Taproot script path spends — `signInputs` will
include `disableTweakSigner: true`. Falls back to
sequential `signPsbt()` if the wallet does not support
batch signing.

### Step 4: Register Vaults on Ethereum

**Method**: ETH `sendTransaction()`

A single Ethereum transaction batch-registers all vaults
in the deposit on the TBV smart contract with the signed
PegIn data and PoP signature.

### Step 5: Sign Pre-PegIn Funding Transaction

**Method**: `signPsbt(psbtHex)`

After Ethereum registration succeeds, the Bitcoin funding
transaction (Pre-PegIn) is signed and broadcast. This is
a single PSBT containing all vault HTLC outputs.

### Step 6: Sign Payout Transactions

**Method**: `signPsbts(psbtsHexes, options)`

After Bitcoin confirmation, the wallet pre-signs payout
transactions per vault:

1. **Claimer payout signing** — payout, no-payout,
   challenge-assert PSBTs per challenger
2. **Depositor-as-claimer presigning** — depositor graph
   PSBTs

These signatures are stored by the vault provider and
used if a payout event occurs later. Falls back to
sequential `signPsbt()` if batch signing is unavailable.

### Step 7: Activate Vault on Ethereum

**Method**: ETH `sendTransaction()`

After vault verification completes (~12 min), the wallet
sends an `activateVaultWithSecret` transaction per vault
to finalize activation. The hashlock secret derived in
Step 1 is revealed on-chain.

## Source Code References

| Component | Path |
|-----------|------|
| `IBTCProvider` | [`src/core/types.ts`][types] |
| `IETHProvider` | [`src/core/types.ts`][types] |
| `deriveContextHash` spec | [spec][spec] |
| Unisat (reference) | [`unisat/provider.ts`][unisat] |
| OKX (reference) | [`okx/provider.ts`][okx] |

[types]: ../src/core/types.ts
[unisat]: ../src/core/wallets/btc/unisat/provider.ts
[okx]: ../src/core/wallets/btc/okx/provider.ts
