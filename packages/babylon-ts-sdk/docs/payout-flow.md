# Payout Signing Flow

When a vault provider requests a payout, the depositor must sign to authorize it.

## Overview

The payout signing flow involves:

1. **Create payout script** using `createPayoutScript()` (optional, for inspection)
2. **Build payout PSBT** using `buildPayoutPsbt()`
3. **Sign** the PSBT via your wallet
4. **Extract signature** using `extractPayoutSignature()`
5. **Submit signature** to the vault provider

## Step 1: Create Payout Script (Optional)

You can inspect the payout script before building the PSBT:

```typescript
import { createPayoutScript } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const payoutScriptInfo = await createPayoutScript({
  depositor: 'a1b2c3d4e5f6...',
  vaultProvider: 'b2c3d4e5f6a1...',
  liquidators: ['c3d4e5f6a1b2...'],
  network: 'testnet',
});

console.log('Payout script:', payoutScriptInfo.payoutScript);
console.log('P2TR address:', payoutScriptInfo.address);
```

## Step 2: Build Payout PSBT

Use `buildPayoutPsbt()` to create a PSBT for signing:

```typescript
import { buildPayoutPsbt } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const payoutPsbt = await buildPayoutPsbt({
  payoutTxHex: '0200000001...',
  peginTxHex: '0200000001...',
  claimTxHex: '0200000001...',
  depositorBtcPubkey: 'a1b2c3d4e5f6...',
  vaultProviderBtcPubkey: 'b2c3d4e5f6a1...',
  liquidatorBtcPubkeys: ['c3d4e5f6a1b2...'],
  network: 'testnet',
});

console.log('PSBT ready for signing:', payoutPsbt.psbtHex);
```

> **Note:** The `claimTxHex` is obtained from the Vault Provider RPC API when requesting payout transaction pairs.

## Step 3: Sign the PSBT

Sign the payout PSBT using your wallet:

```typescript
const signedPsbtHex = await wallet.signPsbt(payoutPsbt.psbtHex, {
  inputsToSign: [{ index: 0 }],
});
```

## Step 4: Extract the Signature

After signing, extract the 64-byte Schnorr signature:

```typescript
import { extractPayoutSignature } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

const signature = extractPayoutSignature(signedPsbtHex, 'a1b2c3d4e5f6...');

console.log('Signature (128 hex chars):', signature);
```

## Step 5: Submit Signature to Vault Provider

Send the extracted signature to the vault provider:

```typescript
await vaultProviderRpc.submitPayoutSignature({
  vaultId: '0x...',
  payoutTxHash: '0x...',
  signature: signature,
});
```

## Complete Example

```typescript
import {
  buildPayoutPsbt,
  extractPayoutSignature,
} from '@babylonlabs-io/ts-sdk/tbv/core/primitives';

async function signPayoutTransaction(params: {
  payoutTxHex: string;
  peginTxHex: string;
  claimTxHex: string;
  depositorBtcPubkey: string;
  vaultProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
  network: 'bitcoin' | 'testnet';
  wallet: { signPsbt: (hex: string) => Promise<string> };
}): Promise<string> {
  const payoutPsbt = await buildPayoutPsbt({
    payoutTxHex: params.payoutTxHex,
    peginTxHex: params.peginTxHex,
    claimTxHex: params.claimTxHex,
    depositorBtcPubkey: params.depositorBtcPubkey,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    liquidatorBtcPubkeys: params.liquidatorBtcPubkeys,
    network: params.network,
  });

  const signedPsbtHex = await params.wallet.signPsbt(payoutPsbt.psbtHex);

  const signature = extractPayoutSignature(
    signedPsbtHex,
    params.depositorBtcPubkey,
  );

  return signature;
}
```

