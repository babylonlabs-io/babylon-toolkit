# Babylon TBV TypeScript SDK Guide

End-to-end guide for using the Babylon Trustless BTC Vault (TBV) TypeScript
SDK. Focused on primitives (pure functions) with no wallet dependencies.


## 1) Introduction

The TBV TypeScript SDK provides pure, stateless functions to build Bitcoin
transactions and scripts for Babylon TBV. It wraps the Rust `babylon-tbv`
core via WASM and works in Node.js, browsers, and serverless environments.

When to use primitives (Level 1):
- Backend services with custom signing (KMS/HSM)
- Serverless functions
- Full control over transaction flow

When to use managers (Level 2):
- Frontend apps with wallet integration
- Faster integration with less code

### Architecture
```
┌───────────────────────────┐
│      Your Application     │
└─────────────┬─────────────┘
              │
   ┌──────────▼──────────┐
   │  Level 2: Managers  │  (wallet orchestration)
   └──────────┬──────────┘
              │
   ┌──────────▼──────────┐
   │  Level 1: Primitives│  (pure functions)
   └──────────┬──────────┘
              │
   ┌──────────▼──────────┐
   │   WASM (Rust core)  │  (btc-vault)
   └─────────────────────┘
```

---

## 2) Core Concepts

### Roles
- **Depositors**: Users who deposit BTC into TBV (collateral, backstop,
  future DeFi use cases).
- **Vault Keepers** (can claim or challenge):
  - **Universal Challengers**: Monitor all peg-out attempts across apps/users.
  - **Application-Elected Vault Keepers**: Claimers/challengers elected by
    a specific app (e.g., liquidators/arbitrageurs for a lending app).
  - **User-Elected Vault Keepers**: Third-party or self-hosted vault
    providers assisting specific users with peg-ins/outs and challenges.

### Flows
- **Peg-in**: Deposit BTC into TBV (build vault output, fund, sign,
  broadcast).
- **Peg-out / Payout**: Withdraw BTC from TBV (vault keeper prepares payout
  tx, depositor signs).

### Keys & Formats
- **X-only pubkey**: 32-byte Taproot format (64 hex chars, no 0x).
- **PSBT**: Partially Signed Bitcoin Transaction.
- **Network**: `"bitcoin" | "testnet" | "regtest" | "signet"`.

---

## 3) Installation

```bash
npm install @babylonlabs-io/ts-sdk
```

Imports:
```typescript
import {
  buildPeginPsbt,
  buildPayoutPsbt,
  extractPayoutSignature,
  createPayoutScript,
} from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
```

---

## 4) Quickstart

### Peg-in (build vault output)
```typescript
const pegin = await buildPeginPsbt({
  depositorPubkey: "a1b2...",
  claimerPubkey: "b2c3...",          // vault keeper who can claim
  challengerPubkeys: ["c3d4..."],    // vault keepers who can challenge
  pegInAmount: 100000n,
  network: "signet",
});

console.log(pegin.vaultScriptPubKey);
console.log(pegin.psbtHex); // unfunded tx hex, add inputs + change
```

### Payout signing (depositor)
```typescript
const payoutPsbt = await buildPayoutPsbt({
  payoutTxHex: "0200...",
  peginTxHex: pegin.psbtHex,          // or actual peg-in tx hex
  claimTxHex: "0200...",              // from vault keeper
  depositorBtcPubkey: "a1b2...",
  vaultProviderBtcPubkey: "b2c3...",  // user-elected vault keeper
  liquidatorBtcPubkeys: ["c3d4..."],  // app-elected vault keepers
  network: "signet",
});

const signedPsbtHex = await wallet.signPsbt(payoutPsbt.psbtHex, {
  inputsToSign: [{ index: 0 }],       // single input: BTC Vault UTXO
});

const signature = extractPayoutSignature(
  signedPsbtHex,
  "a1b2..."                            // depositor pubkey
);
```

---

## 5) Workflows

### Peg-in
1) **Build vault output**: `buildPeginPsbt()` → unfunded tx with vault
   output.
2) **Fund**: add UTXOs covering `pegInAmount + fees`; add change if needed.
3) **Sign**: create PSBT from funded tx; sign with wallet.
4) **Broadcast**: send final tx to Bitcoin network.

### Payout Signing
1) Vault keeper provides `payoutTxHex` and `claimTxHex`.
2) Build signable PSBT: `buildPayoutPsbt()`.
3) Sign input 0 (the vault UTXO) with depositor key.
4) Extract Schnorr sig: `extractPayoutSignature()`.
5) Submit signature to vault keeper.

---

## 6) Examples

Minimal peg-in → fund → sign:
```typescript
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { buildPeginPsbt } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";

async function buildAndFundPegin(params) {
  const pegin = await buildPeginPsbt({
    depositorPubkey: params.depositorPubkey,
    claimerPubkey: params.claimerPubkey,
    challengerPubkeys: params.challengerPubkeys,
    pegInAmount: params.pegInAmount,
    network: params.network,
  });

  const psbt = new Psbt({
    network:
      params.network === "bitcoin" ? networks.bitcoin : networks.signet,
  });

  psbt.addInput({
    hash: params.fundingUtxo.txid,
    index: params.fundingUtxo.vout,
    witnessUtxo: {
      script: Buffer.from(params.fundingUtxo.scriptPubKey, "hex"),
      value: Number(params.fundingUtxo.value),
    },
  });

  psbt.addOutput({
    script: Buffer.from(pegin.vaultScriptPubKey, "hex"),
    value: Number(pegin.vaultValue),
  });

  const fee = 1000n;
  const change = params.fundingUtxo.value - params.pegInAmount - fee;
  if (change > 546n) {
    psbt.addOutput({
      address: params.changeAddress,
      value: Number(change),
    });
  }

  return psbt.toHex();
}
```

---

## 7) Reference Links
- **API Reference**: `tbv-sdk-reference.md`

