# Peg-in Flow

This guide walks through creating a peg-in transaction step by step.

## Overview

The peg-in flow deposits BTC into a vault. The process involves:

1. **Build the unsigned transaction** using `buildPeginPsbt()`
2. **Fund the transaction** by adding UTXOs and calculating fees
3. **Sign** the transaction via your wallet
4. **Broadcast** to the Bitcoin network

## Step 1: Build Unsigned Peg-in Transaction

Use `buildPeginPsbt()` to create the vault output. This returns an **unfunded** transaction with one output (the vault address).

```typescript
import { buildPeginPsbt } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const peginResult = await buildPeginPsbt({
  depositorPubkey: 'a1b2c3d4e5f6...',
  claimerPubkey: 'b2c3d4e5f6a1...',
  challengerPubkeys: ['c3d4e5f6a1b2...'],
  pegInAmount: 100000n,
  network: 'testnet',
});

console.log('Vault address:', peginResult.vaultScriptPubKey);
console.log('Unfunded tx hex:', peginResult.psbtHex);
```

> **Note:** The returned transaction has no inputs. You must add inputs (UTXOs) to fund it.

## Step 2: Fund the Transaction

The unfunded transaction needs to be funded with UTXOs:

- Select UTXOs that cover `pegInAmount + fees`
- Add inputs to the transaction
- Add a change output if needed

```typescript
import { Psbt, Transaction, networks } from 'bitcoinjs-lib';

const unfundedTx = Transaction.fromHex(peginResult.psbtHex);
const psbt = new Psbt({ network: networks.testnet });

const fundingUtxo = {
  txid: 'abc123...',
  vout: 0,
  value: 150000n,
  scriptPubKey: '0014...',
};

psbt.addInput({
  hash: fundingUtxo.txid,
  index: fundingUtxo.vout,
  witnessUtxo: {
    script: Buffer.from(fundingUtxo.scriptPubKey, 'hex'),
    value: Number(fundingUtxo.value),
  },
});

psbt.addOutput({
  script: Buffer.from(peginResult.vaultScriptPubKey, 'hex'),
  value: Number(peginResult.vaultValue),
});

const fee = 1000n;
const change = fundingUtxo.value - peginResult.vaultValue - fee;

if (change > 546n) {
  psbt.addOutput({
    address: 'tb1q...',
    value: Number(change),
  });
}
```

## Step 3: Sign the Transaction

Sign the PSBT using your wallet or signing method:

```typescript
const signedPsbtHex = await wallet.signPsbt(psbt.toHex());
```

## Step 4: Broadcast to Bitcoin Network

Extract the final transaction and broadcast it:

```typescript
const signedPsbt = Psbt.fromHex(signedPsbtHex);
const finalTx = signedPsbt.extractTransaction();
const txHex = finalTx.toHex();
const txid = finalTx.getId();

const response = await fetch('https://mempool.space/testnet/api/tx', {
  method: 'POST',
  body: txHex,
});

console.log('Transaction broadcast! TXID:', txid);
```

## Complete Example

```typescript
import { buildPeginPsbt } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';
import { Psbt, Transaction, networks } from 'bitcoinjs-lib';

async function createPeginTransaction(params: {
  depositorPubkey: string;
  claimerPubkey: string;
  challengerPubkeys: string[];
  pegInAmount: bigint;
  fundingUtxo: {
    txid: string;
    vout: number;
    value: bigint;
    scriptPubKey: string;
  };
  changeAddress: string;
  network: 'bitcoin' | 'testnet';
}) {
  const peginResult = await buildPeginPsbt({
    depositorPubkey: params.depositorPubkey,
    claimerPubkey: params.claimerPubkey,
    challengerPubkeys: params.challengerPubkeys,
    pegInAmount: params.pegInAmount,
    network: params.network,
  });

  const btcNetwork = params.network === 'bitcoin' 
    ? networks.bitcoin 
    : networks.testnet;
    
  const psbt = new Psbt({ network: btcNetwork });

  psbt.addInput({
    hash: params.fundingUtxo.txid,
    index: params.fundingUtxo.vout,
    witnessUtxo: {
      script: Buffer.from(params.fundingUtxo.scriptPubKey, 'hex'),
      value: Number(params.fundingUtxo.value),
    },
  });

  psbt.addOutput({
    script: Buffer.from(peginResult.vaultScriptPubKey, 'hex'),
    value: Number(peginResult.vaultValue),
  });

  const fee = 1000n;
  const change = params.fundingUtxo.value - params.pegInAmount - fee;
  
  if (change > 546n) {
    psbt.addOutput({
      address: params.changeAddress,
      value: Number(change),
    });
  }

  return {
    psbtHex: psbt.toHex(),
    vaultScriptPubKey: peginResult.vaultScriptPubKey,
    vaultValue: peginResult.vaultValue,
  };
}
```

