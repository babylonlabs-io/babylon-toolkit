# Managers — Advanced Topics

Reached here from the [Managers Quickstart](./managers.md)? This doc covers the non-happy-path cases: reclaiming BTC from an expired vault, single-claimer payout signing, and multi-vault batching.

## Refund — exit path

If something goes wrong — lost HTLC secret, VP never moves the vault to `VERIFIED`, activation deadline expires — the depositor reclaims the BTC locked in the HTLC output via the refund path. The refund is CSV-timelocked: it only becomes valid after `timelockRefund` Bitcoin blocks have passed since the Pre-PegIn was confirmed.

```typescript
import {
  buildAndBroadcastRefund,
  BIP68NotMatureError,
  type VaultRefundData,
  type RefundPrePeginContext,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { getNetworkFees, pushTx } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { Hex } from "viem";

declare const vaultId: Hex;
declare const btcWallet: BitcoinWallet;

const mempoolApiUrl = "https://mempool.space/signet/api";

try {
  // Pre-fetch the mempool fee rate — passed in by value, not as a callback,
  // because it doesn't depend on anything the SDK computes.
  const { halfHourFee } = await getNetworkFees(mempoolApiUrl);

  const { txId } = await buildAndBroadcastRefund({
    vaultId,
    feeRate: halfHourFee,
    readVault: async (): Promise<VaultRefundData> => {
      // Read hashlock, htlcVout, versions from BTCVaultRegistry on-chain
      // (use ViemVaultRegistryReader); read amount + unsignedPrePeginTxHex
      // from the indexer. Combine into a VaultRefundData shape.
      throw new Error("implement with ViemVaultRegistryReader + indexer");
    },
    readPrePeginContext: async (vault): Promise<RefundPrePeginContext> => {
      // Resolve offchain params, vault keepers, universal challengers at
      // the vault's pinned versions (on-chain), plus the vault-provider
      // pubkey (indexer hint). Return sorted pubkey arrays.
      throw new Error("implement with Viem*Reader at vault's pinned versions");
    },
    signPsbt: (psbtHex, opts) => btcWallet.signPsbt(psbtHex, opts),
    broadcastTx: async (signedTxHex) => ({
      txId: await pushTx(signedTxHex, mempoolApiUrl),
    }),
  });
} catch (err) {
  if (err instanceof BIP68NotMatureError) {
    // Timelock hasn't matured yet — show "wait until block N" to the user.
  } else {
    throw err;
  }
}
```

