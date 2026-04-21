# Get Started

New to `@babylonlabs-io/ts-sdk`? This is the orientation doc — what the SDK does, how it's organised, and where to go next. Target read time: ~5 minutes.

## What this SDK does

It lets your application move Bitcoin in and out of **Trustless Bitcoin Vaults (TBV)** and use the vaulted BTC as collateral on supported chains — **without giving up custody of the BTC**.

A user locks BTC on Bitcoin, the vault gets registered on Ethereum, and the user can then use that collateral in protocols like Aave. When they want the BTC back, they unlock the vault on Bitcoin.

The SDK runs on **Node.js** and in the browser. The only platform-specific thing is how you supply a Bitcoin wallet and an Ethereum wallet — the SDK defines interfaces and you adapt whatever wallet you already have.

Protocol background: [pegin spec](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md), [pegout spec](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegout.md), [presigning API](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/presigning-api.md).

> **Status:** the SDK is under active development. Interfaces on the `core` layer are stable for the flows documented in the quickstarts; `integrations/aave` is new and may evolve. The WOTS helpers under `tbv/core/wots/*` are deprecated for new integrators — see [Known gaps](#known-gaps) below.

## Trust model (read this before adopting)

Some properties of the protocol that directly affect your integration:

- **Vault providers (VPs)** are off-chain parties that co-sign payouts and can claim vaulted BTC on your behalf. Current deployments select VPs from a curated set surfaced via the Babylon vault indexer; verify the operating model of the specific deployment you're targeting before making assumptions about governance. If your chosen VP goes offline between steps of the peg-in flow, the **refund path** is your backstop — after the refund CSV timelock expires, you reclaim BTC directly from the Pre-PegIn HTLC without VP cooperation.
- **Indexer data is untrusted** for signing-critical decisions. Anything that influences what the user signs (script derivation, amount, hashlock, signer sets, locked protocol-param version) must come from the on-chain `BTCVaultRegistry` and `ProtocolParams` contracts. The indexer is fine for display, discovery, and non-authoritative reads.
- **The HTLC secret** is the 32-byte preimage the depositor reveals on Ethereum to move the vault from `VERIFIED` → `ACTIVE`. Today you generate and persist it client-side before the Ethereum registration transaction; if it's lost before activation, the vault expires and the only exit is refund after the timelock. A planned wallet-side API (`deriveContextHash`, [spec](../../../../docs/specs/derive-context-hash.md)) will let the wallet re-derive this secret deterministically from its key material + on-chain context — removing the lose-it-and-lose-the-vault failure mode. See the [Wallet Interfaces Guide → Roadmap](../guides/wallet-interfaces.md#roadmap-derivecontexthash).

### Vault lifecycle

Every vault lives in one of these on-chain states. Your SDK code transitions between them as shown:

```
  [ off-chain ]
       │
       │  peginManager.registerPeginOnChain()
       ▼
    PENDING  ◀──── VP observes Pre-PegIn, builds graph, posts payout signatures
       │
       ▼
   VERIFIED
       │ ┌─── activation window expires ───▶ EXPIRED ──┐
       │ │                                             │
       │ ▼                                             │
       │ activateVault(secret)                         │
       │                                               │
       ▼                                               ▼
    ACTIVE                                  buildAndBroadcastRefund()
       │                                               │
       │ peg-out flow                                  ▼
       ▼                                        (BTC reclaimed
    REDEEMED                                     via refund path)
```

The critical transition is `VERIFIED → ACTIVE`. Until the depositor reveals the HTLC secret on Ethereum, the vault is **not live** — miss the activation window and the only exit is refund after the CSV timelock.

## Decide where to start

Pick the shortest path for what you're building.

| I want to… | Go here |
|---|---|
| Let users deposit BTC and manage vaults in a web app | [Quickstart: Managers](../quickstart/managers.md) |
| Use a vault as Aave collateral (requires an existing vault first) | [Aave Integration Quickstart](../integrations/aave/quickstart.md) |
| Read authoritative vault state for a signing / on-chain check | `@babylonlabs-io/ts-sdk/tbv/core/clients` (`ViemVaultRegistryReader`, `ViemProtocolParamsReader`) — see the code example in [Where config values come from](#where-config-values-come-from) |
| Read vault state for a UI / dashboard (non-authoritative, fast) | Babylon vault indexer (GraphQL) + `getPeginProtocolState` from `@babylonlabs-io/ts-sdk/tbv/core/services` |
| Recover a vault when the HTLC secret was lost (refund after timelock) | `buildAndBroadcastRefund` from `@babylonlabs-io/ts-sdk/tbv/core/services` |
| Build a backend service that signs with a KMS/HSM | [Quickstart: Primitives](../quickstart/primitives.md) |
| Adapt a non-browser or hardware wallet to the SDK | [Wallet Interfaces](../guides/wallet-interfaces.md) + [Quickstart: Primitives](../quickstart/primitives.md) |
| Test an integration without a live VP / real Bitcoin | `@babylonlabs-io/ts-sdk/testing` (mock wallets) |
| Just browse everything that's exported | [API Reference](../api/README.md) |

If you're not sure, start with **[Managers Quickstart](../quickstart/managers.md)** — fastest path to a working vault flow.

> **Out of scope:** this SDK does not help you *operate* a vault provider. That's a separate off-chain service — see the `btc-vault` repo.

## How the SDK is organised

Treat the SDK as a set of peer entry points, not a strict staircase. Applications compose the pieces they need.

```
primitives     Pure WASM-backed PSBT builders + script helpers
utils          Funding, fees, UTXOs, BTC/script helpers, signing helpers
services       Stateless flow helpers with injected I/O callbacks
managers       Wallet-owning orchestration classes
integrations   Application-specific modules (e.g. Aave)
clients        Optional on-chain readers (vault data, protocol params, signer sets)
```

Each maps to a public subpath like `@babylonlabs-io/ts-sdk/tbv/core/<name>` (see [Subpath exports](#subpath-exports) below).

- **primitives** — Pure PSBT builders. No wallet, no network. You control everything. Examples: `buildPrePeginPsbt`, `buildPayoutPsbt`, `buildRefundPsbt`.
- **utils** — Pure helpers for UTXO selection/reservation, fee constants, transaction funding, BTC/script utilities, taproot signing options.
- **services** — Stateless flow helpers that compose primitives with **injected** I/O callbacks (sign, broadcast, contract write). They don't own the wallet. Examples: `activateVault`, `buildAndBroadcastRefund`, `pollAndSignPayouts`, `getPeginProtocolState`, `BIP68NotMatureError`.
- **managers** — Stateful classes that take a wallet interface and run a full flow. Examples: `PeginManager` (vault creation), `PayoutManager` (payout signing).
- **integrations** — Application-specific modules built on top of the lower layers. Current: Aave v4.
- **clients** — Optional on-chain reader classes for authoritative contract data at the version the vault pinned. Examples: `ViemProtocolParamsReader`, `ViemVaultKeeperReader`, `ViemUniversalChallengerReader`, `ViemVaultRegistryReader`, plus the `resolveProtocolAddresses` helper.

**Rule of thumb:** start with a **manager** for peg-in orchestration. Reach for a **service** when you need to control the transport (viem vs. wagmi vs. custom) for a sub-step like activation, refund, or payout polling. Drop to **primitives + utils** only when you need custom signing (KMS/HSM, hardware) or full step-by-step control.

## Prerequisites

### Runtime

- **Node.js ≥ 20.3.0** (`AbortSignal.any()` is required). Works on Node 20 LTS, 22 LTS, 24 LTS.
- For browser targets: a bundler that handles `.wasm` assets (Vite, webpack, Next.js, Rollup) and a `Buffer` polyfill. See [Troubleshooting](./troubleshooting.md).

### Packages

```bash
npm install @babylonlabs-io/ts-sdk viem bitcoinjs-lib @bitcoin-js/tiny-secp256k1-asmjs
```

These are peer dependencies. `bitcoinjs-lib` and `@bitcoin-js/tiny-secp256k1-asmjs` are pinned to exact versions; `viem` is range-pinned (`^2.x`). The SDK re-exports types from `viem` and relies on `bitcoinjs-lib` for Taproot operations.

### One-time setup at application startup

```typescript
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib } from "bitcoinjs-lib";

initEccLib(ecc);
```

- **Node.js:** top of your entry file (`index.ts`, CLI entrypoint).
- **React:** in `main.tsx` / `App.tsx` before `createRoot()`.

Skipping this produces `"No ECC Library provided"` at the first PSBT call.

The WASM package (`@babylonlabs-io/babylon-tbv-rust-wasm`) ships inside the SDK and initialises itself lazily — don't install it directly.

### Subpath exports

Import from specific subpaths for best tree-shaking:

| Subpath | Contents |
|---|---|
| `@babylonlabs-io/ts-sdk/shared` | `BitcoinWallet` interface, `SignPsbtOptions` |
| `@babylonlabs-io/ts-sdk/tbv/core` | `PeginManager`, `PayoutManager`, and re-exports of the core layer |
| `@babylonlabs-io/ts-sdk/tbv/core/primitives` | PSBT builders |
| `@babylonlabs-io/ts-sdk/tbv/core/services` | `activateVault`, `buildAndBroadcastRefund`, `pollAndSignPayouts`, protocol-state helpers |
| `@babylonlabs-io/ts-sdk/tbv/core/clients` | On-chain reader classes (`Viem*Reader`) |
| `@babylonlabs-io/ts-sdk/tbv/integrations/aave` | Aave v4 transaction + position helpers |
| `@babylonlabs-io/ts-sdk/testing` | Mock wallet implementations for tests |

## Where config values come from

Every flow needs a combination of contract addresses, protocol parameters, vault-provider endpoints, and indexer URLs. Here's where each lives — the SDK reads nothing implicitly; you wire each source up.

| What you need | Source | Notes |
|---|---|---|
| `BTCVaultRegistry`, `AaveIntegrationAdapter` contract addresses | Your own environment config | Pinned per deployment (network + app instance). Not shipped with the SDK. |
| **Vault-pinned version fields** (`offchainParamsVersion`, `appVaultKeepersVersion`, `universalChallengersVersion`) | On-chain, from the vault record in `BTCVaultRegistry` | Via `ViemVaultRegistryReader`. These versions determine which protocol params and signer sets are valid for this vault. |
| Versioned **protocol params** (timelocks, fee rate, quorum, security council) | On-chain `ProtocolParams` at the vault's pinned `offchainParamsVersion` | Via `ViemProtocolParamsReader.getOffchainParamsByVersion()`. Never use "latest" for signing-critical flows. |
| **Vault keepers** / **universal challengers** | On-chain, at the versions pinned by the vault | Via `ViemVaultKeeperReader.getVaultKeepersByVersion()` and `ViemUniversalChallengerReader.getUniversalChallengersByVersion()`. |
| Vault provider discovery (BTC pubkey, RPC URL, metadata) | Babylon vault indexer (GraphQL) | Discovery data; still a trust boundary — callers should validate it against signing expectations before use. |
| Per-vault display state (status, timestamps, UI metadata) | Babylon vault indexer (GraphQL) | OK for UI; don't use for vault-pinned signing context. |
| BTC mempool (UTXO listing, fee estimation, broadcast) | Mempool.space or a compatible instance | Public Bitcoin data. Pick the endpoint matching your BTC network (mainnet / signet / testnet). |

**Minimal example: resolve a vault's locked protocol params on-chain**

```typescript
import {
  ViemVaultRegistryReader,
  ViemProtocolParamsReader,
  resolveProtocolAddresses,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const publicClient = createPublicClient({ chain: sepolia, transport: http(ETH_RPC_URL) });
const { protocolParams } = await resolveProtocolAddresses(publicClient, BTC_VAULT_REGISTRY);

const vaultReader = new ViemVaultRegistryReader(publicClient, BTC_VAULT_REGISTRY);
const paramsReader = new ViemProtocolParamsReader(publicClient, protocolParams);

// vaultId: 0x-prefixed bytes32 (returned when you register a vault; see Managers quickstart)
const vault = await vaultReader.getVaultData(vaultId);
const params = await paramsReader.getOffchainParamsByVersion(
  vault.protocol.offchainParamsVersion,
);
// params.feeRate, params.tRefund (refund CSV timelock), params.councilQuorum, …
```

## Glossary

Terms used throughout the docs.

| Term | Meaning |
|---|---|
| **TBV** | Trustless Bitcoin Vaults — the protocol this SDK implements |
| **PSBT** | Partially Signed Bitcoin Transaction — the wire format for signing Bitcoin transactions collaboratively (BIP 174) |
| **Peg-in** | The flow that locks BTC into a vault and registers it on Ethereum |
| **Peg-out** | The flow that unlocks BTC from a vault back to the depositor's wallet |
| **Pre-PegIn tx** | First Bitcoin transaction — creates one HTLC output per vault, plus a shared CPFP anchor output |
| **PegIn tx** | Second Bitcoin transaction — partially signed by the depositor (HTLC leaf 0 input). VP/VKs/UCs add their signatures; the VP combines them with the revealed secret to produce the final spend that creates the **Vault UTXO** |
| **Vault UTXO** | The on-chain Bitcoin output produced by the PegIn tx that represents the live vault — the target of later payout transactions |
| **HTLC** | Hash Time-Lock Contract — the Bitcoin script on the Pre-PegIn output. Locks the vault amount + depositor claim value + minimum peg-in fee. Spendable via the secret (claim path) or after a CSV timelock (refund path) |
| **HTLC secret** | 32-byte preimage the depositor reveals on Ethereum to activate the vault. Persist it between registration and activation — losing it strands the vault until refund |
| **Hashlock** | `SHA-256(HTLC secret)` — stored on-chain at vault registration |
| **Activation** | Revealing the HTLC secret on Ethereum to move the vault from `VERIFIED` → `ACTIVE`. Without this the vault expires |
| **Refund** | Fallback exit — after the refund CSV timelock expires, the depositor reclaims BTC directly from the Pre-PegIn HTLC without VP cooperation |
| **VP** (Vault Provider) | Off-chain party, gated by on-chain registration, that co-signs payouts, builds the transaction graph, and can submit claims. One per vault. See [Trust model](#trust-model-read-this-before-adopting) for governance hedging |
| **VK** (Vault Keeper) | Signer in a versioned keeper set that participates in PegIn ACKs and co-signs application-specific payouts (e.g. Aave liquidation flows) |
| **UC** (Universal Challenger) | Signer in a versioned challenger set that participates in PegIn presigning and can challenge VP/VK misbehaviour on Bitcoin |
| **Signer-set versions** | Keepers and challengers rotate over time. Every vault records two separate versions (`appVaultKeepersVersion`, `universalChallengersVersion`) and an `offchainParamsVersion`. Signing and refund flows must use those pinned versions, not "latest" |
| **WOTS** | Winternitz One-Time Signature — per-deposit key material committed during registration and revealed during payout signing. Most integrators should not touch WOTS directly |
| **PoP** (Proof of Possession) | BIP-322 signature proving the depositor controls the BTC pubkey they're registering |
| **CPFP** | Child-Pays-For-Parent — the Pre-PegIn tx includes an anchor output the depositor can spend to bump the effective fee rate |
| **Indexer** | GraphQL service that mirrors on-chain vault state for UI/discovery (current deployments are Babylon-operated — verify for your target deployment). Trusted for display; untrusted for signing-critical decisions |
| **Spoke** | Aave Core Spoke contract — the read surface for position health, debt, and collateral data |
| **Adapter** | Aave Integration Adapter contract — the depositor-facing write entry point (borrow/repay/withdraw) |
| **Signet** | Bitcoin test network that most examples target; switch to `bitcoin` (mainnet) once your flow is live |

## Verify the install

```typescript
import { buildPrePeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

console.log("✅ SDK installed");
console.log("buildPrePeginPsbt type:", typeof buildPrePeginPsbt);
```

Run with `npx tsx verify-install.ts` (npx will auto-install `tsx`). If that works, your environment is ready for any of the quickstarts.

## Known gaps

- **`tbv/core/wots/*`** currently exports a legacy 508-pair derivation that is incompatible with the active vault-provider shape. The vault app uses a separate Rust-style implementation. New integrators should treat the SDK's WOTS helpers as unsupported until migrated — vault apps typically derive the `depositorWotsPkHash` out-of-band for now.
- **Wallet-derived secrets (`deriveContextHash`)** is spec'd ([spec](../../../../docs/specs/derive-context-hash.md)) and targeted for the near term but not yet implemented on the `BitcoinWallet` interface. Once it lands, the HTLC secret and the WOTS seed will both move to deterministic wallet derivation instead of client-generated + manually persisted material. Track this via the [Wallet Interfaces Guide → Roadmap](../guides/wallet-interfaces.md#roadmap-derivecontexthash).

## Next steps

Suggested reading order for a new integrator:

1. **[Wallet Interfaces Guide](../guides/wallet-interfaces.md)** — the Managers quickstart needs a `BitcoinWallet` adapter; set this up first.
2. **[Troubleshooting](./troubleshooting.md)** — Buffer / WASM / bundler issues are common on first run; bookmark before you start.
3. **[Managers Quickstart](../quickstart/managers.md)** — run a complete peg-in → activation flow end-to-end.
4. **[Aave Integration Quickstart](../integrations/aave/quickstart.md)** — once you have a working vault.
5. **[API Reference](../api/README.md)** — for lookup while writing code.
6. **[Primitives Quickstart](../quickstart/primitives.md)** — only if you need custom signing (KMS/HSM/hardware).
