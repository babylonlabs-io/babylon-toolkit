# BTC Wallet Integration Guide for Babylon Vault

- [Overview](#overview)
- [Capability Matrix](#capability-matrix)
- [For Wallets Already Supporting BTC Staking][staking]
- [Vault Deposit Flow](#vault-deposit-flow)
- [Bitcoin Wallet Interface](#bitcoin-wallet-interface)
- [Common Incompatibilities](#common-incompatibilities)
- [Hardware Wallets](#hardware-wallets)
- [Ethereum Wallet](#ethereum-wallet)

[staking]: #for-wallets-already-supporting-btc-staking
[spec]: ../../../docs/specs/derive-context-hash.md

## Overview

Babylon's Trustless Bitcoin Vaults (TBV) let users lock
BTC on Bitcoin and receive vaultBTC on Ethereum for use
as DeFi collateral. The user locks BTC into a Taproot
script-path output, registers the vault on Ethereum, and
later activates the vault by revealing a hashlock secret
to mint the matching vaultBTC.

This guide is for **BTC wallet vendors** integrating with
TBV. The Ethereum side is hands-off — see
[Ethereum Wallet](#ethereum-wallet).

Status: pre-mainnet. Some details (notably
`deriveContextHash`) may evolve before launch.

## Capability Matrix

**MUST** = deposits fail without it. **STRONGLY
RECOMMENDED** = deposits work, UX degrades. **OPTIONAL** =
nice-to-have.

| Capability | Requirement | Why / where enforced |
|---|---|---|
| BIP-340 Schnorr + BIP-341 Taproot script-path spends with untweaked key | MUST | Vault HTLC scripts use Taproot script-path; SDK passes `useTweakedSigner: false` ([`signing.ts`][signing]) |
| 64-byte Schnorr signatures (implicit `SIGHASH_DEFAULT`) | MUST | SDK rejects 65-byte sigs; the appended sighash byte changes the signed message and cannot be stripped ([`peginInput.ts`][peginInput], [`payout.ts`][payout]) |
| Non-finalized PSBT return for PegIn input PSBTs | MUST | SDK extracts the depositor signature from `tapScriptSig`; finalized PegIn PSBTs throw outright ([`peginInput.ts`][peginInput]) |
| BIP-322 simple message signing | MUST | Used for proof-of-possession ([`PeginManager.ts`][peginManager]) |
| `deriveContextHash` (HKDF-SHA-256, BIP-32 hardened path `m/73681862'`) | MUST | Hashlock secret derivation — see [spec][spec] for derivation algorithm and test vectors |
| `signPsbts` (batch signing) | STRONGLY RECOMMENDED | Without it, depositors approve N PSBTs one-by-one |
| `getInscriptions` | OPTIONAL | UTXO filtering only |

[signing]: ../../babylon-ts-sdk/src/tbv/core/utils/signing.ts
[peginInput]: ../../babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts
[payout]: ../../babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts

## For Wallets Already Supporting BTC Staking

*Skip this section if your wallet has not previously
integrated Babylon BTC staking.*

If your wallet already implements `IBTCProvider` for
Babylon BTC staking, here's what's new for TBV:

| Aspect | TBV Vault | BTC Staking |
|---|---|---|
| BTC wallet | `IBTCProvider` | Same |
| ETH wallet | **Required** — via WalletConnect (no work for the BTC wallet team) | N/A |
| Batch signing | Critical — multiple PSBTs per deposit + payout pre-signing | Delegation only |
| Message signing | `"bip322-simple"` for PoP | Same |
| Taproot path | `useTweakedSigner: false` (untweaked key) | Same |
| Schnorr signature size | **Strictly 64 bytes — no sighash byte** | Either accepted |
| Hashlock derivation | `deriveContextHash` — new requirement | N/A |
| Chains | **Dual**: BTC + ETH | BTC + Cosmos |

## Vault Deposit Flow

From the BTC wallet's perspective, a deposit triggers
these signing prompts in order. Steps interleaved between
these are Ethereum transactions handled by the user's ETH
wallet — not this wallet's concern.

1. **Derive vault root** — `deriveContextHash("babylon-vault", context)`, once per deposit batch (regardless of vault count). The SDK expands per-vault secrets locally from this root.
2. **Sign Proof-of-Possession** — `signMessage(message, "bip322-simple")`, once per deposit session.
3. **Batch-sign PegIn input PSBTs** — `signPsbts(psbtsHexes, options)` (Taproot script-path, untweaked, non-finalized). Falls back to sequential `signPsbt()` if batch unavailable.
4. **Sign Pre-PegIn funding transaction** — `signPsbt(psbtHex)` after Ethereum registration succeeds. Standard funding-input signing across whatever UTXO types the wallet contributes.
5. **Sign payout transactions** — `signPsbts(psbtsHexes, options)`. Multiple PSBTs per vault: claimer payout, no-payout, challenge-assert, and depositor-graph.

## Bitcoin Wallet Interface

TBV uses the `IBTCProvider` interface from
`@babylonlabs-io/wallet-connector`. Full type definitions
are in [`src/core/types.ts`](../src/core/types.ts).

| Method | Signature | Purpose |
|---|---|---|
| `connectWallet` | `() => Promise<void>` | Connect to the wallet |
| `getAddress` | `() => Promise<string>` | Get BTC address. The depositor identity for vault deposits is a Taproot account (P2TR `bc1p…` / `tb1p…`). |
| `getPublicKeyHex` | `() => Promise<string>` | Get public key hex. Taproot: x-only (32 bytes, 64 hex, no `0x`). Compressed (33 bytes) also accepted — SDK strips first byte. |
| `signPsbt` | `(psbtHex: string, options?: SignPsbtOptions) => Promise<string>` | Sign a single PSBT. See [SignPsbtOptions](#signpsbtoptions). |
| `signPsbts` | `(psbtsHexes: string[], options?: SignPsbtOptions[]) => Promise<string[]>` | Batch sign PSBTs in one prompt. Falls back to sequential `signPsbt()` if unavailable. |
| `signMessage` | `(message: string, type: "bip322-simple" \| "ecdsa") => Promise<string>` | Sign a message. TBV uses `"bip322-simple"` for PoP. See [PoP message format](#pop-message-format). |
| `deriveContextHash` | `(appName: string, context: string) => Promise<string>` | Derive 32-byte value via HKDF-SHA-256. See [deriveContextHash](#derivecontexthash) and [spec][spec]. |
| `getNetwork` | `() => Promise<Network>` | Get BTC network. Wallet must operate on the network the dApp is configured for (signet vs mainnet); mismatch must error. |
| `on` / `off` | `(eventName: string, cb: () => void) => void` | Register/unregister event listener |
| `getInscriptions` | `() => Promise<InscriptionIdentifier[]>` | Optional. UTXO filtering. |

Reference implementations:
[Unisat](../src/core/wallets/btc/unisat/provider.ts),
[OKX](../src/core/wallets/btc/okx/provider.ts).

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
  useTweakedSigner?: boolean;
}
```

For vault Taproot script-path PSBTs, the SDK always
passes `autoFinalized: false` and `useTweakedSigner:
false` ([`signing.ts`][signing]). Wallets MUST honor
both: return a non-finalized PSBT with `tapScriptSig`
entries, signed with the **untweaked internal key**.
Auto-finalizing PegIn input PSBTs causes the SDK to
throw — the depositor signature cannot be reliably
extracted from the witness stack.

### deriveContextHash

```ts
deriveContextHash(
  appName: string,
  context: string
): Promise<string>
```

TBV uses `deriveContextHash("babylon-vault", context)` to
derive hashlock secrets for HTLC deposits. The derived
value is committed as a SHA-256 hashlock during vault
creation and revealed during activation.

Implementation requirements (see [spec][spec] for full
detail and test vectors):

- BIP-32 hardened derivation path `m/73681862'`.
- HKDF-SHA-256 with the spec's fixed salt and `info` constructed from `appName` + `context`.
- 32-byte output (64 lowercase hex chars).
- `appName` must match `[a-z0-9\-]`, 1–64 bytes.
- `context` must be lowercase hex, even-length, non-empty, no `0x` prefix, max 1024 bytes.
- Wallet MUST require user approval and display `appName` ("babylon-vault") and the requesting origin.

### PoP Message Format

The exact string signed in step 2 of the deposit flow:

```
${depositorEthAddress.toLowerCase()}:${ethChainId}:pegin:${btcVaultRegistryAddress.toLowerCase()}
```

Concrete example (sepolia, chain ID `11155111`):

```
0xabcdef0123456789abcdef0123456789abcdef01:11155111:pegin:0x123456789abcdef0123456789abcdef012345678
```

Source: [`PeginManager.ts`][peginManager]. Wallet UI
should render this as readable text (lowercase Ethereum
address, decimal chain ID, the literal token `pegin`,
lowercase contract address) rather than raw bytes.

[peginManager]: ../../babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts

## Common Incompatibilities

These are the patterns most likely to break a new
integration. Each fails-closed in the SDK rather than
silently producing wrong output.

- **Auto-finalizing PegIn input PSBTs.** Must return non-finalized with `tapScriptSig`. Finalized PSBTs throw at extraction.
- **65-byte Schnorr signatures** (with `SIGHASH_ALL` `0x01` appended). Must be exactly 64 bytes (implicit `SIGHASH_DEFAULT`). Rejected by the SDK rather than stripped.
- **Tweaked-only Taproot signing.** Vault PSBTs are Taproot script-path spends and need the untweaked internal key. Honor `useTweakedSigner: false`.
- **No `deriveContextHash` support.** Hashlock derivation is mandatory; the deposit cannot proceed without it.
- **Mutating Pre-PegIn outputs.** The Pre-PegIn includes a 32-byte OP_RETURN at `vout = vaultCount` (exact 34-byte script). Wallets MUST NOT reorder outputs, strip/modify the OP_RETURN, change the fee, or add anti-fee-sniping `nLocktime` tweaks.
- **Network mismatch.** Wallet must operate on the network the dApp is configured for (signet for testnet, mainnet for prod). Silent address-type swaps must error.
- **No batch `signPsbts`.** Not a hard incompatibility, but UX degrades to N popups per deposit + payout-presigning round.
- **Address-type drift on reconnect.** Returning P2WPKH after a Taproot address was used earlier in the session breaks the deposit. The wallet must keep the depositor identity stable for the session.
- **PSBT version mismatch.** The SDK passes BIP-174 PSBTv0; wallets that only accept v2 will fail.

Conformance test vectors for `deriveContextHash` and the
exact wire format are in the [spec][spec] (§4 — Test
Vectors).

## Hardware Wallets

Hardware wallet support is preliminary. Stock Bitcoin apps
on Ledger and Trezor do not expose `deriveContextHash`
(custom HKDF beyond BIP-32), have limited BIP-322
support, and have small-screen constraints that make
batch payout signing impractical. Vendors with HW
interest should plan for either a dedicated Babylon Vault
app or a custom HKDF derivation extension to the stock
Bitcoin app, plus full conformance against the spec test
vectors and a mainnet/signet deposit-flow run before
advertising support.

## Ethereum Wallet

Babylon handles the Ethereum side via AppKit /
WalletConnect. BTC wallet vendors do not need a custom
ETH adapter — any wallet listed in WalletConnect with
standard EIP-1193 transaction signing works out of the
box.
