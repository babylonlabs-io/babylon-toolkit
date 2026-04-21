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

Honour `SignPsbtOptions.signInputs[]` — the SDK uses per-input options so the same wallet works for key-path inputs (tweaked) and script-path inputs like the refund leaf or the PegIn HTLC input (untweaked, `disableTweakSigner: true`).

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

// initEccLib(ecc) must have been called once at startup — see Get Started.
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
    // Script-path spends (refund leaf 1, PegIn HTLC leaf 0) pass
    // `disableTweakSigner: true` — use the raw BIP-32 node.
    const signer = input.disableTweakSigner ? node : tweakedKey;
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

- **BIP-322 proof-of-possession** for `registerPeginOnChain()` (the SDK's `PeginManager` calls `signMessage(..., "bip322-simple")` over a canonical message).
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

## Roadmap: `deriveContextHash`

A new wallet API method, **`deriveContextHash(appName, context)`**, is spec'd and targeted for landing in the SDK and partner BTC wallets in the near term (not yet implemented). It's the single biggest upcoming change to how integrators handle secrets.

**What it does.** The wallet derives a deterministic 32-byte value from the wallet's key material + an app name + an application-provided context, using HKDF-SHA-256 on a dedicated BIP-32 path (`m/73681862'`). Any conforming wallet produces the same output for the same inputs, so applications get a wallet-bound secret they can re-derive on demand instead of generating one in the browser and persisting it.

**Why it matters for vault flows.** Today the Managers Quickstart warns that losing the HTLC secret between registration and activation strands the vault until refund. With `deriveContextHash`, the HTLC secret becomes a wallet derivation — you rebuild the context from on-chain state and re-derive the same secret at activation time. No browser-side generation, no persistence step, no recovery-path loss. The same primitive is also slated to replace the separate WOTS mnemonic currently managed out-of-band.

**Status.** The method is not yet on the `BitcoinWallet` interface. When it lands, expect:

```typescript
interface BitcoinWallet {
  // … existing methods …
  deriveContextHash?(appName: string, context: string): Promise<string>;
}
```

For now, keep generating + persisting the HTLC secret as shown in the Managers Quickstart. When `deriveContextHash` lands, the secret-generation step becomes a deterministic wallet call instead of a random-bytes-plus-storage pattern, and vault apps can stop managing the Lamport mnemonic separately.

**Reference.** [deriveContextHash spec](../../../../docs/specs/derive-context-hash.md) — full algorithm, test vectors, and security notes.

## See also

- [Wallets API reference](../api/wallets.md) — full type signatures
- [Get Started](../get-started/README.md) — where wallets fit in the SDK layers
- [Managers Quickstart](../quickstart/managers.md) — end-to-end flow consuming these interfaces