See the `services/vault` package in [babylon-toolkit](https://github.com/babylonlabs-io/babylon-toolkit) for a production adapter that wires these callbacks to the SDK's on-chain readers + a mempool API.

---

## PayoutManager — single-claimer payout signing

Most applications don't drive `PayoutManager` directly. During phase 4 of the peg-in, the [`pollAndSignPayouts()`](../api/services.md) service polls the VP, fetches per-claimer payout transactions, delegates signing to `PayoutManager` (batching through `signPsbts` when the wallet supports it), and submits signatures back to the VP. See the [Managers Quickstart end-to-end flow](./managers.md#end-to-end-flow) for the common path.

Use `PayoutManager` directly only when you need to sign a single claimer's payout in isolation — e.g. a test harness, an out-of-band recovery, or a custom orchestration loop.

> **What you're authorising.** A payout signature is cryptographic pre-authorisation that lets any qualified claimer move BTC out of the vault given a valid proof of bad behaviour. This is part of the [vault's security graph](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md#2-transaction-graph-and-presigning).

### Configuration

```typescript
import { PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";

declare const btcWallet: BitcoinWallet;

const payoutManager = new PayoutManager({
  network: "signet",
  btcWallet,
});
```

### Sign one payout

`timelockPegin` comes from the vault's locked offchain params version — see `ViemProtocolParamsReader.getOffchainParamsByVersion()`.

```typescript
const { signature, depositorBtcPubkey } = await payoutManager.signPayoutTransaction({
  payoutTxHex: "...",
  peginTxHex: "...",
  assertTxHex: "...",                        // Assert transaction (challenge path)
  depositorBtcPubkey: "...",
  vaultProviderBtcPubkey: "...",
  vaultKeeperBtcPubkeys: [/* … */],
  universalChallengerBtcPubkeys: [/* … */],
  timelockPegin: 100,                        // from vault-pinned offchain params
  registeredPayoutScriptPubKey: "0x...",     // from on-chain vault data
});
```

### Batch signing

If the underlying wallet supports `signPsbts`, use `signPayoutTransactionsBatch` to sign all claimer payouts in a single wallet interaction:

```typescript
if (payoutManager.supportsBatchSigning()) {
  const results = await payoutManager.signPayoutTransactionsBatch([
    /* one SignPayoutParams per claimer */
  ]);
}
```

The `pollAndSignPayouts()` service does this automatically.

---

## Multi-vault batching (single Pre-PegIn tx)

`preparePegin()` accepts `amounts` and `hashlocks` arrays, which lets you batch N vaults into one Pre-PegIn transaction. This saves BTC fees (single funding tx covering many HTLC outputs) and reduces wallet interactions.

Rules to watch:

- Every vault must use the same `vaultProviderBtcPubkey`, `vaultKeeperBtcPubkeys`, `universalChallengerBtcPubkeys`, and protocol params. If you need different providers, register separately.
- Each vault needs its own fresh HTLC secret + hashlock. Generate one per entry in the arrays, pair them by index.
- Sign the proof-of-possession **once** (single wallet popup) and reuse the same `PopSignature` across every `registerPeginOnChain()` call in the batch.
- `preparePegin().perVault[i]` returns one entry per vault — call `registerPeginOnChain()` for each. Broadcast the Pre-PegIn once.

Example (builds on the happy-path config — `peginManager`, `btcWallet`, `vpEthAddress`, etc. are the same instances you set up in [Managers Quickstart → Configuration](./managers.md#configuration)):

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import { computeHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";

declare const peginManager: PeginManager;
declare const btcWallet: BitcoinWallet;
declare const vpEthAddress: Address;

// Every non-array param is the same as the single-vault happy path — vault
// provider pubkey, keepers, challengers, timelocks, fee rate, council
// params, UTXO set, change address. Reuse that object minus the per-vault
// arrays so we don't drift from the happy-path source of truth.
declare const sharedBatchParams: Omit<
  Parameters<typeof peginManager.preparePegin>[0],
  "amounts" | "hashlocks"
>;

// One fresh HTLC secret per vault. PERSIST all of them — you need them
// independently for each vault's phase-6 activation.
const secrets: Hex[] = [
  `0x${randomBytes(32).toString("hex")}` as Hex,
  `0x${randomBytes(32).toString("hex")}` as Hex,
];
const hashlocks = secrets.map(computeHashlock);          // 0x-prefixed bytes32
const rawHashlocks = hashlocks.map(stripHexPrefix);      // 64-char hex, no 0x

// One WOTS commitment per vault. Derivation is out of scope for this
// snippet — supply these from wherever your app keeps WOTS material.
declare const depositorWotsPkHashes: Hex[];

const depositorBtcPubkey = await btcWallet.getPublicKeyHex();

const result = await peginManager.preparePegin({
  ...sharedBatchParams,
  amounts: [100_000n, 250_000n],
  hashlocks: rawHashlocks,
});

// Sign the BTC proof-of-possession ONCE for the whole batch.
const popSignature = await peginManager.signProofOfPossession();

// One registerPeginOnChain call per vault; they share the same Pre-PegIn
// tx and the same PopSignature.
for (let i = 0; i < result.perVault.length; i++) {
  await peginManager.registerPeginOnChain({
    unsignedPrePeginTx: result.fundedPrePeginTxHex,
    depositorSignedPeginTx: result.perVault[i].peginTxHex,
    hashlock: hashlocks[i],
    vaultProvider: vpEthAddress,
    depositorWotsPkHash: depositorWotsPkHashes[i],
    htlcVout: result.perVault[i].htlcVout,
    popSignature,
  });
}

// Broadcast the Pre-PegIn once — all vaults share it.
await peginManager.signAndBroadcast({
  fundedPrePeginTxHex: result.fundedPrePeginTxHex,
  depositorBtcPubkey,
});
```

Persist each `secrets[i]` alongside its `vaultId` so you can activate them independently in phase 6. Losing any one secret strands that vault at `VERIFIED` until refund.

---

## See also

- [Managers Quickstart](./managers.md) — the happy path
- [Wallet Interfaces Guide](../guides/wallet-interfaces.md) — KMS/HSM + hardware wallet adapters
- [Services API reference](../api/services.md) — full signatures for `activateVault`, `buildAndBroadcastRefund`, `pollAndSignPayouts`
- [Managers API reference](../api/managers.md) — full signatures for `PeginManager` + `PayoutManager`
