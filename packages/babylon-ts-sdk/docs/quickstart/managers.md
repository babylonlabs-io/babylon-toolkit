# Managers

High-level orchestration for multi-step BTC vault operations.

> For complete function signatures, see [API Reference](../api/managers.md).

## What Are Managers?

Managers orchestrate complex flows that involve multiple steps across Bitcoin and Ethereum. They:

- Accept wallet interfaces (you provide the wallet implementation)
- Handle multi-step coordination (PSBT building, signing, contract calls)
- Work in browser or Node.js (framework-agnostic)

## When to Use Managers vs Primitives

> **Primitives** are low-level pure functions for building Bitcoin PSBTs with no wallet dependencies. See [Primitives Quickstart](./primitives.md) for details.

| Use Case                              | Use          |
| ------------------------------------- | ------------ |
| Browser app with standard wallet      | **Managers** |
| Quick integration, less code          | **Managers** |
| Backend with custom signing (KMS/HSM) | Primitives   |
| Need full control over every step     | Primitives   |

---

## PeginManager

Orchestrates BTC vault creation ([peg-in flow](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md)).

### The full vault lifecycle (5 phases)

A vault goes from creation to `ACTIVE` through five phases. The last phase —
**activation** — is what actually finalises the vault on-chain and is easy to
miss: a vault sitting at `VERIFIED` is *not* done.

| # | Phase | SDK entry point | Contract status after |
|---|-------|-----------------|-----------------------|
| 1 | Prepare Pre-PegIn + PegIn txs | `peginManager.preparePegin()` | n/a (off-chain) |
| 2 | Register on Ethereum | `peginManager.registerPeginOnChain()` | `PENDING` |
| 3 | Broadcast Pre-PegIn on Bitcoin | `peginManager.signAndBroadcast()` | still `PENDING` until VP observes the tx |
| 4 | Sign payout authorisations | SDK service `pollAndSignPayouts()` (or vault-layer `signAndSubmitPayouts()`) | `PENDING` → `VERIFIED` |
| 5 | **Activate by revealing HTLC secret** | `activateVault()` | `VERIFIED` → `ACTIVE` |

