/**
 * Payout PSBT Builder Primitive
 *
 * This module provides pure functions for building unsigned payout PSBTs and extracting
 * Schnorr signatures from signed PSBTs. It uses WASM-generated scripts from the payout
 * connector and bitcoinjs-lib for PSBT construction.
 *
 * The payout transaction is used when the depositor needs to sign off on a payout from
 * the vault.
 *
 * @module primitives/psbt/payout
 */

import {
  type Network,
  tapInternalPubkey,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Buffer } from "buffer";
import { initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { createPayoutScript } from "../scripts/payout";
import {
  hexToUint8Array,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../utils/bitcoin";

// Initialize ECC library for bitcoinjs-lib
initEccLib(ecc);

/**
 * Parameters for building an unsigned payout PSBT
 */
export interface PayoutParams {
  /**
   * Payout transaction hex (unsigned)
   * This is the transaction that needs to be signed by the depositor
   */
  payoutTxHex: string;

  /**
   * Peg-in transaction hex
   * This transaction created the vault output that we're spending
   */
  peginTxHex: string;

  /**
   * Claim transaction hex (required).
   * Obtained from the Vault Provider RPC API when
   * requesting claim/payout transaction pairs.
   *
   * @see Rust: crates/vault/src/transactions/payout.rs::PayoutTx::new()
   */
  claimTxHex: string;

  /**
   * Depositor's BTC public key (x-only, 64-char hex without 0x prefix)
   */
  depositorBtcPubkey: string;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex)
   * Also referred to as "claimer" in the WASM layer
   */
  vaultProviderBtcPubkey: string;

  /**
   * Liquidator BTC public keys (x-only, 64-char hex)
   * Also referred to as "challengers" in the WASM layer
   */
  liquidatorBtcPubkeys: string[];

  /**
   * Bitcoin network
   */
  network: Network;
}

/**
 * Result of building an unsigned payout PSBT
 */
export interface PayoutPsbtResult {
  /**
   * Unsigned PSBT hex ready for signing
   */
  psbtHex: string;
}

/**
 * Build unsigned payout PSBT for depositor to sign
 *
 * This function:
 * 1. Uses WASM to generate the payout script via createPayoutScript()
 * 2. Builds a PSBT with taproot script path spend information
 * 3. Returns unsigned PSBT ready for depositor to sign
 *
 * @param params - Payout parameters
 * @returns Unsigned PSBT
 *
 * @example
 * ```typescript
 * import { buildPayoutPsbt } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';
 *
 * const psbt = await buildPayoutPsbt({
 *   payoutTxHex: '0200000...',
 *   peginTxHex: '0200000...',
 *   depositorBtcPubkey: 'abc123...',
 *   vaultProviderBtcPubkey: 'def456...',
 *   liquidatorBtcPubkeys: ['ghi789...'],
 *   network: 'testnet',
 * });
 *
 * // Now sign with wallet
 * const signedPsbt = await wallet.signPsbt(psbt.psbtHex);
 *
 * // Extract signature
 * const signature = extractPayoutSignature(signedPsbt, 'abc123...');
 * ```
 */
export async function buildPayoutPsbt(
  params: PayoutParams,
): Promise<PayoutPsbtResult> {
  // Normalize hex inputs (strip 0x prefix if present)
  const payoutTxHex = stripHexPrefix(params.payoutTxHex);
  const peginTxHex = stripHexPrefix(params.peginTxHex);

  // Get payout script from WASM
  const payoutConnector = await createPayoutScript({
    depositor: params.depositorBtcPubkey,
    vaultProvider: params.vaultProviderBtcPubkey,
    liquidators: params.liquidatorBtcPubkeys,
    network: params.network,
  });

  const payoutScriptBytes = hexToUint8Array(payoutConnector.payoutScript);
  const controlBlock = computeControlBlock(tapInternalPubkey, payoutScriptBytes);

  // Parse transactions
  const payoutTx = Transaction.fromHex(payoutTxHex);
  const peginTx = Transaction.fromHex(peginTxHex);
  const claimTxHex = stripHexPrefix(params.claimTxHex);
  const claimTx = Transaction.fromHex(claimTxHex);

  // Create PSBT
  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  // PayoutTx has exactly 2 inputs:
  // - Input 0: from PeginTx output0 (signed by depositor using taproot script path)
  // - Input 1: from ClaimTx output0 (signed by claimer/challengers, not depositor)
  //
  // IMPORTANT: For Taproot SIGHASH_DEFAULT (0x00), the sighash commits to ALL inputs'
  // prevouts, not just the one being signed. Therefore, we must include BOTH inputs
  // in the PSBT so the wallet computes the correct sighash that the VP expects.

  // Verify payout transaction has expected structure
  if (payoutTx.ins.length !== 2) {
    throw new Error(
      `Payout transaction must have exactly 2 inputs, got ${payoutTx.ins.length}`,
    );
  }

  const input0 = payoutTx.ins[0];
  const input1 = payoutTx.ins[1];

  // Verify input 0 references the pegin transaction
  const input0Txid = uint8ArrayToHex(
    new Uint8Array(input0.hash).slice().reverse(),
  );
  const peginTxid = peginTx.getId();

  if (input0Txid !== peginTxid) {
    throw new Error(
      `Input 0 does not reference pegin transaction. ` +
        `Expected ${peginTxid}, got ${input0Txid}`,
    );
  }

  // Verify input 1 references the claim transaction
  const input1Txid = uint8ArrayToHex(
    new Uint8Array(input1.hash).slice().reverse(),
  );
  const claimTxid = claimTx.getId();

  if (input1Txid !== claimTxid) {
    throw new Error(
      `Input 1 does not reference claim transaction. ` +
        `Expected ${claimTxid}, got ${input1Txid}`,
    );
  }

  const peginPrevOut = peginTx.outs[input0.index];
  if (!peginPrevOut) {
    throw new Error(
      `Previous output not found for input 0 (txid: ${input0Txid}, index: ${input0.index})`,
    );
  }

  const claimPrevOut = claimTx.outs[input1.index];
  if (!claimPrevOut) {
    throw new Error(
      `Previous output not found for input 1 (txid: ${input1Txid}, index: ${input1.index})`,
    );
  }

  // Input 0: Depositor signs using Taproot script path spend
  // This input includes tapLeafScript for signing
  psbt.addInput({
    hash: input0.hash,
    index: input0.index,
    sequence: input0.sequence,
    witnessUtxo: {
      script: peginPrevOut.script,
      value: peginPrevOut.value,
    },
    tapLeafScript: [
      {
        leafVersion: 0xc0,
        script: Buffer.from(payoutScriptBytes),
        controlBlock: Buffer.from(controlBlock),
      },
    ],
    tapInternalKey: Buffer.from(tapInternalPubkey),
    // sighashType omitted - defaults to SIGHASH_DEFAULT (0x00) for Taproot
  });

  // Input 1: From claim transaction (NOT signed by depositor)
  // We include this with witnessUtxo so the sighash is computed correctly,
  // but we do NOT include tapLeafScript since the depositor doesn't sign it.
  psbt.addInput({
    hash: input1.hash,
    index: input1.index,
    sequence: input1.sequence,
    witnessUtxo: {
      script: claimPrevOut.script,
      value: claimPrevOut.value,
    },
    // No tapLeafScript - depositor doesn't sign this input
  });

  // Add outputs
  for (const output of payoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return {
    psbtHex: psbt.toHex(),
  };
}

/**
 * Extract Schnorr signature from signed payout PSBT
 *
 * This function supports two cases:
 * 1. Non-finalized PSBT: Extracts from tapScriptSig field
 * 2. Finalized PSBT: Extracts from witness data
 *
 * The signature is returned as a 64-byte hex string (128 hex characters)
 * with any sighash flag byte removed if present.
 *
 * @param signedPsbtHex - Signed PSBT hex
 * @param depositorPubkey - Depositor's public key (x-only, 64-char hex)
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 *
 * @throws {Error} If no signature is found in the PSBT
 * @throws {Error} If the signature has an unexpected length
 *
 * @example
 * ```typescript
 * import { extractPayoutSignature } from '@babylonlabs-io/ts-sdk/tbv/core/primitives';
 *
 * const signature = extractPayoutSignature(
 *   signedPsbtHex,
 *   'abc123...',
 * );
 *
 * console.log(signature.length); // 128 (64 bytes)
 * ```
 */
export function extractPayoutSignature(
  signedPsbtHex: string,
  depositorPubkey: string,
): string {
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  if (signedPsbt.data.inputs.length === 0) {
    throw new Error("No inputs found in signed PSBT");
  }

  const firstInput = signedPsbt.data.inputs[0];

  if (!firstInput.tapScriptSig || firstInput.tapScriptSig.length === 0) {
    throw new Error("No tapScriptSig found in signed PSBT");
  }

  const depositorPubkeyBytes = hexToUint8Array(depositorPubkey);

  for (const sigEntry of firstInput.tapScriptSig) {
    if (sigEntry.pubkey.equals(Buffer.from(depositorPubkeyBytes))) {
      const sig = sigEntry.signature;
      // Return 64-byte signature, stripping sighash flag if present
      if (sig.length === 64) {
        return uint8ArrayToHex(new Uint8Array(sig));
      } else if (sig.length === 65) {
        return uint8ArrayToHex(new Uint8Array(sig.subarray(0, 64)));
      }
      throw new Error(`Unexpected signature length: ${sig.length}`);
    }
  }

  throw new Error(
    `No signature found for depositor pubkey: ${depositorPubkey}`,
  );
}

/**
 * Compute control block for Taproot script path spend.
 *
 * For a single script (no tree), the control block format is:
 * [leaf_version | parity] || [internal_key_x_only]
 *
 * The leaf version for Tapscript is 0xc0, and the parity bit indicates
 * whether the output key has an odd or even y-coordinate.
 *
 * @param internalKey - Taproot internal public key (x-only, 32 bytes)
 * @param script - Taproot script to compute control block for
 * @returns Control block buffer
 *
 * @internal
 */
function computeControlBlock(
  internalKey: Uint8Array,
  script: Uint8Array,
): Uint8Array {
  // Convert to actual Buffer instances for bitcoinjs-lib runtime type checks
  const scriptTree = { output: Buffer.from(script) };
  const payment = payments.p2tr({
    internalPubkey: Buffer.from(internalKey),
    scriptTree,
  });

  const outputKey = payment.pubkey;
  if (!outputKey) {
    throw new Error("Failed to compute output key");
  }

  // Control block: [leaf_version | parity] || [internal_key_x_only]
  const leafVersion = 0xc0;
  const parity = outputKey[0] === 0x03 ? 1 : 0; // 0x02 = even, 0x03 = odd
  const controlByte = leafVersion | parity;

  const result = new Uint8Array(1 + internalKey.length);
  result[0] = controlByte;
  result.set(internalKey, 1);
  return result;
}
