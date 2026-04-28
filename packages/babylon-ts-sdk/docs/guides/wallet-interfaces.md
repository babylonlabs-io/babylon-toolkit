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

Vault flows do not call `deriveContextHash` directly. Use the helpers in `tbv/core/vault-secrets`, which forward to the wallet with the canonical `appName` and `vaultContext` encoding.

### WOTS key derivation (canonical flow)

```typescript
import {
  deriveVaultRoot,
  expandWotsSeed,
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

// 2. One wallet popup per deposit. Returns 32 bytes of root entropy.
const root = await deriveVaultRoot(btcWallet, {
  depositorBtcPubkey: hexToUint8Array(depositorBtcPubkeyHex),
  fundingOutpoints,
});

try {
  // 3. Per vault: expand a 64-byte WOTS seed using htlcVout as the
  //    domain separator, then derive the 2 WOTS block public keys.
  const seed = expandWotsSeed(root, htlcVout);
  const wotsPublicKeys = await deriveWotsBlocksFromSeed(seed);

  // 4. keccak256 hash → committed on-chain as `depositorWotsPkHash`.
  const wotsPkHash = computeWotsBlockPublicKeysHash(wotsPublicKeys);
} finally {
  // Zero the root before it leaves scope.
  root.fill(0);
}
```

**Determinism guarantee.** Same wallet + same `(depositorBtcPubkey, fundingOutpoints, htlcVout)` always produces the same WOTS keys. This is what lets the resume flow re-derive the keys without persisting them — re-build `vaultContext` (e.g. by parsing the pre-pegin tx inputs) and call the same chain again.

**Per-vault uniqueness.** `htlcVout` is the per-vault domain separator inside `expandWotsSeed`. Two vaults in the same batch (same root) get cryptographically independent seeds.

**Capability check.** Wallets that don't implement the spec throw `WALLET_METHOD_NOT_SUPPORTED` (or equivalent) from `deriveContextHash`. Branch on this if you need a fallback path.

### Other vault secrets

The same root drives the other two domain-separated secrets via sibling expanders in the SDK:

```typescript
import {
  expandHashlockSecret,
  expandAuthAnchor,
} from "@babylonlabs-io/ts-sdk/tbv/core";

const hashlockSecret = expandHashlockSecret(root, htlcVout); // 32 bytes
const authAnchor = expandAuthAnchor(root); // 32 bytes
```

`expandHashlockSecret` replaces the previously browser-generated HTLC preimage; `expandAuthAnchor` produces the OP_RETURN preimage used for the VP bearer-token flow. Both follow the same canonical pipeline as WOTS — call `deriveVaultRoot` once, then expand per-purpose.

**Reference.** [`derive-vault-secrets.md`](../../../../docs/specs/derive-vault-secrets.md) — root-to-leaf algorithm and test vectors. [`derive-context-hash.md`](../../../../docs/specs/derive-context-hash.md) — wallet-side spec.

## See also

- [Wallets API reference](../api/wallets.md) — full type signatures
- [Get Started](../get-started/README.md) — where wallets fit in the SDK layers
- [Managers Quickstart](../quickstart/managers.md) — end-to-end flow consuming these interfaces