Optional exit path if things go wrong or the activation window expires:
**Refund** via `buildAndBroadcastRefund()` (see [Refund](#refund-exit-path) below).

> **Wallet requirements:** BTC wallet needs sufficient UTXOs to cover the vault
> amount + network fees + the depositor-claim output. ETH wallet needs gas +
> the peg-in fee (queried from the contract per vault provider) and gas for
> activation.
>
> **Wait times:** Between steps 2 and 3 you usually wait 1 BTC confirmation
> before broadcasting to ensure VP can index it. Between 3 and 4 the VP
> prepares transaction graphs (minutes). Between 4 and 5 the contract moves to
> `VERIFIED` once all payout signatures are posted.

### Before you start — generate and persist an HTLC secret

Every vault is gated by an HTLC on Bitcoin. The **secret** is a 32-byte
random value you generate client-side. Its SHA-256 is the **hashlock** that
gets registered on Ethereum. You must **persist the secret** until activation
(step 5) — without it you cannot activate, and the vault will sit at
`VERIFIED` until it expires and needs a refund.

```typescript
import { computeHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Hex } from "viem";

// Node.js — use node:crypto
import { randomBytes } from "node:crypto";
const secret = `0x${randomBytes(32).toString("hex")}` as Hex;

// Browser — use the Web Crypto API
// const bytes = crypto.getRandomValues(new Uint8Array(32));
// const secret = `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")}` as Hex;

const hashlock = computeHashlock(secret); // 0x-prefixed bytes32

// Persist `secret` in your app storage. You will need it in step 5.
```

**Hex format rules (copy these, they're easy to trip over):**

| Value | Passed to | Format |
|-------|-----------|--------|
| `secret` | `activateVault()` | 0x-prefixed bytes32 (66 chars) |
| `hashlock` | `registerPeginOnChain()` | 0x-prefixed bytes32 (66 chars) |
| `hashlocks[i]` | `preparePegin()` | **no** 0x prefix, 64 hex chars |

The hashlock without the `0x` is what the Bitcoin HTLC commits to; the
`0x`-prefixed form is what the contract stores. They are the same bytes.

### Configuration

The `btcVaultRegistry` is the Ethereum smart contract that handles BTC vault registration, status tracking, and fees. The contract address is deployment-specific — obtain it from your deployment configuration or the [Babylon vault indexer API](https://github.com/babylonlabs-io/btc-vault).

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";

const peginManager = new PeginManager({
  btcNetwork: "signet", // Bitcoin network
  btcWallet, // Your BitcoinWallet implementation
  ethWallet, // viem WalletClient
  ethChain: sepolia, // viem Chain
  vaultContracts: {
    btcVaultRegistry: "0x...", // BTCVaultRegistry contract address
  },
  mempoolApiUrl: "https://mempool.space/signet/api",
});
```

> **Application selection:** The vault provider you choose determines which application your BTC vault is registered with (e.g., Aave). Each vault provider is bound to a specific application entry point on-chain. This cannot be changed after registration.

### End-to-end flow

```typescript
import { PeginManager } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  activateVault,
  computeHashlock,
  pollAndSignPayouts,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { VaultProviderRpcClient } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import type { Hex } from "viem";

// 0. Generate + persist the HTLC secret (see section above).
//    KEEP `secret` — you need it in phase 5. Losing it means you cannot
//    activate and must wait for the refund timelock.
const secret: Hex = /* ... */;
const hashlock = computeHashlock(secret);           // 0x-prefixed
const rawHashlock = stripHexPrefix(hashlock);       // 64 hex chars, no 0x

// 1. Prepare Pre-PegIn + PegIn transactions.
//    `amounts`/`hashlocks` are arrays — pass N entries to batch N vaults
//    into a single Pre-PegIn tx. Most users pass single-element arrays.
const result = await peginManager.preparePegin({
  amounts: [100_000n],                          // satoshis, one per vault
  hashlocks: [rawHashlock],                     // 64-char hex, no 0x, one per vault
  vaultProviderBtcPubkey: "abc123...",          // x-only pubkey, 64 hex chars
  vaultKeeperBtcPubkeys: ["def456..."],         // from on-chain contract
  universalChallengerBtcPubkeys: ["ghi789..."], // from on-chain contract
  timelockPegin: 100,                           // from offchain protocol params
  timelockRefund: 144,                          // from offchain protocol params
  protocolFeeRate: 2n,                          // from offchain protocol params
  mempoolFeeRate: 10,                           // current mempool sat/vB
  councilQuorum: 2,
  councilSize: 3,
  availableUTXOs,                               // your wallet's UTXOs
  changeAddress: "tb1q...",                     // your wallet's change address
});

const firstVault = result.perVault[0];

// 2. Register on Ethereum (generates PoP, submits to contract).
const { ethTxHash, vaultId, peginTxHash } = await peginManager.registerPeginOnChain({
  depositorBtcPubkey: "...",
  unsignedPrePeginTx: result.unsignedPrePeginTxHex,
  depositorSignedPeginTx: firstVault.peginTxHex,
  hashlock,                                     // 0x-prefixed bytes32 from step 0
  vaultProvider: "0x...",                       // VP Ethereum address
  depositorWotsPkHash: "0x...",                 // keccak256 of WOTS pubkey
  htlcVout: firstVault.htlcVout,
});
// Contract status: PENDING

// 3. Broadcast the Pre-PegIn tx to Bitcoin. The VP watches for this on-chain
//    before it can prepare payout transactions.
const btcTxid = await peginManager.signAndBroadcast({
  fundedPrePeginTxHex: result.fundedPrePeginTxHex,
  depositorBtcPubkey: "...",
});

// 4. Wait for the VP to prepare transactions, then sign and submit payout
//    authorisations. The SDK polls the VP, signs with your BitcoinWallet,
//    and posts the signatures back.
const vpClient = new VaultProviderRpcClient(vaultProviderProxyUrl);
await pollAndSignPayouts({
  statusReader: vpClient,
  presignClient: vpClient,
  btcWallet,
  peginTxid: stripHexPrefix(peginTxHash),
  depositorPk: stripHexPrefix(depositorBtcPubkey),
  signingContext: {
    /* vaultProviderBtcPubkey, vaultKeeperBtcPubkeys, universalChallengerBtcPubkeys,
       depositorBtcPubkey, timelockPegin, network, peginTxHex (from contract),
       registeredPayoutScriptPubKey (from PegInSubmitted event) */
  },
  onProgress: (completed, total) => console.log(`Signed ${completed}/${total}`),
});
// Contract status: VERIFIED

// 5. Activate — reveal the HTLC secret on Ethereum. This flips the vault to
//    ACTIVE and lets the VP claim the HTLC output on Bitcoin.
await activateVault({
  btcVaultRegistryAddress: "0x...",             // same contract address as config
  vaultId,                                      // from step 2
  secret,                                       // from step 0 — MUST be the same bytes
  hashlock,                                     // optional but recommended:
                                                //   SDK pre-validates sha256(secret)===hashlock
                                                //   client-side to avoid wasted gas
  writeContract: async (call) => {
    // Adapter: hand the SDK's call to your transport of choice.
    // In a Node.js / viem setup, this is typically a wrapper around
    // `walletClient.writeContract(call)` + `publicClient.waitForTransactionReceipt`.
    // See the `services/vault` adapter in babylon-toolkit for a production
    // reference implementation.
    const hash = await ethWallet.writeContract({
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      account: ethWallet.account,
      chain: ethWallet.chain,
    });
    return { transactionHash: hash };
  },
});
// Contract status: ACTIVE — vault is usable (e.g. as Aave collateral).
```

### What each phase returns

| Phase | Method / Service | Returns |
| ----- | ---------------- | ------- |
| 1 | `peginManager.preparePegin()` | `{ fundedPrePeginTxHex, prePeginTxid, unsignedPrePeginTxHex, perVault[], selectedUTXOs, fee, changeAmount }` — `perVault[i]` has `{ htlcVout, htlcValue, peginTxHex, peginTxid, peginInputSignature, vaultScriptPubKey }` |
| 2 | `peginManager.registerPeginOnChain()` | `{ ethTxHash, vaultId, peginTxHash, btcPopSignature }` |
| 3 | `peginManager.signAndBroadcast()` | `btcTxid` (string) |
| 4 | `pollAndSignPayouts()` (services/deposit) | `void` — side effect: signatures posted to VP, contract moves to `VERIFIED` |
| 5 | `activateVault()` (services/activation) | whatever `writeContract` returns (typically `{ transactionHash }`) |

### Refund — exit path

If something goes wrong — lost secret, VP never moves the vault to `VERIFIED`,
activation deadline expires — the depositor can reclaim the BTC locked in the
HTLC output via the refund path. The refund is time-locked: it only becomes
valid after `timelockRefund` Bitcoin blocks have passed since the Pre-PegIn
was confirmed.

```typescript
import {
  buildAndBroadcastRefund,
  BIP68NotMatureError,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

try {
  // Pre-fetch the mempool fee rate — passed in by value, not as a callback,
  // because it doesn't depend on anything the SDK computes.
  const { halfHourFee } = await getNetworkFees(mempoolApiUrl);

  const { txId } = await buildAndBroadcastRefund({
    vaultId,
    feeRate: halfHourFee,
    readVault: async (id) => {
      /* read hashlock, htlcVout, versions from the on-chain contract;
         read amount + unsignedPrePeginTxHex from the indexer.
         Return a VaultRefundData. */
    },
    readPrePeginContext: async (vault) => {
      /* resolve version-locked vault keepers + universal challengers +
         protocol params + vault-provider pubkey. Return a
         RefundPrePeginContext with sorted pubkey arrays. */
    },
    signPsbt: (psbtHex, opts) => btcWallet.signPsbt(psbtHex, opts),
    broadcastTx: async (hex) => ({
      txId: await /* push to mempool */,
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

See the `services/vault` package in `babylon-toolkit` for a production adapter
that wires these callbacks to on-chain readers + a mempool API.

---

## PayoutManager

Co-signs the Payout transactions used by all potential claimers. For more details, see the [transaction graph documentation](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md#2-transaction-graph-and-presigning).

### What It Does

**Used during phase 4 of the vault lifecycle.** After you broadcast the
Pre-PegIn tx to Bitcoin (phase 3), the vault provider observes it on-chain
and prepares claim/payout transactions. You then pre-sign those transactions
to authorise each potential claimer to move funds out of the vault in
response to a valid ZK proof; the VP collects the signatures and the
contract moves from `PENDING` to `VERIFIED`.

Most applications don't drive this manager directly — they call
`pollAndSignPayouts()` from
`@babylonlabs-io/ts-sdk/tbv/core/services`, which polls the VP, waits for
presign transactions, delegates per-claimer signing to `PayoutManager`, and
submits the bundle back. The `PayoutManager` API below is exposed for
callers who need to sign a single claimer's payout in isolation (e.g. a
test, or an out-of-band recovery flow).

**Important:** You are providing cryptographic authorization *upfront* —
these signatures let any authorised claimer later move BTC out of the
vault given a valid proof, as part of the
[vault's security model](https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md#2-transaction-graph-and-presigning).

### Configuration

```typescript
import { PayoutManager } from "@babylonlabs-io/ts-sdk/tbv/core";

const payoutManager = new PayoutManager({
  network: "signet",
  btcWallet, // Your BitcoinWallet implementation
});
```

### Methods

```typescript
// Sign Payout (challenge path via Assert tx)
const { signature } = await payoutManager.signPayoutTransaction({
  payoutTxHex: "...",
  peginTxHex: "...",
  assertTxHex: "...",              // Assert transaction (challenge path)
  depositorBtcPubkey: "...",
  vaultProviderBtcPubkey: "...",
  vaultKeeperBtcPubkeys: [...],
  universalChallengerBtcPubkeys: [...],
  registeredPayoutScriptPubKey: "0x...",  // From on-chain vault data
});
```

---

## Wallet Interfaces

Managers require wallet implementations. You provide these based on your app.

### BitcoinWallet

```typescript
interface BitcoinWallet {
  getPublicKeyHex(): Promise<string>; // x-only pubkey (64 hex chars) for Taproot
  getAddress(): Promise<string>;
  getNetwork(): Promise<BitcoinNetwork>; // "mainnet" | "testnet" | "signet"
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;
  // Batch signing with a single wallet interaction. Required by the
  // interface; if your underlying wallet only does one-at-a-time, implement
  // this as a sequential loop over signPsbt().
  signPsbts(
    psbtsHexes: string[],
    options?: SignPsbtOptions[],
  ): Promise<string[]>;
  signMessage(
    message: string,
    type: "bip322-simple" | "ecdsa",
  ): Promise<string>;
}
```

`SignPsbtOptions` lets you pass `autoFinalized`, `signInputs` (with
`disableTweakSigner` for taproot script-path spends), and caller-specific
metadata. It does **not** include `leafHash` — for script-path spending, the
SDK passes the right per-input options on your behalf; your wallet only needs
to honour `signInputs[].disableTweakSigner`.

#### Example — browser wallet adapter (Unisat / OKX / Xverse)

In production use `@babylonlabs-io/wallet-connector` (see `services/vault`
in `babylon-toolkit` for the reference integration). A minimal hand-rolled
adapter around Unisat's injected provider looks like this:

```typescript
const btcWallet: BitcoinWallet = {
  getPublicKeyHex: () => window.unisat.getPublicKey(),
  getAddress: async () => (await window.unisat.getAccounts())[0],
  getNetwork: async () => await window.unisat.getNetwork(),
  signPsbt: (psbtHex, options) => window.unisat.signPsbt(psbtHex, options),
  signPsbts: async (psbtsHexes, options) => {
    // Unisat supports batch signing; fall back to sequential if yours doesn't.
    if (typeof window.unisat.signPsbts === "function") {
      return window.unisat.signPsbts(psbtsHexes, options);
    }
    return Promise.all(
      psbtsHexes.map((hex, i) => window.unisat.signPsbt(hex, options?.[i])),
    );
  },
  signMessage: (msg, type) => window.unisat.signMessage(msg, type),
};
```

#### Example — Node.js wallet from a seed (per-input signing)

This sketch honours `SignPsbtOptions.signInputs[]` so it works for both
key-path inputs (tweaked) and script-path inputs like the refund leaf and
the HTLC spending PegIn input (untweaked — `disableTweakSigner: true`).
Copy-paste carefully; production backends should lean on a battle-tested
adapter instead.

```typescript
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { BIP32Factory } from "bip32";
import * as bip39 from "bip39";
import type {
  BitcoinWallet,
  SignInputOptions,
  SignPsbtOptions,
} from "@babylonlabs-io/ts-sdk/shared";

// You must have already called initEccLib(ecc) once at startup.
const bip32 = BIP32Factory(ecc);
const network = bitcoin.networks.testnet;

const seed = await bip39.mnemonicToSeed(process.env.BTC_MNEMONIC!);
const root = bip32.fromSeed(seed, network);
const node = root.derivePath("m/86'/1'/0'/0/0"); // BIP-86 taproot
const internalPubkey = node.publicKey.subarray(1, 33); // x-only 32 bytes
const { address } = bitcoin.payments.p2tr({ internalPubkey, network });

// Key used for key-path taproot spends.
const tweakedKey = node.tweak(
  bitcoin.crypto.taggedHash("TapTweak", internalPubkey),
);

const signPsbtImpl = async (
  psbtHex: string,
  options?: SignPsbtOptions,
): Promise<string> => {
  const psbt = bitcoin.Psbt.fromHex(psbtHex);

  const signOne = (input: SignInputOptions) => {
    // Script-path spends (refund leaf 1, PegIn HTLC leaf 0, etc.) pass
    // `disableTweakSigner: true` — use the raw BIP-32 node.
    const signer = input.disableTweakSigner ? node : tweakedKey;
    psbt.signInput(input.index, signer, input.sighashTypes);
  };

  if (options?.signInputs?.length) {
    // SDK told us exactly which inputs to sign and how. Respect it.
    for (const input of options.signInputs) {
      signOne(input);
    }
  } else {
    // No per-input options — assume key-path spend across all inputs.
    psbt.signAllInputs(tweakedKey);
  }

  // Wallet-connector adapters (and UniSat's native provider) default
  // `autoFinalized` to `true`; match that behaviour so the Node adapter
  // is interchangeable with the browser ones.
  if (options?.autoFinalized ?? true) {
    psbt.finalizeAllInputs();
  }
  return psbt.toHex();
};

const btcWallet: BitcoinWallet = {
  getPublicKeyHex: async () => Buffer.from(internalPubkey).toString("hex"),
  getAddress: async () => address!,
  getNetwork: async () => "testnet",
  signPsbt: (psbtHex, options) => signPsbtImpl(psbtHex, options),
  signPsbts: (psbtsHexes, options) =>
    Promise.all(psbtsHexes.map((hex, i) => signPsbtImpl(hex, options?.[i]))),
  signMessage: async () => {
    throw new Error("BIP-322 signing not implemented in this example");
  },
};
```

A production Node wallet would additionally handle: proof-of-possession
signing for `registerPeginOnChain` (returns a BIP-322-simple signature over
a canonical message), finalizer customisation per input type, and KMS/HSM
integration for key custody. See the `services/vault` package in
`babylon-toolkit` for the reference patterns.

### EthereumWallet

Uses viem's `WalletClient` directly.

#### Browser (React / dApp) — MetaMask via wagmi or viem

```typescript
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";

const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });

const ethWallet = createWalletClient({
  account,
  chain: sepolia,
  transport: custom(window.ethereum),
});
```

#### Node.js — from a private key

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const account = privateKeyToAccount(process.env.ETH_PRIVATE_KEY as `0x${string}`);

const ethWallet = createWalletClient({
  account,
  chain: sepolia,
  transport: http(process.env.ETH_RPC_URL),
});
```

The resulting `WalletClient` is fed to `PeginManager` and the
`writeContract` callback you hand to `activateVault()` — same API for
both platforms.

---

## Next Steps

- **[Primitives](./primitives.md)** - Low-level functions for custom implementations
- **[Aave Integration](../integrations/aave/README.md)** - Use BTC vaults as collateral
- **[API Reference](../api/managers.md)** - Complete function signatures
