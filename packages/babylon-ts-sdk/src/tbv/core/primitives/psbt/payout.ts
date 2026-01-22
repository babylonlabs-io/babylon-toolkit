/**
 * Payout PSBT Builder Primitives
 *
 * This module provides pure functions for building unsigned payout PSBTs and extracting
 * Schnorr signatures from signed PSBTs. It uses WASM-generated scripts from the payout
 * connector and bitcoinjs-lib for PSBT construction.
 *
 * There are two types of payout transactions:
 * - **PayoutOptimistic**: Optimistic path after Claim (no challenge). Input 1 references Claim tx.
 * - **Payout**: Challenge path after Assert (claimer proves validity). Input 1 references Assert tx.
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
 * Base parameters shared by both payout transaction types
 */
interface PayoutBaseParams {
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
   * Bitcoin network
   */
  network: Network;
}

/**
 * Parameters for building an unsigned PayoutOptimistic PSBT
 *
 * PayoutOptimistic is used in the optimistic path when no challenge occurs.
 * Input 1 references the Claim transaction.
 */
export interface PayoutOptimisticParams extends PayoutBaseParams {
  /**
   * PayoutOptimistic transaction hex (unsigned)
   * This is the transaction that needs to be signed by the depositor
   */
  payoutOptimisticTxHex: string;

  /**
   * Claim transaction hex
   * PayoutOptimistic input 1 references Claim output 0
   */
  claimTxHex: string;
}

/**
 * Parameters for building an unsigned Payout PSBT (challenge path)
 *
 * Payout is used in the challenge path after Assert, when the claimer proves validity.
 * Input 1 references the Assert transaction.
 */
export interface PayoutParams extends PayoutBaseParams {
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
 * Internal parameters for the shared PSBT builder.
 * @internal
 */
interface InternalPayoutParams extends PayoutBaseParams {
  /** The payout transaction hex (either PayoutOptimistic or Payout) */
  payoutTxHex: string;
  /** The input 1 reference transaction hex (either Claim or Assert) */
  input1TxHex: string;
  /** Name of input 1 tx for error messages */
  input1TxName: string;
}

/**
 * Internal shared function for building payout PSBTs
 *
 * Both PayoutOptimistic and Payout transactions have the same structure:
 * - Input 0: from PeginTx output0 (signed by depositor)
 * - Input 1: from Claim/Assert output0 (NOT signed by depositor)
 *
 * @internal
 */
async function buildPayoutPsbtInternal(
  params: InternalPayoutParams,
): Promise<PayoutPsbtResult> {
  // Normalize hex inputs (strip 0x prefix if present)
  const payoutTxHex = stripHexPrefix(params.payoutTxHex);
  const peginTxHex = stripHexPrefix(params.peginTxHex);
  const input1TxHex = stripHexPrefix(params.input1TxHex);

  // Get payout script from WASM
  const payoutConnector = await createPayoutScript({
    depositor: params.depositorBtcPubkey,
    vaultProvider: params.vaultProviderBtcPubkey,
    vaultKeepers: params.vaultKeeperBtcPubkeys,
    universalChallengers: params.universalChallengerBtcPubkeys,
    network: params.network,
  });

  const payoutScriptBytes = hexToUint8Array(payoutConnector.payoutScript);
  const controlBlock = computeControlBlock(tapInternalPubkey, payoutScriptBytes);

  // Parse transactions
  const payoutTx = Transaction.fromHex(payoutTxHex);
  const peginTx = Transaction.fromHex(peginTxHex);
  const input1Tx = Transaction.fromHex(input1TxHex);

  // Create PSBT
  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  // PayoutTx has exactly 2 inputs:
  // - Input 0: from PeginTx output0 (signed by depositor using taproot script path)
  // - Input 1: from Claim/Assert output0 (signed by claimer/challengers, not depositor)
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

  // Verify input 1 references the expected transaction (Claim or Assert)
  const input1Txid = uint8ArrayToHex(
    new Uint8Array(input1.hash).slice().reverse(),
  );
  const expectedInput1Txid = input1Tx.getId();

  if (input1Txid !== expectedInput1Txid) {
    throw new Error(
      `Input 1 does not reference ${params.input1TxName} transaction. ` +
        `Expected ${expectedInput1Txid}, got ${input1Txid}`,
    );
  }

  const peginPrevOut = peginTx.outs[input0.index];
  if (!peginPrevOut) {
    throw new Error(
      `Previous output not found for input 0 (txid: ${input0Txid}, index: ${input0.index})`,
    );
  }

  const input1PrevOut = input1Tx.outs[input1.index];
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

  // Input 1: From Claim/Assert transaction (NOT signed by depositor)
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
 * Build unsigned PayoutOptimistic PSBT for depositor to sign.
 *
 * PayoutOptimistic is used in the **optimistic path** when no challenge occurs:
 * 1. Vault provider submits Claim transaction
 * 2. Challenge period passes without challenge
 * 3. PayoutOptimistic can be executed (references Claim tx)
 *
 * @param params - PayoutOptimistic parameters
 * @returns Unsigned PSBT ready for depositor to sign
 *
 * @throws If payout transaction does not have exactly 2 inputs
 * @throws If input 0 does not reference the pegin transaction
 * @throws If input 1 does not reference the claim transaction
 * @throws If previous output is not found for either input
 */
export async function buildPayoutOptimisticPsbt(
  params: PayoutOptimisticParams,
): Promise<PayoutPsbtResult> {
  return buildPayoutPsbtInternal({
    payoutTxHex: params.payoutOptimisticTxHex,
    peginTxHex: params.peginTxHex,
    input1TxHex: params.claimTxHex,
    input1TxName: "claim",
    depositorBtcPubkey: params.depositorBtcPubkey,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
    network: params.network,
  });
}

/**
 * Build unsigned Payout PSBT for depositor to sign (challenge path).
 *
 * Payout is used in the **challenge path** when the claimer proves validity:
 * 1. Vault provider submits Claim transaction
 * 2. Challenge is raised during challenge period
 * 3. Claimer submits Assert transaction to prove validity
 * 4. Payout can be executed (references Assert tx)
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
  return buildPayoutPsbtInternal({
    payoutTxHex: params.payoutTxHex,
    peginTxHex: params.peginTxHex,
    input1TxHex: params.assertTxHex,
    input1TxName: "assert",
    depositorBtcPubkey: params.depositorBtcPubkey,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: params.universalChallengerBtcPubkeys,
    network: params.network,
  });
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
 * Works with both PayoutOptimistic and Payout signed PSBTs.
 *
 * @param signedPsbtHex - Signed PSBT hex
 * @param depositorPubkey - Depositor's public key (x-only, 64-char hex)
 * @returns 64-byte Schnorr signature (128 hex characters, no sighash flag)
 *
 * @throws If no signature is found in the PSBT
 * @throws If the signature has an unexpected length
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
