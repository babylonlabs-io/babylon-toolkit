# Babylon TBV TypeScript SDK – Technical Reference

API and type reference for the TBV TypeScript SDK primitives.

---

## Table of Contents
1. Functions
   - buildPeginPsbt
   - buildPayoutPsbt
   - extractPayoutSignature
   - createPayoutScript
2. Utilities
   - stripHexPrefix, toXOnly, processPublicKeyToXOnly
   - hexToUint8Array, uint8ArrayToHex, isValidHex
3. Types
   - PeginParams, PeginPsbtResult
   - PayoutParams, PayoutPsbtResult
   - PayoutScriptParams, PayoutScriptResult
   - Network

---

## 1) Functions

### buildPeginPsbt(params: PeginParams) → Promise<PeginPsbtResult>
Builds an unfunded peg-in transaction with one BTC Vault output.

Parameters:
- `depositorPubkey` (`string`): Depositor x-only pubkey (64 hex).
- `claimerPubkey` (`string`): Vault keeper x-only pubkey (claimer).
- `challengerPubkeys` (`string[]`): Vault keeper x-only pubkeys (challengers).
- `pegInAmount` (`bigint`): Amount to deposit in satoshis.
- `network` (`Network`): `"bitcoin" | "testnet" | "regtest" | "signet"`.

Returns:
- `psbtHex` (`string`): Unfunded tx hex (no inputs; named `psbtHex` in API).
- `txid` (`string`): Transaction ID (changes after funding/signing).
- `vaultScriptPubKey` (`string`): Vault output script pubkey (hex).
- `vaultValue` (`bigint`): Vault output value in sats.

Notes:
- Add inputs + change, then create/sign a PSBT to broadcast.

---

### buildPayoutPsbt(params: PayoutParams) → Promise<PayoutPsbtResult>
Builds an unsigned payout PSBT for the depositor to sign.

Parameters:
- `payoutTxHex` (`string`): Unsigned payout tx hex (from vault keeper).
- `peginTxHex` (`string`): Peg-in transaction hex.
- `claimTxHex` (`string`): Claim transaction hex (from vault keeper).
- `depositorBtcPubkey` (`string`): Depositor x-only pubkey.
- `vaultProviderBtcPubkey` (`string`): Vault provider (user-elected keeper) x-only pubkey.
- `liquidatorBtcPubkeys` (`string[]`): Liquidator (app-elected keeper) x-only pubkeys.
- `network` (`Network`): Bitcoin network.

Returns:
- `psbtHex` (`string`): Unsigned PSBT hex ready for depositor signing.

Notes:
- Single input (index 0) corresponds to the BTC Vault UTXO; sign that input.

---

### extractPayoutSignature(signedPsbtHex: string, depositorPubkey: string) → string
Extracts a 64-byte Schnorr signature (128 hex chars) from a signed payout PSBT.

Parameters:
- `signedPsbtHex` (`string`): Signed PSBT hex.
- `depositorPubkey` (`string`): Depositor x-only pubkey.

Returns:
- `string`: Schnorr signature (128 hex chars, no sighash byte).

---

### createPayoutScript(params: PayoutScriptParams) → Promise<PayoutScriptResult>
Creates payout script and taproot data.

Parameters:
- `depositor` (`string`): Depositor x-only pubkey.
- `vaultProvider` (`string`): Vault provider (user-elected keeper) x-only pubkey.
- `liquidators` (`string[]`): Liquidator (app-elected keeper) x-only pubkeys.
- `network` (`Network`): Bitcoin network.

Returns:
- `payoutScript` (`string`): Full payout script (hex).
- `taprootScriptHash` (`string`): Taproot script hash.
- `scriptPubKey` (`string`): Output script pubkey (hex).
- `address` (`string`): P2TR Bitcoin address.

---

## 2) Utilities

- `stripHexPrefix(hex: string): string`
- `toXOnly(pubKey: Uint8Array): Uint8Array`
- `processPublicKeyToXOnly(publicKeyHex: string): string`
- `hexToUint8Array(hex: string): Uint8Array`
- `uint8ArrayToHex(bytes: Uint8Array): string`
- `isValidHex(hex: string): boolean`

---

## 3) Types

### PeginParams
- `depositorPubkey: string`
- `claimerPubkey: string`
- `challengerPubkeys: string[]`
- `pegInAmount: bigint`
- `network: Network`

### PeginPsbtResult
- `psbtHex: string`
- `txid: string`
- `vaultScriptPubKey: string`
- `vaultValue: bigint`

### PayoutParams
- `payoutTxHex: string`
- `peginTxHex: string`
- `claimTxHex: string`
- `depositorBtcPubkey: string`
- `vaultProviderBtcPubkey: string`
- `liquidatorBtcPubkeys: string[]`
- `network: Network`

### PayoutPsbtResult
- `psbtHex: string`

### PayoutScriptParams
- `depositor: string`
- `vaultProvider: string`
- `liquidators: string[]`
- `network: Network`

### PayoutScriptResult
- `payoutScript: string`
- `taprootScriptHash: string`
- `scriptPubKey: string`
- `address: string`

### Network
- `"bitcoin" | "testnet" | "regtest" | "signet"`

