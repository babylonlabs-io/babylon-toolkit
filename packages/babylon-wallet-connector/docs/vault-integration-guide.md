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
[vectors]: ../../babylon-ts-sdk/src/tbv/core/vault-secrets/__tests__/deriveContextHash.vectors.test.ts
[spec]: ../../../docs/specs/derive-context-hash.md
[secrets-spec]: ../../../docs/specs/derive-vault-secrets.md

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

`deriveContextHash` and the vault context it is called
with are frozen: [the conformance vectors][vectors] pin
the exact bytes, and any change is a hard fork that
invalidates every existing deposit ([spec][spec]).

## Capability Matrix

**MUST** = deposits fail without it. **STRONGLY
RECOMMENDED** = deposits work, UX degrades. **OPTIONAL** =
nice-to-have.

| Capability | Requirement | Why / where enforced |
|---|---|---|
| BIP-340 Schnorr + BIP-341 Taproot script-path spends with untweaked key | MUST | Vault HTLC scripts use Taproot script-path; SDK passes `useTweakedSigner: false` ([`signing.ts`][signing]) |
| 64-byte Schnorr signatures on script-path PSBT inputs (implicit `SIGHASH_DEFAULT`) | MUST | SDK rejects 65-byte sigs on PegIn, Payout and NoPayout inputs; the appended sighash byte changes the signed message and cannot be stripped ([`peginInput.ts`][peginInput], [`payout.ts`][payout]). A 65-byte `SIGHASH_ALL` signature is accepted only on the Pre-PegIn's key-path funding inputs and in the BIP-322 proof of possession — see [PoP message format](#pop-message-format) |
| Non-finalized PSBT return for PegIn input PSBTs | MUST | SDK takes only the depositor's `tapScriptSig` entry and finalizes the PSBT it built itself; a finalized PegIn PSBT throws ([`peginInput.ts`][peginInput]) |
| BIP-322 simple message signing | MUST | Proof of possession ([`PeginManager.ts`][peginManager]); the return value is the consensus-encoded witness, see [PoP message format](#pop-message-format) |
| `deriveContextHash` (HKDF-SHA-256 over the BIP-32 hardened key at `m/73681862'`; MPC wallets see [deriveContextHash](#derivecontexthash)) | MUST | Vault secret derivation (hashlock secrets, WOTS seeds, auth anchor) — see [deriveContextHash](#derivecontexthash) for the algorithm and [the conformance vectors][vectors] |
| `signPsbts` with one approval for the whole batch | STRONGLY RECOMMENDED | `signPsbts` is a required member of `IBTCProvider`; a wallet without native batch signing implements it as a loop over `signPsbt`, and the SDK also tolerates a missing method ([`signPsbtsWithFallback.ts`][fallback]). Without one-approval batching, depositors approve N PSBTs one by one |
| `getInscriptions` | OPTIONAL | Required member of `IBTCProvider`, used only to exclude inscription-bearing UTXOs from funding. A wallet with no inscription index must reject: the dApp reads an empty list as "no inscriptions" and skips its own check |

[signing]: ../../babylon-ts-sdk/src/tbv/core/utils/signing.ts
[peginInput]: ../../babylon-ts-sdk/src/tbv/core/primitives/psbt/peginInput.ts
[payout]: ../../babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts
[fallback]: ../../babylon-ts-sdk/src/tbv/core/managers/pegin/signPsbtsWithFallback.ts

## For Wallets Already Supporting BTC Staking

*Skip this section if your wallet has not previously
integrated Babylon BTC staking.*

If your wallet already implements `IBTCProvider` for
Babylon BTC staking, here's what's new for TBV:

| Aspect | TBV Vault | BTC Staking |
|---|---|---|
| BTC wallet | `IBTCProvider` | Same |
| ETH wallet | **Required** — via Reown AppKit (no work for the BTC wallet team) | N/A |
| Batch signing | Critical — one PegIn PSBT per vault, then two payout batches per vault | Delegation only |
| Message signing | `"bip322-simple"` for PoP | Same |
| Taproot path | `useTweakedSigner: false` (untweaked key) | Same |
| Schnorr signature size | **Strictly 64 bytes on script-path PSBT inputs — no sighash byte** | 64 bytes (the staking signature extractor skips other lengths) |
| Vault secret derivation | `deriveContextHash` — new requirement | N/A |
| Chains | **Dual**: BTC + ETH | BTC + Cosmos |

## Vault Deposit Flow

One deposit is one Pre-PegIn transaction funding one or
more vaults. From the BTC wallet's perspective it produces
these prompts, in this order. Steps between them are
Ethereum transactions handled by the user's ETH wallet, or
vault-provider calls that need no wallet — not this
wallet's concern.

```
BTC wallet prompt              SDK / dApp                                 ETH wallet
─────────────────              ──────────                                 ──────────
getPublicKeyHex, getAddress    select UTXOs, build the Pre-PegIn
deriveContextHash          ──► root → per-vault secrets + VP auth anchor
signPsbts (PegIn inputs)   ──► verify each signature, finalize locally
signMessage (PoP)          ──► verify the witness
                               register the vaults                   ──► sign tx
signPsbt (Pre-PegIn)       ──► verify signatures, broadcast
                               … Bitcoin confirmation …
                               authenticate to the vault provider *
signPsbts (claimer Payouts)──► verify
signPsbts (depositor graph)──► verify, submit to the vault provider
deriveContextHash          ──► HTLC secret → activate the vault       ──► sign tx
```

\* The vault-provider token is expanded from the root the
dApp already holds, so this step itself opens no prompt in
the same session. The dApp calls `deriveContextHash` again,
with the same inputs, whenever it needs the root and holds
no copy: see step 1.

1. **Derive vault root** — `deriveContextHash("babylon-btc-vault", context)`, once per Pre-PegIn during preparation, after UTXO selection (the context commits to the funding outpoints). The SDK expands every vault's secrets and the vault-provider auth anchor from this root locally and does not persist the root. The same call, with identical inputs, is repeated whenever the dApp needs the root again: at activation, to derive the HTLC secret; on resume after a reload or on another device, to re-derive the WOTS keys and the vault-provider token (the token is released when the resume view closes); on a stuck-state withdraw or an expired-vault redeem, which reveal the HTLC secret on Ethereum; and, for the Ledger vault app, before the Pre-PegIn signature (see [Hardware Wallets](#hardware-wallets)). The output must be identical each time.
2. **Batch-sign PegIn input PSBTs** — one PSBT per vault, `signPsbts(psbtsHexes, options)` (Taproot script-path, untweaked, non-finalized). A single-vault deposit calls `signPsbt` instead, and a wallet without `signPsbts` is called sequentially ([`signPsbtsWithFallback.ts`][fallback]).
3. **Sign Proof-of-Possession** — `signMessage(message, "bip322-simple")`, once per deposit; the SDK reuses it for every vault registered in that deposit.
4. **Sign the Pre-PegIn funding transaction** — `signPsbt(psbtHex)` after Ethereum registration succeeds, with no options. Key-path signing of the funding inputs. The SDK accepts P2TR key-path and P2WPKH inputs only and verifies every returned signature ([`verifyKeyPathSchnorrSignature.ts`][keyPath]), and it rejects a PSBT whose unsigned transaction differs from the one it sent ([`assertPsbtUnsignedTxMatches.ts`][unsignedMatch]).
5. **Sign payout transactions** — after the Pre-PegIn confirms, two batch prompts per vault: first one Payout per non-depositor claimer (the vault provider and each vault keeper) ([`PayoutManager.ts`][payoutManager]), then the depositor's own Payout plus one NoPayout per challenger ([`signDepositorGraph.ts`][depositorGraph]). All are requested as Taproot script-path, untweaked, non-finalized; the SDK also accepts a Payout or NoPayout returned finalized with the exact three-item witness (signature, script, control block). The depositor signs no ChallengeAssert: its NoPayout signatures bind those parents.

After the deposit, the BTC wallet is prompted again for
`deriveContextHash` at activation (the HTLC secret), on
resume, on a stuck-state withdraw and on an expired-vault
redeem, as step 1 says. A refund derives nothing: it signs
one Taproot script-path PSBT with the same options as the
deposit PSBTs ([`buildAndBroadcastRefund.ts`][refund]). The
recovery-artifact download needs only the vault-provider
token.

[keyPath]: ../../babylon-ts-sdk/src/tbv/core/primitives/psbt/verifyKeyPathSchnorrSignature.ts
[unsignedMatch]: ../../babylon-ts-sdk/src/tbv/core/primitives/psbt/assertPsbtUnsignedTxMatches.ts
[refund]: ../../babylon-ts-sdk/src/tbv/core/services/refund/buildAndBroadcastRefund.ts
[payoutManager]: ../../babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts
[depositorGraph]: ../../babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts

## Bitcoin Wallet Interface

TBV uses the `IBTCProvider` interface from
`@babylonlabs-io/wallet-connector`. Full type definitions
are in [`src/core/types.ts`][types].

| Method | Signature | Purpose |
|---|---|---|
| `connectWallet` | `(onProgress?: ProgressReporter) => Promise<void>` | Connect to the wallet. The optional reporter is for providers whose connect has several steps. |
| `getAddress` | `() => Promise<string>` | Get the BTC address. It must belong to the key `getPublicKeyHex` returns: a P2TR address (`bc1p…` / `tb1p…`), or a P2WPKH address when the wallet exposes the 33-byte compressed key. An x-only key cannot be matched to a P2WPKH address, so a Taproot-only wallet must return P2TR. The SDK checks the address against the key and registers it as the payout sink. |
| `getPublicKeyHex` | `() => Promise<string>` | Get public key hex, no `0x`: x-only (32 bytes, 64 hex) or compressed (33 bytes, 66 hex). The SDK uses the x-only form for the protocol and passes the key back exactly as returned in `signInputs[].publicKey`. |
| `signPsbt` | `(psbtHex: string, options?: SignPsbtOptions) => Promise<string>` | Sign a single PSBT. See [SignPsbtOptions](#signpsbtoptions). |
| `signPsbts` | `(psbtsHexes: string[], options?: SignPsbtOptions[]) => Promise<string[]>` | Sign several PSBTs in one call, ideally under one approval. A wallet without native batch signing implements it as a loop over `signPsbt`. A provider that runs one device ceremony per PSBT ticks `subscribeSigningProgress` after each committed ceremony. |
| `signMessage` | `(message: string, type: "bip322-simple" \| "ecdsa") => Promise<string>` | Sign a message. TBV uses `"bip322-simple"` for PoP and expects the consensus-encoded witness back. See [PoP message format](#pop-message-format). |
| `deriveContextHash` | `(appName: string, context: string) => Promise<string>` | Derive 32-byte value via HKDF-SHA-256. See [deriveContextHash](#derivecontexthash) and [the conformance vectors][vectors]. |
| `getNetwork` | `() => Promise<Network>` | Get BTC network. Wallet must operate on the network the dApp is configured for (signet vs mainnet); mismatch must error. |
| `on` / `off` | `(eventName: string, cb: () => void) => void` | Register/unregister event listener |
| `getWalletProviderName` | `() => Promise<string>` | Display name of the wallet. Required by the interface. |
| `getWalletProviderIcon` | `() => Promise<string>` | Icon URL or data URI of the wallet. Required by the interface. |
| `getInscriptions` | `() => Promise<InscriptionIdentifier[]>` | Used only to exclude inscription-bearing UTXOs from funding. A wallet with no inscription index must reject: the dApp reads an empty list as "no inscriptions" and skips its own check. |
| `cancelSigning` | `() => void` | Optional. Requests cancellation of the in-flight ceremony, or of an operation held waiting for the device app; a ceremony settles at the next device exchange, a wait at once. Feature-detect. |
| `subscribeSigningProgress` | `(listener: (p: SigningProgress) => void) => () => void` | Optional. Per-PSBT ticks inside `signPsbts` for providers that run one device ceremony per PSBT. Fires after each committed ceremony; a failed ceremony emits no tick and earlier ticks stand. Feature-detect; returns the unsubscribe. Outlives the batch; dropped on session teardown. Listener is sync; an overlapping `signPsbts` is rejected, never queued; never fires for `signPsbt`. |
| `subscribeDeviceAppState` | `(listener: (s: DeviceAppState) => void) => () => void` | Optional. For hardware providers that can read the open device app: `awaiting-app` (with the expected app name) while an operation is held until the user opens that app, `ready` when the wait ends. The operation continues by itself shortly after the app opens. Survives teardown and reconnect. Feature-detect; returns the unsubscribe. |

Reference implementations:
[UniSat](../src/core/wallets/btc/unisat/provider.ts),
[OKX](../src/core/wallets/btc/okx/provider.ts) and
[OneKey](../src/core/wallets/btc/onekey/provider.ts)
(browser extensions),
[Keystone](../src/core/wallets/btc/keystone/provider.ts)
(air-gapped QR) and
[Ledger Babylon Vault](../src/core/wallets/btc/ledger-vault/provider.ts)
(Ledger device, see [Hardware Wallets](#hardware-wallets)).

[types]: ../src/core/types.ts

### SignPsbtOptions

The fields the deposit flow sets:

```ts
interface SignPsbtOptions {
  autoFinalized?: boolean;
  signInputs?: SignInputOptions[];
}

interface SignInputOptions {
  index: number;
  publicKey?: string;
  useTweakedSigner?: boolean;
}
```

The full types in [`types.ts`][types] also carry `address`,
`sighashTypes` and the deprecated `disableTweakSigner` on
`SignInputOptions`, and `displayMessage` (a per-PSBT label
that QR wallets show above the code), `contracts` and
`action` on `SignPsbtOptions`. The deposit flow
sets none of them, and the Pre-PegIn funding PSBT is sent
with no options at all.

For vault Taproot script-path PSBTs, the SDK always
passes `autoFinalized: false` and `useTweakedSigner:
false` ([`signing.ts`][signing]). Wallets MUST honor
`useTweakedSigner: false` on every vault PSBT and
`autoFinalized: false` on the PegIn input PSBTs: return
those non-finalized with `tapScriptSig` entries, signed with
the **untweaked internal key**. A Payout or NoPayout may
also come back finalized with the exact three-item witness.
Auto-finalizing PegIn input PSBTs causes the SDK to
throw — the depositor signature cannot be reliably
extracted from the witness stack. Only that 64-byte
signature is used: the SDK builds the PegIn witness
from the PSBT it sent, so the returned PSBT's other
per-input fields (a key-path signature, a final
witness or scriptSig, leaf metadata) are ignored. Its
unsigned transaction must still match the one the SDK
sent, or the SDK rejects the answer.

### deriveContextHash

```ts
deriveContextHash(
  appName: string,
  context: string
): Promise<string>
```

TBV uses `deriveContextHash("babylon-btc-vault", context)` to
get one 32-byte root per deposit batch (one Pre-PegIn). The SDK expands the root
into each vault's hashlock secret, WOTS seed and the shared
auth anchor ([spec][secrets-spec]). The SHA-256 of each
hashlock secret is committed in its HTLC during vault
creation, and the secret is revealed during activation.
The dApp calls it at deposit preparation and again, with
identical inputs, whenever it needs the auth anchor and
holds no cached vault-provider token (resume, reload,
another device). Same inputs MUST give the same output.

Implementation requirements (the [spec][spec] has the full
algorithm and rationale; the [conformance vectors][vectors]
pin the exact bytes):

- BIP-32 hardened derivation path `m/73681862'`.
- `ikm` is the raw 32-byte big-endian private-key scalar at that path (no
  chain code, no serialization prefix), the same for every account and
  network. An invalid BIP-32 child at that index is an error; do not skip
  to the next index. Never use the path for signing or any other
  derivation.
- HKDF-SHA-256 with `salt` = UTF-8 `"derive-context-hash"`, `info` =
  `SHA-256(UTF8(appName)) || SHA-256(UTF8(canonicalNetworkName)) ||
  connectedPubkey (33-byte compressed SEC1) || context bytes`, output
  length 32.
- `canonicalNetworkName` is one of `bitcoin-mainnet`, `bitcoin-testnet`
  (testnet3 and testnet4), `bitcoin-signet`, `bitcoin-regtest`. Any other
  network must fail with a distinct "unsupported network" error, not
  "method not supported".
- `connectedPubkey` is the 33-byte compressed SEC1 form of the key the
  wallet returned to the dApp as the active connected key for this request.
  A wallet with several accounts binds the key of the account selected when
  `deriveContextHash` is called. The prefix is the untweaked key's real
  y-parity (`0x02` or `0x03`), also when the wallet hands the dApp an
  x-only key for Taproot: never an even-y lift of the x-only key, and never
  the BIP-341 tweaked output key.
  The `m/44'/0'/0'/0/0` leaf in the conformance vector is a fixture only.
- Imported (non-HD) keys use the raw 32-byte private key as `ikm`. MPC and
  other non-HD wallets may use their own deterministic derivation: 32-byte
  output, dependent on the key material and on all four of `appName`,
  `canonicalNetworkName`, `connectedPubkey` and `context`, stable across
  share refreshes that keep the same public key. Neither is portable to an
  HD wallet restored from the same phrase; document this to users and
  application developers.
- 32-byte output (64 lowercase hex chars).
- `appName` must match `[a-z0-9\-]`, 1–64 bytes.
- `context` must be lowercase hex, even-length, non-empty, no `0x` prefix, max 1024 bytes.
- Wallet MUST require user approval and display `appName` ("babylon-btc-vault"). It MUST also display the requesting origin when the transport carries one (browser extensions, injected providers). Hardware wallets reached over raw APDU, USB, BLE or QR have no authenticated origin and MUST NOT present a dApp-supplied string as a verified one.

The connector's `deriveContextHash` error codes include:

- `WALLET_METHOD_NOT_SUPPORTED`: The wallet does not implement the method. OneKey also reports an account that cannot derive the context hash with this code.
- `WALLET_ACCOUNT_NOT_SUPPORTED`: The selected account cannot derive the context hash. Only the UniSat provider reports this code.
- `WALLET_ACCOUNT_CHANGED`: The UniSat, OKX, OneKey and Utila adapters refuse the result when an account, network or disconnect event fired during the call, or when the account the extension reports afterwards is not the one it reported before ([`assertDeriveAccountUnchanged.ts`][accountChanged]). Keep the selected account stable while the approval is open.
- `CONNECTION_REJECTED`: The user declined the approval. The extension adapters map a decline to this code only when the wallet's error message contains "user rejected", "user denied", "user cancelled" or "user canceled"; any other wording is rethrown unwrapped and shows as a generic failure.

[accountChanged]: ../src/core/wallets/btc/assertDeriveAccountUnchanged.ts

### PoP Message Format

The exact string signed in step 3 of the deposit flow:

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

`signMessage(message, "bip322-simple")` MUST return the
consensus-encoded BIP-322 witness stack, as `0x`-prefixed
hex, bare hex, or padded standard base64; URL-safe or
unpadded base64 is rejected. Decoded, the stack is one of
([`verifyPopWitness.ts`][verifyPop]):

- one item, for a P2TR account: a Schnorr signature over the BIP-86 tweaked key, 64 bytes (`SIGHASH_DEFAULT`) or 65 bytes ending in `0x01` (`SIGHASH_ALL`);
- two items, for a P2WPKH account: the DER-encoded ECDSA signature with its hash-type byte, 71 or 72 bytes in total, strictly minimal DER with low S and ending in `0x01` (`SIGHASH_ALL` only), then the 33-byte compressed public key, whose x-coordinate must equal the connected key's. A signature of another length or hash type is rejected before verification, and an RFC-6979 wallet re-signs identically on retry.

The SDK verifies the witness against the depositor key
before registration. The vault provider verifies it again
and treats a bad PoP as a permanent rejection of the
deposit.

[peginManager]: ../../babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts
[verifyPop]: ../../babylon-ts-sdk/src/tbv/core/managers/pegin/verifyPopWitness.ts

## Common Incompatibilities

These are the patterns most likely to break a new
integration. Each fails-closed in the SDK rather than
silently producing wrong output.

- **Auto-finalizing PegIn input PSBTs.** Must return non-finalized with `tapScriptSig`. Finalized PSBTs throw at extraction.
- **65-byte Schnorr signatures on PSBT inputs** (with `SIGHASH_ALL` `0x01` appended). Must be exactly 64 bytes (implicit `SIGHASH_DEFAULT`) on PegIn, Payout and NoPayout inputs. Rejected by the SDK rather than stripped. Only the Pre-PegIn's key-path funding inputs and the BIP-322 PoP accept 64 bytes or 65 bytes ending in `0x01`.
- **Tweaked-only Taproot signing.** Vault PSBTs are Taproot script-path spends and need the untweaked internal key. Honor `useTweakedSigner: false`.
- **No `deriveContextHash` support.** Hashlock derivation is mandatory; the deposit cannot proceed without it.
- **Mutating Pre-PegIn outputs.** The Pre-PegIn has, in order: one HTLC output per vault (vouts `0..N-1`), the 0-sat auth-anchor OP_RETURN at `vout = N` (exact 34-byte script, `OP_RETURN PUSH32 <hash>`), a 546-sat CPFP anchor to the depositor's BIP-86 key at `vout = N + 1`, then change if any ([`assertWasmPeginSizing.ts`][sizing]). Wallets MUST NOT reorder outputs, strip or modify the OP_RETURN or the anchor, change the fee, or add anti-fee-sniping `nLockTime` tweaks: the SDK rejects a returned PSBT whose unsigned transaction differs from the one it sent.
- **Unsupported funding input types.** Pre-PegIn funding inputs must be P2TR key-path or P2WPKH. The SDK verifies those two signature kinds and throws on any other input type.
- **Network mismatch.** Wallet must operate on the network the dApp is configured for (signet for testnet, mainnet for prod). Silent address-type swaps must error.
- **No batch `signPsbts`.** Not a hard incompatibility, but UX degrades to N popups per deposit + payout-presigning round.
- **Address-type drift on reconnect.** Returning P2WPKH after a Taproot address was used earlier in the session breaks the deposit. The wallet must keep the depositor identity stable for the session.
- **PSBT version mismatch.** The SDK passes BIP-174 PSBTv0; wallets that only accept v2 will fail.

Conformance test vectors for `deriveContextHash` and the
exact wire format are pinned in [the conformance test][vectors].

[sizing]: ../../babylon-ts-sdk/src/tbv/core/primitives/psbt/assertWasmPeginSizing.ts

## Hardware Wallets

Two hardware integrations ship in the connector.

**Ledger Babylon Vault app** — the
[`ledger-vault` provider][ledgerVault] over the Ledger
Device Management Kit, with the host-side client in
[`packages/babylon-ledger-vault-signer`][signer]. It is a
dedicated app ("Babylon Vault" on mainnet, "Babylon Vault
Testnet" on signet) that implements `deriveContextHash`,
`bip322-simple` message signing and PSBT signing on the
device. The app is intent based: it signs a vault PSBT
only after the depositor has approved the deposit terms on
the device. The connector models that as the optional
`DepositTermsApprover` capability (`approveDepositTerms`,
plus the optional `validateDepositTerms` and
`holdsApprovedDepositTerms`, see
[`depositTerms.ts`][depositTerms]). A wallet that exposes
`approveDepositTerms` MUST also implement
`getChangeAddress` (`PrePeginChangeSource`, same file): the
dApp pays Pre-PegIn change to that address and the SDK
re-reads and compares it before building the transaction,
so it must stay stable for the whole deposit. The SDK
probes for the capability and, only when it is present:
approves after the root derivation and before the PegIn
signatures; before the Pre-PegIn signature derives the
root again and approves, unless `holdsApprovedDepositTerms`
reports the same terms still held; and approves again
before payout pre-signing, with no new derivation. Any
derivation invalidates a held approval and a byte-equal
re-approval must be a no-op. A device that has lost the
intent before payout signing reports it with the
`DEVICE_CEREMONY_INVALID` error code; the dApp then derives
again and retries once. No other wallet sees these calls.
A vendor building a device app that approves the vault
intent implements the same interface. The firmware the
host code is checked against is pinned in
[`FIRMWARE.md`][firmware].
The dApp enables this provider behind a feature flag and
needs WebHID.

**Keystone** — the [`keystone` provider][keystone],
air-gapped over QR. It implements `deriveContextHash`
through a dedicated UR type (firmware 2.4.6 or later per
the provider's floor, still to be confirmed with
Keystone), signs one PSBT per QR scan, and labels each
scan with its position in the batch.

The stock Ledger Bitcoin app adapters (`ledger`,
`ledger-v2`) do not expose `deriveContextHash`, so they
cannot deposit. No Trezor adapter exists. A new hardware
integration needs full conformance against the pinned test
vectors and a signet deposit-flow run before advertising
support.

[ledgerVault]: ../src/core/wallets/btc/ledger-vault/provider.ts
[signer]: ../../babylon-ledger-vault-signer/
[depositTerms]: ../../babylon-ts-sdk/src/tbv/core/deposit-terms/depositTerms.ts
[firmware]: ../../babylon-ledger-vault-signer/FIRMWARE.md
[keystone]: ../src/core/wallets/btc/keystone/provider.ts

## Ethereum Wallet

Babylon handles the Ethereum side through Reown AppKit:
injected EIP-6963 wallets, WalletConnect and hardware
transports, on Ethereum mainnet, Sepolia and a local Anvil
chain. BTC wallet vendors do not need a custom ETH
adapter; any wallet AppKit can reach with standard
EIP-1193 transaction signing is used as is. The
registration client handles externally owned accounts,
EIP-7702 delegated accounts and contract wallets such as
Safe.
