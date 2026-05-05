# Wallet Interfaces Guide

How to adapt a Bitcoin or Ethereum wallet to the SDK's expected interfaces. If you just want the type signatures, see the [wallets API reference](../api/wallets.md).

## The two interfaces

The SDK accepts:

- **Bitcoin**: any object that implements the [`BitcoinWallet`](../api/wallets.md#bitcoinwallet) interface.
- **Ethereum**: viem's [`WalletClient`](https://viem.sh/docs/clients/wallet.html) directly — no separate ETH abstraction.

```typescript
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { WalletClient } from "viem";
```

For mocks and tests, use `MockBitcoinWallet` and `MockEthereumWallet` from `@babylonlabs-io/ts-sdk/testing`.

## Browser wallets

In production, prefer [`@babylonlabs-io/wallet-connector`](https://www.npmjs.com/package/@babylonlabs-io/wallet-connector) — it handles the full matrix of BTC wallets (Unisat, OKX, Xverse, Leather, Keystone, OneKey) plus account-change events and network detection.

For illustration, here's a minimal adapter shape. `injectedWallet` below is a placeholder for whatever injected provider your target wallet exposes (e.g. `window.unisat`, `window.okxwallet.bitcoin`, `window.XverseProviders.BitcoinProvider`). Check each wallet's docs for its actual method signatures — some of them pass options as an object rather than the positional shape the SDK's `BitcoinWallet` interface uses, so the adapter may need to massage arguments.

```typescript
import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "@babylonlabs-io/ts-sdk/shared";

declare const injectedWallet: {
  getPublicKey(): Promise<string>;
  getAccounts(): Promise<string[]>;
  getNetwork(): Promise<"mainnet" | "testnet" | "signet">;
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;
  signPsbts?(psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]>;
  signMessage(msg: string, type: "bip322-simple" | "ecdsa"): Promise<string>;
};

const btcWallet: BitcoinWallet = {
  getPublicKeyHex: () => injectedWallet.getPublicKey(),
  getAddress: async () => (await injectedWallet.getAccounts())[0],
  getNetwork: () => injectedWallet.getNetwork(),
  signPsbt: (psbtHex, options) => injectedWallet.signPsbt(psbtHex, options),
  signPsbts: async (psbtsHexes, options) => {
    // If the underlying wallet supports batch signing, use it for a single
    // user-facing prompt; otherwise fall back to sequential signPsbt calls.
    if (typeof injectedWallet.signPsbts === "function") {
      return injectedWallet.signPsbts(psbtsHexes, options);
    }
    return Promise.all(
      psbtsHexes.map((hex, i) => injectedWallet.signPsbt(hex, options?.[i])),
    );
  },
  signMessage: (msg, type) => injectedWallet.signMessage(msg, type),
};
```

For Ethereum in the browser, build a viem `WalletClient` normally:

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

## Node.js wallet from a seed

Honour `SignPsbtOptions.signInputs[]` — the SDK uses per-input options so the same wallet works for key-path inputs (tweaked) and script-path inputs like the refund leaf or the PegIn HTLC input (untweaked, `useTweakedSigner: false`).

```typescript
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { BIP32Factory } from "bip32";
import type {
  BitcoinWallet,
  SignInputOptions,
  SignPsbtOptions,
} from "@babylonlabs-io/ts-sdk/shared";

// initEccLib(ecc) must have been called once at startup — see Get Started.
const bip32 = BIP32Factory(ecc);
const network = bitcoin.networks.testnet;

// Supply a 64-byte seed from your KMS, HSM, env-injected raw bytes,
// or any other source you control. `BTC_SEED_HEX` here is a placeholder.
const seed = Buffer.from(process.env.BTC_SEED_HEX!, "hex");
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
    // Script-path spends (refund leaf 1, PegIn HTLC leaf 0) pass
    // `useTweakedSigner: false` — use the raw BIP-32 node.
    const signer = input.useTweakedSigner === false ? node : tweakedKey;
    psbt.signInput(input.index, signer, input.sighashTypes);
  };

  if (options?.signInputs?.length) {
    for (const input of options.signInputs) {
      signOne(input);
    }
  } else {
    // No per-input options — assume key-path spend across all inputs.
    psbt.signAllInputs(tweakedKey);
  }

  // Match the browser default: `autoFinalized` is true unless the caller
  // explicitly opts out.
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

Ethereum in Node.js:

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

A production Node wallet additionally handles:

- **BIP-322 proof-of-possession** for `signProofOfPossession()` / `registerPeginOnChain()` (the SDK's `PeginManager` calls `signMessage(..., "bip322-simple")` over a canonical message).
- **Finalizer customisation per input type** when integrating with hardware signers that don't emit a standard witness.
- **KMS/HSM key custody** — wrap your cloud signer behind the same `signPsbt` / `signPsbts` / `signMessage` shape.

See `services/vault` in the [babylon-toolkit monorepo](https://github.com/babylonlabs-io/babylon-toolkit) for the production reference.

## Testing

```typescript
import {
  MockBitcoinWallet,
  MockEthereumWallet,
} from "@babylonlabs-io/ts-sdk/testing";

const btcWallet = new MockBitcoinWallet({
  address: "tb1pCustomTestAddress",
  network: "signet",
});

const ethWallet = new MockEthereumWallet({ chainId: 11155111 }); // sepolia
```

## Wallet-derived secrets: `deriveContextHash`

`BitcoinWallet.deriveContextHash(appName, context)` is the canonical entrypoint for any wallet-bound secret in the vault flow. The wallet derives a deterministic 32-byte value from its key material + app name + application context per the [`derive-context-hash.md`](../../../../docs/specs/derive-context-hash.md) spec; any conforming wallet returns the same output for the same inputs, so secrets are re-derivable on demand instead of generated and persisted in the browser.

Vault flows do not call `deriveContextHash` directly. Use the per-purpose helpers in `tbv/core/vault-secrets`, each of which forwards a single `deriveContextHash` call to the wallet with a distinct `appName` label. Per-purpose isolation is the security property: a single phishing approval can compromise at most one secret type — never all three at once.

### Per-purpose helpers

Three helpers, one per Babylon BTC vault secret type:

| Helper | `appName` label | Returns | Scope |
|---|---|---|---|
| `deriveAuthAnchor(wallet, ctx)` | `"babylon-btc-vault-auth"` | 32 bytes | per Pre-PegIn |
| `deriveHashlockSecret(wallet, ctx, htlcVout)` | `"babylon-btc-vault-hashlock"` | 32 bytes | per BTC vault |
| `deriveWotsSeed(wallet, ctx, htlcVout)` | `"babylon-btc-vault-wots"` | 64 bytes | per BTC vault |

`deriveWotsSeed` makes **one** wallet call. The 32-byte wallet output is treated as a PRK and stretched to the 64 bytes `babe::wots` requires via HKDF-Expand-SHA-256 (info string `"babylon-btc-vault-wots-seed"`). The expansion is contained to the WOTS purpose label — auth and hashlock material is not derivable from it. Per-purpose isolation across secret types is preserved.

### Example: WOTS key derivation

```typescript
import {
  deriveAuthAnchor,
  deriveHashlockSecret,
  deriveWotsSeed,
  deriveWotsBlocksFromSeed,
  computeWotsBlockPublicKeysHash,
  hexToUint8Array,
  type FundingOutpoint,
} from "@babylonlabs-io/ts-sdk/tbv/core";

// 1. Build vaultContext from the depositor pubkey + the UTXOs the
//    pre-pegin will spend. These uniquely identify the deposit.
const fundingOutpoints: FundingOutpoint[] = selectedUTXOs.map((u) => ({
  txid: hexToUint8Array(u.txid), // display-order bytes
  vout: u.vout,
}));
const ctx = {
  depositorBtcPubkey: hexToUint8Array(depositorBtcPubkeyHex),
  fundingOutpoints,
};

// 2. Derive the 64-byte WOTS seed for this vault. One wallet popup
//    (`babylon-btc-vault-wots`); the SDK HKDF-Expands the 32-byte
//    wallet output to 64 bytes. Per-vault uniqueness via htlcVout in
//    the wallet context.
const seed = await deriveWotsSeed(btcWallet, ctx, htlcVout);
try {
  const wotsPublicKeys = await deriveWotsBlocksFromSeed(seed);
  // 3. keccak256 hash → committed on-chain as `depositorWotsPkHash`.
  const wotsPkHash = computeWotsBlockPublicKeysHash(wotsPublicKeys);
} finally {
  seed.fill(0);
}

// Other secrets — each is a separate wallet popup.
const hashlockSecret = await deriveHashlockSecret(btcWallet, ctx, htlcVout); // 32 bytes
const authAnchor = await deriveAuthAnchor(btcWallet, ctx); // 32 bytes
```

**Determinism guarantee.** Same wallet + same `(depositorBtcPubkey, fundingOutpoints, htlcVout)` always produces the same secrets. This is what lets the resume flow re-derive on demand without persisting — re-build `ctx` (e.g. by parsing the pre-pegin tx inputs) and call the same helper again.

**Per-vault uniqueness.** `htlcVout` is appended to the wallet context for `deriveHashlockSecret` and `deriveWotsSeed`. Two vaults in the same Pre-PegIn get distinct contexts → distinct secrets.

**Capability check.** Wallets that don't implement the spec throw `WALLET_METHOD_NOT_SUPPORTED` (or equivalent) from `deriveContextHash`. Branch on this if you need a fallback path.

**UX cost.** A single-vault deposit takes 4 derive popups (1 auth + 1 hashlock + 2 wots-halves). A 3-vault batch takes 10 (1 + 3 + 6). The popup count grows linearly with vault count; the per-purpose isolation is the trade.

**Reference.** [`derive-context-hash.md`](../../../../docs/specs/derive-context-hash.md) — wallet-side spec.

## See also

- [Wallets API reference](../api/wallets.md) — full type signatures
- [Get Started](../get-started/README.md) — where wallets fit in the SDK layers
- [Managers Quickstart](../quickstart/managers.md) — end-to-end flow consuming these interfaces
