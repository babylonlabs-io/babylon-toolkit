# Managers Quickstart

End-to-end peg-in flow using the SDK's high-level managers and services. A vault goes from creation to `ACTIVE` through six phases; this doc walks you through them with runnable code.

> **New to the SDK?** Start with [Get Started](../get-started/README.md) first — it covers the four-layer architecture, trust model, config sourcing, and glossary. Come back here when you're ready to write code.
>
> **For complete function signatures**, see the [API Reference](../api/managers.md).

## When to use managers

Managers are the fastest path to a working flow when you're using a standard wallet (browser extension, viem `WalletClient`). They take wallet interfaces and run multi-step coordination (PSBT building, signing, contract calls) for you.

| Use case | Use |
|---|---|
| Browser app with a standard BTC wallet | **Managers** (this doc) |
| Quick integration, less code | **Managers** |
| Backend service with KMS/HSM signing | [Primitives](./primitives.md) |
| Full control over every step | [Primitives](./primitives.md) |

---

## The full vault lifecycle (6 phases)

| # | Phase | SDK entry point | Contract status after |
|---|-------|-----------------|-----------------------|
| 1 | Prepare Pre-PegIn + PegIn txs | `peginManager.preparePegin()` | n/a (off-chain) |
| 2 | Sign BTC proof-of-possession (once per session) | `peginManager.signProofOfPossession()` | n/a (off-chain) |
| 3 | Register on Ethereum | `peginManager.registerPeginOnChain()` | `PENDING` |
| 4 | Broadcast Pre-PegIn on Bitcoin | `peginManager.signAndBroadcast()` | still `PENDING` until VP observes the tx |
| 5 | Sign payout authorisations | `pollAndSignPayouts()` (service, delegates to `PayoutManager`) | `PENDING` → `VERIFIED` |
| 6 | **Activate by revealing HTLC secret** | `activateVault()` (service) | `VERIFIED` → `ACTIVE` |

> **Wait times:** phases 1–3 (prepare, PoP, register) run back-to-back with only wallet popups between them. After phase 4 (Bitcoin broadcast) you usually wait 1 BTC confirmation so the VP can index the Pre-PegIn and prepare transaction graphs (minutes). Phase 5 drives the contract to `VERIFIED` once all payout signatures are posted.
>
> **Wallet requirements:** BTC wallet needs UTXOs to cover the vault amount + network fees + the depositor-claim output. ETH wallet needs gas + the per-provider peg-in fee (queried from the contract) + gas for activation.
>
> **Exit path:** if anything goes wrong before activation, see [Advanced Topics → Refund](./managers-advanced.md#refund--exit-path) for how to reclaim BTC via the CSV-timelocked refund script after the timelock expires.

---

## Before you start — generate and persist an HTLC secret

Every vault is gated by an HTLC. The **secret** is a 32-byte random value you generate client-side. Its SHA-256 is the **hashlock** that gets registered on Ethereum. You must **persist the secret** until activation (phase 6) — without it you cannot activate, and the vault will sit at `VERIFIED` until it expires.

```typescript
import { computeHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Hex } from "viem";

// Node.js
import { randomBytes } from "node:crypto";
const secret = `0x${randomBytes(32).toString("hex")}` as Hex;

// Browser — use the Web Crypto API
// const bytes = crypto.getRandomValues(new Uint8Array(32));
// const secret = `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")}` as Hex;

const hashlock = computeHashlock(secret); // 0x-prefixed bytes32

// Persist `secret` in your app storage. You will need it in phase 6.
```

**Hex format rules:**

| Value | Passed to | Format |
|---|---|---|
| `secret` | `activateVault()` | 0x-prefixed bytes32 (66 chars) |
| `hashlock` | `registerPeginOnChain()` | 0x-prefixed bytes32 (66 chars) |
| `hashlocks[i]` | `preparePegin()` | **no** 0x prefix, 64 hex chars |

The hashlock without the `0x` is what the Bitcoin HTLC commits to; the `0x`-prefixed form is what the contract stores. They're the same bytes.

---

## Configuration

The `btcVaultRegistry` is the Ethereum contract that handles BTC vault registration. The address is deployment-specific — see [Get Started → Where config values come from](../get-started/README.md#where-config-values-come-from).

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { sepolia } from "viem/chains";
import type { WalletClient } from "viem";

// You provide these — see the Wallet Interfaces guide linked below.
declare const btcWallet: BitcoinWallet;
declare const ethWallet: WalletClient;

const peginManager = new PeginManager({
  btcNetwork: "signet",
  btcWallet,
  ethWallet,
  ethChain: sepolia,
  vaultContracts: {
    btcVaultRegistry: "0x...",
  },
  mempoolApiUrl: "https://mempool.space/signet/api",
});
```

> Need to build the wallet? → [Wallet Interfaces Guide](../guides/wallet-interfaces.md).

---

## End-to-end flow

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  activateVault,
  computeHashlock,
  pollAndSignPayouts,
  type PayoutSigningContext,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { VaultProviderRpcClient } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { type UTXO } from "@babylonlabs-io/ts-sdk/tbv/core";
import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Address, Hex, WalletClient } from "viem";
import { randomBytes } from "node:crypto";

