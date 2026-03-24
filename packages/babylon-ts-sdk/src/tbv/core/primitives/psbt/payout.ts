/**
 * Payout PSBT Builder Primitives
 *
 * This module provides pure functions for building unsigned payout PSBTs and extracting
 * Schnorr signatures from signed PSBTs. It uses WASM-generated scripts from the payout
 * connector and bitcoinjs-lib for PSBT construction.
 *
 * The Payout transaction references the Assert transaction (input 1).
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
 * Parameters for building an unsigned Payout PSBT
 *
 * Payout is used in the challenge path after Assert, when the claimer proves validity.
 * Input 1 references the Assert transaction.
 */
export interface PayoutParams {
  /**
   * Payout transaction hex (unsigned)
   * This is the transaction that needs to be signed by the depositor
   */
  payoutTxHex: string;

  /**
   * Assert transaction hex
   * Payout input 1 references Assert output 0
   */
  assertTxHex: string;

  /**
   * Peg-in transaction hex
   * This transaction created the vault output that we're spending
   */
  peginTxHex: string;

  /**
   * Depositor's BTC public key (x-only, 64-char hex without 0x prefix)
   */
  depositorBtcPubkey: string;

  /**
   * Vault provider's BTC public key (x-only, 64-char hex)
   */
  vaultProviderBtcPubkey: string;

  /**
   * Vault keeper BTC public keys (x-only, 64-char hex)
   */
  vaultKeeperBtcPubkeys: string[];

  /**
   * Universal challenger BTC public keys (x-only, 64-char hex)
   */
  universalChallengerBtcPubkeys: string[];

