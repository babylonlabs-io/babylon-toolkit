# Babylon TBV TypeScript SDK - Primitives

Pure functions for building Bitcoin transactions for Babylon Trustless BTC Vault (TBV).

This guide shows how to implement **Peg-in** and **Payout** flows using the primitives layer.

## Installation

```bash
npm install @babylonlabs-io/ts-sdk
```

## Setup

```typescript
import {
  buildPeginPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { Psbt, networks } from "bitcoinjs-lib";
```

## Quickstart

### Peg-in

Deposit BTC into a TBV vault.

`buildPeginPsbt()` returns:
- `vaultScriptPubKey` - The vault output script (use this to build the vault output)
- `vaultValue` - The vault output value in satoshis
- `psbtHex` - Unfunded transaction hex (0 inputs, 1 vault output)
- `txid` - Transaction ID (changes after funding)

**Your responsibility:** Fund the transaction with UTXOs, sign it, and broadcast.

```typescript
import { Psbt, networks } from "bitcoinjs-lib";
import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

// Network mapping
const NETWORK_MAP = {
  bitcoin: networks.bitcoin,
  testnet: networks.testnet,
  regtest: networks.testnet,
  signet: networks.testnet,
} as const;

const DUST_THRESHOLD = 546n;

async function pegin() {
  // Step 1: Build unfunded transaction with vault output
  const pegin = await buildPeginPsbt({
    depositorPubkey: "a1b2c3d4...",        // your x-only pubkey (64 hex chars)
    claimerPubkey: "e5f6a7b8...",          // vault provider pubkey
    challengerPubkeys: ["c9d0e1f2..."],    // liquidator pubkeys
    pegInAmount: 100000n,                  // satoshis
    network: "signet",
  });

  console.log("Vault script:", pegin.vaultScriptPubKey);
  console.log("Vault value:", pegin.vaultValue);

  // Step 2: Fund the transaction
  const psbt = new Psbt({ network: NETWORK_MAP["signet"] });

  // Add your funding UTXO as input
  psbt.addInput({
    hash: "your-utxo-txid",
    index: 0,
    witnessUtxo: {
      script: Buffer.from("your-utxo-script", "hex"),
      value: 200000, // your UTXO value
    },
  });

  // Add vault output
  psbt.addOutput({
    script: Buffer.from(pegin.vaultScriptPubKey, "hex"),
    value: Number(pegin.vaultValue),
  });

  // Add change output (if above dust threshold)
  const fee = 1000n;
  const change = 200000n - 100000n - fee;
  if (change > DUST_THRESHOLD) {
    psbt.addOutput({
      address: "your-change-address",
      value: Number(change),
    });
  }

  // Step 3: Sign with your wallet and broadcast
  const unsignedPsbtHex = psbt.toHex();
  // const signedPsbt = await yourWallet.signPsbt(unsignedPsbtHex);
  // const tx = Psbt.fromHex(signedPsbt).extractTransaction();
  // await broadcast(tx.toHex());
}
```

### Payout

Withdraw BTC from a TBV vault. The vault keeper initiates the payout, and you (the depositor) sign to approve it.

`buildPayoutPsbt()` returns:
- `psbtHex` - Unsigned PSBT ready for signing (input 0 is the vault UTXO)

`extractPayoutSignature()` returns:
- 64-byte Schnorr signature (128 hex chars) to submit to the vault keeper

**Your responsibility:** Sign input 0 with your signing mechanism, extract the signature, and submit to vault keeper.

```typescript
import {
  buildPayoutPsbt,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

async function payout() {
  // Step 1: Receive payout request from vault keeper
  const payoutTxHex = "...";  // from vault keeper
  const claimTxHex = "...";   // from vault keeper
  const peginTxHex = "...";   // your original peg-in transaction

  // Step 2: Build unsigned PSBT for signing
  const payoutPsbt = await buildPayoutPsbt({
    payoutTxHex,
    peginTxHex,
    claimTxHex,
    depositorBtcPubkey: "a1b2c3d4...",      // your x-only pubkey
    vaultProviderBtcPubkey: "e5f6a7b8...",  // vault provider pubkey
    liquidatorBtcPubkeys: ["c9d0e1f2..."],  // liquidator pubkeys
    network: "signet",
  });

  console.log("PSBT to sign:", payoutPsbt.psbtHex);

  // Step 3: Sign input 0 (the vault UTXO) with your wallet
  // const signedPsbtHex = await yourWallet.signPsbt(payoutPsbt.psbtHex);

  // Step 4: Extract signature and submit to vault keeper
  // const signature = extractPayoutSignature(signedPsbtHex, "a1b2c3d4...");
  // await submitToVaultKeeper(signature);
}
```