// The manager and wallets constructed in the Configuration section above.
declare const peginManager: PeginManager;
declare const btcWallet: BitcoinWallet;
declare const ethWallet: WalletClient;

// Values you source before starting — see Get Started → Where config values come from.
declare const BTC_VAULT_REGISTRY: Address;
declare const vaultProviderProxyUrl: string;
declare const vaultProviderBtcPubkey: string;
declare const vaultKeeperBtcPubkeys: string[];
declare const universalChallengerBtcPubkeys: string[];
declare const timelockPegin: number;
declare const timelockRefund: number;
declare const protocolFeeRate: bigint;
declare const mempoolFeeRate: number;
declare const councilQuorum: number;
declare const councilSize: number;
declare const availableUTXOs: UTXO[];
declare const changeAddress: string;
declare const vpEthAddress: Address;
// `depositorWotsPkHash` is the keccak256 of the depositor's WOTS public-key
// commitment. SDK WOTS helpers are currently legacy (see Get Started →
// Known gaps); vault apps derive this out-of-band today.
declare const depositorWotsPkHash: Hex;

// 0. Generate + persist the HTLC secret. KEEP this — you need it in phase 6.
const secret = `0x${randomBytes(32).toString("hex")}` as Hex;
const hashlock = computeHashlock(secret);     // 0x-prefixed
const rawHashlock = stripHexPrefix(hashlock); // 64 hex chars, no 0x

const depositorBtcPubkey = await btcWallet.getPublicKeyHex();

// 1. Prepare Pre-PegIn + PegIn transactions. The arrays let you batch
//    multiple vaults into a single Pre-PegIn tx; most callers pass single
//    elements for a one-vault flow.
const result = await peginManager.preparePegin({
  amounts: [100_000n],               // satoshis, one per vault
  hashlocks: [rawHashlock],          // 64-char hex, no 0x, one per vault
  vaultProviderBtcPubkey,
  vaultKeeperBtcPubkeys,
  universalChallengerBtcPubkeys,
  timelockPegin,
  timelockRefund,
  protocolFeeRate,
  mempoolFeeRate,
  councilQuorum,
  councilSize,
  availableUTXOs,
  changeAddress,
});

const firstVault = result.perVault[0];

// 2. Sign the BTC proof-of-possession — one wallet popup. The returned
//    PopSignature is reusable across every registerPeginOnChain call in
//    this session (same depositor = same PoP).
const popSignature = await peginManager.signProofOfPossession();

