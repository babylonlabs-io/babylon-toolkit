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

| # | Phase | SDK entry point | Contract status after | Wallet popups |
|---|-------|-----------------|-----------------------|---------------|
| 1 | Prepare Pre-PegIn + PegIn txs (sizing + wallet root + per-vault expand + batch sign) | `peginManager.preparePegin()` | n/a (off-chain) | 2 BTC (`deriveContextHash`, `signPsbts`) |
| 2 | Sign BTC proof-of-possession (once per session) | `peginManager.signProofOfPossession()` | n/a (off-chain) | 1 BTC (`signMessage`) |
| 3 | Register on Ethereum | `peginManager.registerPeginOnChain()` | `PENDING` | 1 ETH |
| 4 | Broadcast Pre-PegIn on Bitcoin | `peginManager.signAndBroadcast()` | still `PENDING` until VP observes the tx | 1 BTC (`signPsbt`) |
| 5 | Sign payout authorisations | `runDepositorPresignFlow()` (service, delegates to `PayoutManager`) | `PENDING` → `VERIFIED` | 1 BTC (`signPsbts`) |
| 6 | **Activate by revealing HTLC secret** | `activateVault()` (service) | `VERIFIED` → `ACTIVE` | 1 ETH |

> **Wait times:** phases 1–3 (prepare, PoP, register) run back-to-back with only wallet popups between them. After phase 4 (Bitcoin broadcast) you usually wait 1 BTC confirmation so the VP can index the Pre-PegIn and prepare transaction graphs (minutes). Phase 5 drives the contract to `VERIFIED` once all payout signatures are posted.
>
> **Wallet requirements:** BTC wallet needs UTXOs to cover the vault amount + network fees + the depositor-claim output. ETH wallet needs gas + the per-provider peg-in fee (queried from the contract) + gas for activation.
>
> **Exit path:** if anything goes wrong before activation, see [Advanced Topics → Refund](./managers-advanced.md#refund--exit-path) for how to reclaim BTC via the CSV-timelocked refund script after the timelock expires.

---

## What the SDK derives for you

You do **not** generate or persist HTLC secrets. `preparePegin()` derives them deterministically from the wallet via `deriveContextHash` → `expandHashlockSecret(root, htlcVout)`. The same `(wallet, vaultContext, htlcVout)` always yields the same secret, so resume + activation can re-derive on demand.

`preparePegin()` returns:

```typescript
{
  transaction: { fundedPrePeginTxHex, prePeginTxid, perVault[], selectedUTXOs, fee, changeAmount },
  depositorBtcPubkey: string,         // x-only pubkey snapshot — safe to persist
  derivedSecrets: {                   // sensitive — do not log / persist
    perVaultWotsKeys: WotsBlockPublicKey[][],
    wotsPkHashes: Hex[],              // for `registerPeginOnChain.depositorWotsPkHash`
    htlcSecretHexes: string[],        // 64-char hex, no 0x; SHA256 → on-chain hashlock
  },
}
```

The `secret` you pass to `activateVault()` is `0x${derivedSecrets.htlcSecretHexes[i]}`. The `hashlock` you pass to `registerPeginOnChain()` is `computeHashlock(secret)`.

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
  runDepositorPresignFlow,
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
// 1. Prepare Pre-PegIn + PegIn transactions. The SDK orchestrator
//    snapshots the wallet pubkey, runs a sizing pass, fires ONE
//    `deriveContextHash` popup, derives per-vault WOTS keys + HTLC
//    secrets from the same root, and signs the PegIn-input PSBTs.
//    Returns broadcast-ready txs + the depositor pubkey snapshot +
//    sensitive derived secrets (treat with care).
const result = await peginManager.preparePegin({
  amounts: [100_000n],               // satoshis, one per vault
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

const firstVault = result.transaction.perVault[0];
const depositorBtcPubkey = result.depositorBtcPubkey;
const secret = `0x${result.derivedSecrets.htlcSecretHexes[0]}` as Hex;
const hashlock = computeHashlock(secret);     // 0x-prefixed
const depositorWotsPkHash = result.derivedSecrets.wotsPkHashes[0];

// 2. Sign the BTC proof-of-possession — one wallet popup. The returned
//    PopSignature is reusable across every registerPeginOnChain call in
//    this session (same depositor = same PoP).
const popSignature = await peginManager.signProofOfPossession();

// 3. Register on Ethereum (submits the vault + hashlock).
const { vaultId, peginTxHash } = await peginManager.registerPeginOnChain({
  unsignedPrePeginTx: result.transaction.fundedPrePeginTxHex,
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
  fundedPrePeginTxHex: result.transaction.fundedPrePeginTxHex,
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

await runDepositorPresignFlow({
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
| 1 | `peginManager.preparePegin()` | `{ transaction, depositorBtcPubkey, derivedSecrets }`. `transaction` is broadcast-safe: `{ fundedPrePeginTxHex, prePeginTxid, perVault[], selectedUTXOs, fee, changeAmount }`. `depositorBtcPubkey` is the x-only pubkey snapshot used end-to-end. `derivedSecrets` is sensitive: `{ perVaultWotsKeys, wotsPkHashes, htlcSecretHexes }` — do not log or persist. Pass `transaction.fundedPrePeginTxHex` as the `unsignedPrePeginTx` register param. |
| 2 | `peginManager.signProofOfPossession()` | `{ btcPopSignature, depositorEthAddress, depositorBtcPubkey }` — reusable across every `registerPeginOnChain` call in the session |
| 3 | `peginManager.registerPeginOnChain()` | `{ ethTxHash, vaultId, peginTxHash }` |
| 4 | `peginManager.signAndBroadcast()` | `btcTxid` (string) |
| 5 | `runDepositorPresignFlow()` | `void` — side effect: signatures posted, contract moves to `VERIFIED` |
| 6 | `activateVault()` | Whatever `writeContract` returns (typically `{ transactionHash }`) |

---

## Next Steps

- **[Advanced Topics](./managers-advanced.md)** — refund exit path, `PayoutManager` for single-claimer signing, batch / multi-vault patterns
- **[Wallet Interfaces Guide](../guides/wallet-interfaces.md)** — browser / Node.js / KMS adapters
- **[Aave Integration Quickstart](../integrations/aave/quickstart.md)** — use your vault as collateral
- **[Primitives Quickstart](./primitives.md)** — lower-level flow for custom signing paths
- **[API Reference](../api/managers.md)** — complete function signatures