  /**
   * CSV timelock in blocks for the PegIn output.
   */
  timelockPegin: number;

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
 * Build unsigned Payout PSBT for depositor to sign.
 *
 * Payout is used in the **challenge path** when the claimer proves validity:
 * 1. Vault provider submits Claim transaction
 * 2. Challenge is raised during challenge period
 * 3. Claimer submits Assert transaction to prove validity
 * 4. Payout can be executed (references Assert tx)
 *
 * Payout transactions have the following structure:
 * - Input 0: from PeginTx output0 (signed by depositor)
 * - Input 1: from Assert output0 (NOT signed by depositor)
 *
 * @param params - Payout parameters
 * @returns Unsigned PSBT ready for depositor to sign
 *
 * @throws If payout transaction does not have exactly 2 inputs
 * @throws If input 0 does not reference the pegin transaction
 * @throws If input 1 does not reference the assert transaction
 * @throws If previous output is not found for either input
 */
export async function buildPayoutPsbt(
  params: PayoutParams,
): Promise<PayoutPsbtResult> {
  // Normalize hex inputs (strip 0x prefix if present)
  const payoutTxHex = stripHexPrefix(params.payoutTxHex);
  const peginTxHex = stripHexPrefix(params.peginTxHex);
  const assertTxHex = stripHexPrefix(params.assertTxHex);

  // Get payout script from WASM
  const payoutConnector = await createPayoutScript({
    depositor: params.depositorBtcPubkey,
    vaultProvider: params.vaultProviderBtcPubkey,
    vaultKeepers: params.vaultKeeperBtcPubkeys,
    universalChallengers: params.universalChallengerBtcPubkeys,
    timelockPegin: params.timelockPegin,
    network: params.network,
  });

  const payoutScriptBytes = hexToUint8Array(payoutConnector.payoutScript);
  const controlBlock = computeControlBlock(tapInternalPubkey, payoutScriptBytes);

  // Parse transactions
  const payoutTx = Transaction.fromHex(payoutTxHex);
  const peginTx = Transaction.fromHex(peginTxHex);
  const assertTx = Transaction.fromHex(assertTxHex);

  // Create PSBT
  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  // PayoutTx has exactly 2 inputs:
  // - Input 0: from PeginTx output0 (signed by depositor using taproot script path)
  // - Input 1: from Assert output0 (signed by claimer/challengers, not depositor)
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

  // Verify input 1 references the assert transaction
  const input1Txid = uint8ArrayToHex(
    new Uint8Array(input1.hash).slice().reverse(),
  );
  const expectedInput1Txid = assertTx.getId();

  if (input1Txid !== expectedInput1Txid) {
    throw new Error(
      `Input 1 does not reference assert transaction. ` +
        `Expected ${expectedInput1Txid}, got ${input1Txid}`,
    );
  }

  const peginPrevOut = peginTx.outs[input0.index];
  if (!peginPrevOut) {
    throw new Error(
      `Previous output not found for input 0 (txid: ${input0Txid}, index: ${input0.index})`,
    );
  }

  const input1PrevOut = assertTx.outs[input1.index];
  if (!input1PrevOut) {
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

  // Input 1: From Assert transaction (NOT signed by depositor)
  // We include this with witnessUtxo so the sighash is computed correctly,
  // but we do NOT include tapLeafScript since the depositor doesn't sign it.
  psbt.addInput({
    hash: input1.hash,
    index: input1.index,
    sequence: input1.sequence,
    witnessUtxo: {
      script: input1PrevOut.script,
      value: input1PrevOut.value,
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
 * Extract Schnorr signature from signed payout PSBT.
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
 * @param inputIndex - Input index to extract signature from (default: 0)
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 *
 * @throws If no signature is found in the PSBT
 * @throws If the signature has an unexpected length
 */
export function extractPayoutSignature(
  signedPsbtHex: string,
  depositorPubkey: string,
  inputIndex = 0,
): string {
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  if (inputIndex >= signedPsbt.data.inputs.length) {
    throw new Error(
      `Input index ${inputIndex} out of range (${signedPsbt.data.inputs.length} inputs)`,
    );
  }

  const input = signedPsbt.data.inputs[inputIndex];

  // Case 1: Non-finalized PSBT — extract from tapScriptSig
  if (input.tapScriptSig && input.tapScriptSig.length > 0) {
    const depositorPubkeyBytes = hexToUint8Array(depositorPubkey);

    for (const sigEntry of input.tapScriptSig) {
      if (sigEntry.pubkey.equals(Buffer.from(depositorPubkeyBytes))) {
        return extractSchnorrSig(sigEntry.signature, inputIndex);
      }
    }

    throw new Error(
      `No signature found for depositor pubkey: ${depositorPubkey} at input ${inputIndex}`,
    );
  }

  // Case 2: Finalized PSBT — extract from finalScriptWitness
  // Taproot script-path witness: [signature, script, controlBlock]
  if (input.finalScriptWitness && input.finalScriptWitness.length > 0) {
    const witnessStack = parseWitnessStack(input.finalScriptWitness);
    if (witnessStack.length >= 1) {
      return extractSchnorrSig(witnessStack[0], inputIndex);
    }
  }

  throw new Error(
    `No tapScriptSig or finalScriptWitness found in signed PSBT at input ${inputIndex}`,
  );
}

const SIGHASH_ALL = 0x01;

/**
 * Extract and validate a 64-byte Schnorr signature, stripping sighash flag if present.
 * Rejects signatures with sighash types other than SIGHASH_ALL (0x01) to prevent
 * acceptance of signatures that don't commit to all outputs (e.g. SIGHASH_NONE).
 * @internal
 */
export function extractSchnorrSig(
  sig: Uint8Array,
  inputIndex: number,
): string {
  if (sig.length === 64) {
    return uint8ArrayToHex(new Uint8Array(sig));
  } else if (sig.length === 65) {
    const sighashByte = sig[64];
    if (sighashByte !== SIGHASH_ALL) {
      throw new Error(
        `Unexpected sighash type 0x${sighashByte.toString(16).padStart(2, "0")} at input ${inputIndex}. Expected SIGHASH_ALL (0x01).`,
      );
    }
    return uint8ArrayToHex(new Uint8Array(sig.subarray(0, 64)));
  }
  throw new Error(
    `Unexpected signature length at input ${inputIndex}: ${sig.length}`,
  );
}

/**
 * Parse a BIP-141 serialized witness stack into individual stack items.
 * Format: [varint item_count] [varint len, data]...
 * @internal
 */
function parseWitnessStack(witness: Buffer): Buffer[] {
  const items: Buffer[] = [];
  let offset = 0;

  const readVarInt = (): number => {
    const first = witness[offset++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const val = witness[offset] | (witness[offset + 1] << 8);
      offset += 2;
      return val;
    }
    if (first === 0xfe) {
      const val =
        witness[offset] |
        (witness[offset + 1] << 8) |
        (witness[offset + 2] << 16) |
        (witness[offset + 3] << 24);
      offset += 4;
      return val;
    }
    // 0xff — 8-byte, won't happen for witness data
    offset += 8;
    return 0;
  };

  const count = readVarInt();
  for (let i = 0; i < count; i++) {
    const len = readVarInt();
    items.push(witness.subarray(offset, offset + len) as Buffer);
    offset += len;
  }

  return items;
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