// 3. Register on Ethereum (submits the vault + hashlock).
const { vaultId, peginTxHash } = await peginManager.registerPeginOnChain({
  unsignedPrePeginTx: result.fundedPrePeginTxHex,
  depositorSignedPeginTx: firstVault.peginTxHex,
  hashlock,
  vaultProvider: vpEthAddress,
  depositorWotsPkHash,
  htlcVout: firstVault.htlcVout,
  popSignature,
});
// Contract status: PENDING

// 4. Broadcast the Pre-PegIn tx to Bitcoin.
const btcTxid = await peginManager.signAndBroadcast({
  fundedPrePeginTxHex: result.fundedPrePeginTxHex,
  depositorBtcPubkey,
});

// 5. Wait for the VP, sign payouts, submit. The service polls the VP,
//    signs with your BitcoinWallet, and posts signatures back.
const vpClient = new VaultProviderRpcClient(vaultProviderProxyUrl);

const signingContext: PayoutSigningContext = {
  peginTxHex: firstVault.peginTxHex,
  vaultProviderBtcPubkey,
  vaultKeeperBtcPubkeys,
  universalChallengerBtcPubkeys,
  depositorBtcPubkey: stripHexPrefix(depositorBtcPubkey),
  timelockPegin,
  network: "signet",
  registeredPayoutScriptPubKey: "0x...",   // from PegInSubmitted event / indexer
};

await pollAndSignPayouts({
  statusReader: vpClient,
  presignClient: vpClient,
  btcWallet,
  peginTxid: stripHexPrefix(peginTxHash),
  depositorPk: stripHexPrefix(depositorBtcPubkey),
  signingContext,
  onProgress: (completed, total) => console.log(`Signed ${completed}/${total}`),
});
// Contract status: VERIFIED

// 6. Activate — reveal the HTLC secret. `writeContract` is the adapter
//    that hands the SDK's prepared call to your ETH transport.
await activateVault({
  btcVaultRegistryAddress: BTC_VAULT_REGISTRY,
  vaultId,
  secret,
  hashlock,             // optional: SDK pre-validates sha256(secret)===hashlock client-side
  activationMetadata: "0x",
  writeContract: async (call) => {
    const hash = await ethWallet.writeContract({
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      account: ethWallet.account!,
      chain: ethWallet.chain!,
    });
    return { transactionHash: hash };
  },
});
// Contract status: ACTIVE — vault is usable (e.g. as Aave collateral).
```

---

## What each phase returns

| Phase | Method / Service | Returns |
|---|---|---|
| 1 | `peginManager.preparePegin()` | `{ fundedPrePeginTxHex, prePeginTxid, perVault[], selectedUTXOs, fee, changeAmount }`; each `perVault[i]` has `{ htlcVout, htlcValue, peginTxHex, peginTxid, peginInputSignature, vaultScriptPubKey }`. Pass `fundedPrePeginTxHex` as the `unsignedPrePeginTx` register param — the registry stores the funded pre-witness form. |
| 2 | `peginManager.signProofOfPossession()` | `{ btcPopSignature, depositorEthAddress, depositorBtcPubkey }` — reusable across every `registerPeginOnChain` call in the session |
| 3 | `peginManager.registerPeginOnChain()` | `{ ethTxHash, vaultId, peginTxHash }` |
| 4 | `peginManager.signAndBroadcast()` | `btcTxid` (string) |
| 5 | `pollAndSignPayouts()` | `void` — side effect: signatures posted, contract moves to `VERIFIED` |
| 6 | `activateVault()` | Whatever `writeContract` returns (typically `{ transactionHash }`) |

---

## Next Steps

- **[Advanced Topics](./managers-advanced.md)** — refund exit path, `PayoutManager` for single-claimer signing, batch / multi-vault patterns
- **[Wallet Interfaces Guide](../guides/wallet-interfaces.md)** — browser / Node.js / KMS adapters
- **[Aave Integration Quickstart](../integrations/aave/quickstart.md)** — use your vault as collateral
- **[Primitives Quickstart](./primitives.md)** — lower-level flow for custom signing paths
- **[API Reference](../api/managers.md)** — complete function signatures
