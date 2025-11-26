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
import { initEccLib, payments, Psbt, Transaction } from "bitcoinjs-lib";
import { createPayoutScript } from "../scripts/payout";
import { hexToUint8Array, uint8ArrayToHex } from "../utils/bitcoin";

// Use Buffer from global scope (provided by bitcoinjs-lib or polyfills)
declare const Buffer: typeof import("buffer").Buffer;

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
  const payoutTx = Transaction.fromHex(params.payoutTxHex);
  const peginTx = Transaction.fromHex(params.peginTxHex);
  const claimTx = Transaction.fromHex(params.claimTxHex);

  // Create PSBT
  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  // Add inputs - only input 0 (pegin output) needs Taproot script path spend info
  for (let i = 0; i < payoutTx.ins.length; i++) {
    const input = payoutTx.ins[i];

    // Determine which transaction this input spends from
    const inputTxid = uint8ArrayToHex(
      new Uint8Array(input.hash).slice().reverse(),
    );
    const peginTxid = peginTx.getId();
    const claimTxid = claimTx.getId();

    let prevTx: Transaction;
    if (inputTxid === peginTxid) {
      prevTx = peginTx;
    } else if (inputTxid === claimTxid) {
      prevTx = claimTx;
    } else {
      throw new Error(
        `Input ${i} references unknown transaction. ` +
          `Expected peginTxid (${peginTxid}) or claimTxid (${claimTxid}), ` +
          `got ${inputTxid}`,
      );
    }

    const prevOut = prevTx.outs[input.index];
    if (!prevOut) {
      throw new Error(
        `Previous output not found for input ${i} (txid: ${inputTxid}, index: ${input.index})`,
      );
    }

    if (i === 0) {
      // Input 0: Depositor signs using Taproot script path spend
      psbt.addInput({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        witnessUtxo: {
          script: prevOut.script,
          value: prevOut.value,
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
    } else {
      // Other inputs: Signed by claimer, not depositor
      psbt.addInput({
        hash: input.hash,
        index: input.index,
        sequence: input.sequence,
        witnessUtxo: {
          script: prevOut.script,
          value: prevOut.value,
        },
      });
    }
  }

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

  // Try tapScriptSig first
  if (firstInput.tapScriptSig && firstInput.tapScriptSig.length > 0) {
    const depositorPubkeyBytes = hexToUint8Array(depositorPubkey);

    for (const sigEntry of firstInput.tapScriptSig) {
      if (sigEntry.pubkey.equals(Buffer.from(depositorPubkeyBytes))) {
        const signature = sigEntry.signature;

        // Remove sighash flag byte if present
        if (signature.length === 64) {
          return uint8ArrayToHex(new Uint8Array(signature));
        } else if (signature.length === 65) {
          return uint8ArrayToHex(new Uint8Array(signature.subarray(0, 64)));
        } else {
          throw new Error(
            `Unexpected Schnorr signature length: ${signature.length}`,
          );
        }
      }
    }
  }

  // Try finalized witness (for finalized PSBT)
  const tx = signedPsbt.extractTransaction();
  const witness = tx.ins[0].witness;

  if (!witness || witness.length === 0) {
    throw new Error("No witness data in signed transaction");
  }

  // For Taproot script path spend: [sig1] [sig2] ... [sigN] [script] [control_block]
  // The depositor's signature should be the first element
  const depositorSig = witness[0];

  // Remove sighash flag byte if present
  if (depositorSig.length === 64) {
    return depositorSig.toString("hex");
  } else if (depositorSig.length === 65) {
    const sighashFlag = depositorSig[64];
    if (sighashFlag !== 0x01 && sighashFlag !== 0x00) {
      throw new Error(`Unexpected sighash flag: 0x${sighashFlag.toString(16)}`);
    }
    return depositorSig.subarray(0, 64).toString("hex");
  } else {
    throw new Error(`Unexpected signature length: ${depositorSig.length}`);
  }
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
