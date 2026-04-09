<p align="center">
    <img
        alt="Babylon Logo"
        src="https://github.com/user-attachments/assets/dc74271e-90f1-44bd-9122-2b7438ab375c"
        width="100"
    />
    <h3 align="center">TBV Wallet Integration Guide</h3>
    <p align="center">Trustless Bitcoin Vaults — Wallet Partner Documentation</p>
</p>
<br/>

- [Overview](#overview)
- [For Wallets Already Supporting BTC Staking](#for-wallets-already-supporting-btc-staking)
- [Bitcoin Wallet Interface](#bitcoin-wallet-interface)
  - [SignPsbtOptions](#signpsbtoptions)
  - [Critical Requirements](#critical-requirements)
- [Ethereum Wallet Interface](#ethereum-wallet-interface)
- [Extended Provider Methods](#extended-provider-methods)
- [Vault Transaction Flow](#vault-transaction-flow)
- [Adapter Example](#adapter-example)
- [Testing](#testing)

## Overview

Babylon's Trustless Bitcoin Vaults (TBV) let users lock BTC on Bitcoin and receive vaultBTC on Ethereum for use as DeFi collateral (e.g., lending on Aave). Wallet partners integrating TBV must support **two chains**: a Bitcoin wallet for PSBT signing and message signing, and an Ethereum wallet for on-chain vault registration and DeFi operations.

## For Wallets Already Supporting BTC Staking

If your wallet already implements `IBTCProvider` for Babylon BTC staking, here's what's new for TBV:

- **`signPsbts()` is now critical** — TBV signs multiple PSBTs per deposit + payout pre-signing. Without batch signing, each PSBT requires a separate user approval.
- **`SignPsbtOptions` expanded** — New fields: `contracts`, `action` (required for Ledger policy derivation), `signInputs` with `disableTweakSigner` (required for Taproot script path spends).
- **Ethereum wallet required** — Staking was BTC-only. TBV requires an ETH wallet for on-chain registration and DeFi. Uses viem `WalletClient` — any EIP-1193/wagmi/WalletConnect wallet works.
- **No more BBN/Cosmos** — Staking used `IBBNProvider`. TBV replaces this with Ethereum.

| Aspect | TBV Vault | BTC Staking |
|--------|-----------|-------------|
| Bitcoin wallet interface | `BitcoinWallet` from `@babylonlabs-io/ts-sdk` | Same interface |
| Ethereum wallet | **Required** — viem `WalletClient` | Not required |
| Batch signing (`signPsbts`) | Critical — multiple PSBTs per deposit + payouts | Used for delegation |
| Message signing | `"bip322-simple"` for Proof-of-Possession | Same |
| Taproot script path | `disableTweakSigner: true` | Same |
| Chain requirement | **Dual-chain**: Bitcoin + Ethereum | Single-chain: Bitcoin + Babylon Genesis (Cosmos) |
| Signing prompts per deposit | 6+ (see [flow below](#vault-transaction-flow)) | Fewer — no ETH step, no payout pre-signing |

The rest of this document covers the full integration from scratch. Skip to [Vault Transaction Flow](#vault-transaction-flow) if your wallet already implements `IBTCProvider`.

## Bitcoin Wallet Interface

TBV uses the `BitcoinWallet` interface from `@babylonlabs-io/ts-sdk`. All six methods are required.

```ts
import type {
  BitcoinWallet,
  BitcoinNetwork,
  SignPsbtOptions,
  SignInputOptions,
} from "@babylonlabs-io/ts-sdk/shared";
```

The interface shape for reference:

```ts
type BitcoinNetwork = "mainnet" | "testnet" | "signet";

interface BitcoinWallet {
  /**
   * Returns the wallet's public key as a hex string.
   * For Taproot addresses, return the x-only public key
   * (32 bytes = 64 hex characters, no 0x prefix).
   * Compressed public keys (33 bytes = 66 hex chars) are also
   * accepted — the SDK strips the first byte internally.
   */
  getPublicKeyHex(): Promise<string>;

  /**
   * Returns the wallet's current Bitcoin address.
   */
  getAddress(): Promise<string>;

  /**
   * Signs a PSBT and returns the signed PSBT as hex.
   * @param psbtHex - The PSBT to sign in hex format
   * @param options - Optional signing parameters
   */
  signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string>;

  /**
   * Signs multiple PSBTs in a single wallet interaction.
   * This is critical for TBV UX — vault deposits and payout
   * pre-signing require multiple PSBTs.
   * @param psbtsHexes - Array of PSBTs to sign in hex format
   * @param options - Optional array of signing parameters for each PSBT
   */
  signPsbts(psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]>;

  /**
   * Signs a message for authentication or proof of ownership.
   * @param message - The message to sign
   * @param type - "bip322-simple" for BIP-322 or "ecdsa" for standard signatures
   * @returns Base64-encoded signature
   */
  signMessage(message: string, type: "bip322-simple" | "ecdsa"): Promise<string>;

  /**
   * Returns the Bitcoin network the wallet is connected to.
   */
  getNetwork(): Promise<BitcoinNetwork>;
}
```

### SignPsbtOptions

```ts
interface SignInputOptions {
  index: number;                // Input index to sign
  address?: string;             // Address for signing
  publicKey?: string;           // Public key (hex string)
  sighashTypes?: number[];      // Sighash types
  disableTweakSigner?: boolean; // Set true for Taproot script path spends
}

interface SignPsbtOptions {
  /** Whether to automatically finalize the PSBT after signing */
  autoFinalized?: boolean;
  /** Specific inputs to sign. If omitted, wallet signs all inputs it can. */
  signInputs?: SignInputOptions[];
  /** Contract context for the signing operation (required for Ledger) */
  contracts?: Array<{
    id: string;
    params: Record<string, string | number | string[] | number[]>;
  }>;
  /** Action metadata (required for Ledger) */
  action?: { name: string };
}
```

### Critical Requirements

**`signPsbts()` — Batch Signing**: TBV deposits require signing multiple PSBTs in a single user interaction (PegIn inputs per vault, payout pre-signing). Implementing `signPsbts` gives users a single signing prompt instead of one per PSBT. If your wallet does not support batch signing, the SDK falls back to calling `signPsbt()` sequentially — this works but results in more signing prompts.

**`signMessage()` — Type Parameter**: The `type` parameter is required. TBV uses `"bip322-simple"` for Proof-of-Possession signatures. Your wallet must route to the correct signing algorithm based on this parameter.

**`disableTweakSigner` — Taproot Script Path**: TBV vault transactions use Taproot **script path** spends. When `signInputs` contains `disableTweakSigner: true`, the wallet must sign with the **untweaked** private key (raw internal key), not the key-path-tweaked key. Signing with the tweaked key produces an invalid signature.

## Ethereum Wallet Interface

TBV does not define a custom Ethereum wallet interface. It uses **viem's `WalletClient`** directly. If your wallet supports any of the following, it works out of the box:

- EIP-1193 provider
- wagmi connector
- viem `WalletClient`

The key methods used by TBV are:

| Method | Purpose |
|--------|---------|
| `sendTransaction()` | Register vault on-chain, activate vault, DeFi operations |
| `switchChain()` | Ensure correct network before transactions |

Connection is handled via AppKit / WalletConnect. No `window.ethwallet` injection is required or supported.

## Extended Provider Methods

The full `IBTCProvider` interface (used by the wallet connector layer) includes additional methods beyond `BitcoinWallet`:

```ts
interface IBTCProvider extends IProvider {
  // ... all BitcoinWallet methods above, plus:

  /**
   * Registers an event listener for the specified event.
   * Supported events: "accountChanged"
   */
  on(eventName: string, callBack: () => void): void;

  /**
   * Unregisters an event listener for the specified event.
   */
  off(eventName: string, callBack: () => void): void;

  /**
   * Retrieves the inscriptions for the connected wallet.
   * Used for UTXO filtering.
   */
  getInscriptions(): Promise<InscriptionIdentifier[]>;

  /**
   * Gets the name of the wallet provider.
   */
  getWalletProviderName(): Promise<string>;

  /**
   * Gets the icon of the wallet provider.
   */
  getWalletProviderIcon(): Promise<string>;

  /**
   * Gets the version of the wallet provider (optional).
   */
  getVersion?(): Promise<string>;
}
```

Hardware wallets (Ledger) may no-op `on()`/`off()` — this is acceptable.

### Mobile Wallet Injection

For Bitcoin, inject into `window` before the dApp loads:

```ts
window.btcwallet = new BTCWalletImplementation();
```

For Ethereum, no injection is needed. ETH wallets connect via AppKit / WalletConnect (standard EIP-1193).

Full provider interface definitions are in [src/core/types.ts](../../babylon-wallet-connector/src/core/types.ts).

## Vault Transaction Flow

From the wallet's perspective, a deposit triggers these signing prompts in order:

### Step 1: Batch Sign PegIn Input PSBTs

**Method**: `signPsbts(psbtsHexes, options)`

The SDK constructs one PegIn input PSBT per vault in the deposit. All PSBTs are presented for batch signing. These are Taproot script path spends — `signInputs` will include `disableTweakSigner: true`.

### Step 2: Sign Proof-of-Possession

**Method**: `signMessage(message, "bip322-simple")`

A BIP-322 message proving the depositor owns the Bitcoin address. Signed once per deposit session — for multi-vault deposits, the first signature is reused for subsequent vaults.

### Step 3: Register Vaults on Ethereum

**Method**: ETH `sendTransaction()`

A single Ethereum transaction batch-registers all vaults in the deposit on the TBV smart contract with the signed PegIn data and PoP signature.

### Step 4: Sign Pre-PegIn Funding Transaction

**Method**: `signPsbt(psbtHex, options)`

After Ethereum registration succeeds, the Bitcoin funding transaction (Pre-PegIn) is signed and broadcast. This funds the PegIn address on Bitcoin.

### Step 5: Sign Payout Transactions

**Method**: `signPsbts(psbtsHexes, options)`

After Bitcoin confirmation, the wallet pre-signs payout transactions in two passes per vault:
1. **Claimer payout signing** — payout, no-payout, challenge-assert PSBTs per challenger
2. **Depositor-as-claimer presigning** — depositor graph PSBTs

These signatures are stored by the vault provider and used if a payout event occurs later.

### Step 6: Activate Vault on Ethereum

**Method**: ETH `sendTransaction()`

After vault verification completes (~12 min), the wallet sends an `activateVaultWithSecret` transaction per vault to finalize activation.

### Summary

| Step | Method | Prompts | Notes |
|------|--------|---------|-------|
| 1 | `signPsbts()` | 1 | N PSBTs (one per vault), Taproot script path |
| 2 | `signMessage()` | 1 | BIP-322, reused across vaults |
| 3 | ETH `sendTransaction()` | 1 | Batch registration for all vaults |
| 4 | `signPsbt()` | 1 | Funds the PegIn address |
| 5 | `signPsbts()` | N | Two signing passes per vault (payouts + depositor graph) |
| 6 | ETH `sendTransaction()` | N | Activate each vault after verification |

## Adapter Example

Minimal adapter wrapping a wallet to implement `BitcoinWallet`:

```ts
import type { BitcoinWallet, BitcoinNetwork, SignPsbtOptions } from "@babylonlabs-io/ts-sdk/shared";

class MyWalletAdapter implements BitcoinWallet {
  constructor(private provider: MyWalletProvider) {}

  async getPublicKeyHex(): Promise<string> {
    const pubkey = await this.provider.getPublicKey();
    // Strip prefix byte if compressed (66 → 64 chars)
    return pubkey.length === 66 ? pubkey.slice(2) : pubkey;
  }

  async getAddress(): Promise<string> {
    return await this.provider.getAddress();
  }

  async signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string> {
    return await this.provider.signPsbt(psbtHex, {
      autoFinalized: options?.autoFinalized,
      signInputs: options?.signInputs?.map((input) => ({
        index: input.index,
        // Critical: pass disableTweakSigner for Taproot script path
        disableTweakSigner: input.disableTweakSigner,
        sighashTypes: input.sighashTypes,
      })),
    });
  }

  async signPsbts(psbtsHexes: string[], options?: SignPsbtOptions[]): Promise<string[]> {
    // Native batch signing (single user prompt)
    return await this.provider.signPsbts(
      psbtsHexes,
      options?.map((opt) => ({
        autoFinalized: opt.autoFinalized,
        signInputs: opt.signInputs?.map((input) => ({
          index: input.index,
          disableTweakSigner: input.disableTweakSigner,
          sighashTypes: input.sighashTypes,
        })),
      })),
    );
  }

  async signMessage(message: string, type: "bip322-simple" | "ecdsa"): Promise<string> {
    if (type === "bip322-simple") {
      return await this.provider.signBip322(message);
    }
    return await this.provider.signEcdsa(message);
  }

  async getNetwork(): Promise<BitcoinNetwork> {
    const network = await this.provider.getNetwork();
    const map: Record<string, BitcoinNetwork> = {
      livenet: "mainnet",
      mainnet: "mainnet",
      testnet: "testnet",
      signet: "signet",
    };
    const result = map[network];
    if (!result) throw new Error(`Unsupported network: ${network}`);
    return result;
  }
}
```

### Ethereum Side

No adapter needed if your wallet supports EIP-1193:

```ts
import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";

const ethWallet = createWalletClient({
  chain: mainnet,
  transport: custom(window.myWallet.ethereumProvider),
});

// Or connect via WalletConnect — the TBV app handles
// connection via AppKit, no code changes needed.
```

## Testing

1. **Signet environment** — TBV provides a signet deployment for testing. Contact the Babylon team for access.
2. **Key checks**:
   - `getPublicKeyHex()` returns 64-char hex (x-only, no prefix)
   - `signPsbt()` with `disableTweakSigner: true` signs using the untweaked key
   - `signPsbts()` handles arrays of 5–20 PSBTs without timeout
   - `signMessage("test", "bip322-simple")` returns a valid BIP-322 signature
   - Ethereum `sendTransaction()` works for contract interactions (not just transfers)
3. **Mock wallet** — the SDK provides `MockBitcoinWallet` for unit testing:
   ```ts
   import { MockBitcoinWallet } from "@babylonlabs-io/ts-sdk/testing";
   ```

## Source Code References

| Component | Path |
|-----------|------|
| `BitcoinWallet` interface | `packages/babylon-ts-sdk/src/shared/wallets/interfaces/BitcoinWallet.ts` |
| `IBTCProvider` interface | `packages/babylon-wallet-connector/src/core/types.ts` |
| `IETHProvider` interface | `packages/babylon-wallet-connector/src/core/types.ts` |
| PeginManager (tx flow) | `packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts` |
| PayoutManager (payout signing) | `packages/babylon-ts-sdk/src/tbv/core/managers/PayoutManager.ts` |
| Unisat provider (reference impl) | `packages/babylon-wallet-connector/src/core/wallets/btc/unisat/provider.ts` |
