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
import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { createPayoutScript } from "../scripts/payout";
import {
  TAPSCRIPT_LEAF_VERSION,
  deriveBip86ScriptPubKeyHex,
  hexToUint8Array,
  isValidHex,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../utils/bitcoin";
import {
  ASSERT_PAYOUT_OUTPUT_INDEX,
  MAX_VP_COMMISSION_BPS_EXCLUSIVE,
  NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT,
  PAYOUT_ANCHOR_DUST_SATS,
  PEGIN_VAULT_OUTPUT_INDEX,
  VP_CLAIMER_PAYOUT_OUTPUT_COUNT,
} from "./constants";

/**
 * Number of items in a Taproot script-path spend witness stack for a
 * single-signature script: [signature, script, controlBlock].
 *
 * The current payout script requires exactly one depositor signature. If the
 * protocol evolves to require multiple signatures in the payout script, this
 * invariant and the finalized-PSBT extraction path must be revisited because
 * the first witness item would no longer necessarily be the depositor's.
 */
const TAPROOT_SINGLE_SIG_WITNESS_STACK_SIZE = 3;

/**
 * Upper bound on the implicit fee (inputs − outputs) of a payout transaction,
 * expressed as a fraction of total input value. With input prevouts pinned
 * (see {@link buildPayoutPsbt}) the SDK knows the exact value entering the
 * transaction; any value that doesn't reappear as an output is implicit miner
 * fee. A malicious VP could otherwise return a payout tx with the registered
 * output script at vout 0 but deflated values, burning the remainder as fee.
 * 10% is well above any realistic fee for a ~200-vbyte payout tx, so
 * legitimate flows are never blocked.
 */
const MAX_PAYOUT_FEE_FRACTION_NUMERATOR = 10;
const MAX_PAYOUT_FEE_FRACTION_DENOMINATOR = 100;

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

  /**
   * The claimer's x-only BTC public key for this payout (64-char hex, no prefix).
   * Used to infer the payout role (VP / depositor-as-claimer / VK-claimer)
   * against the protocol pubkey sets already passed in. Role inference lives
   * inside `buildPayoutPsbt` so the caller cannot fabricate a wrong label.
   */
  claimerBtcPubkey: string;

  /**
   * The on-chain registered depositor payout scriptPubKey (hex, with or
   * without 0x prefix). Used to validate outs[0].script for the VP-claimer
   * and depositor-as-claimer roles. For the VK-claimer role the expected
   * outs[0].script is derived from `claimerBtcPubkey` via BIP-86, and this
   * field is unused.
   */
  registeredPayoutScriptPubKey: string;

  /**
   * Vault Provider commission in basis points, sourced from
   * `BTCVaultRegistry.vaultProviderCommissionBps`. Only consumed under the
   * VP-claimer role to cap outs[1].value at
   * `floor(peginValue * commissionBps / 10_000)`.
   *
   * This builder enforces only the structural guard it needs for safe cap
   * math: a non-negative integer below
   * {@link MAX_VP_COMMISSION_BPS_EXCLUSIVE}. The protocol *minimum*
   * (`max(VersionedOffchainParams.minVpCommissionBps, 1)`) is enforced at the
   * trust boundary where on-chain data is read (`prepareSigningContext`), not
   * here — a too-low value is fail-safe (it only shrinks the cap).
   */
  commissionBps: number;
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
 * @throws If input 0 does not spend PegIn:0 (vault UTXO)
 * @throws If input 1 does not spend Assert:0 (proof output)
 * @throws If previous output is not found for either input
 * @throws If sum of output values exceeds sum of input values (invalid tx)
 * @throws If implicit fee (inputs − outputs) exceeds the configured fraction
 *   of total input value — see {@link MAX_PAYOUT_FEE_FRACTION_NUMERATOR}
 * @throws If `claimerBtcPubkey` is not VP, depositor, or a registered VK
 * @throws If payout output count, outs[0] script, outs[last] anchor value, or
 *   (VP-claimer) outs[1] commission cap do not match the protocol layout
 * @throws If `commissionBps` is not a non-negative integer below 10_000
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
  const controlBlock = hexToUint8Array(payoutConnector.payoutControlBlock);

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

  // Verify input 0 spends PegIn:0 (the vault UTXO).
  // Both txid AND vout must match the protocol contract — the vout is the
  // input-side anchor that prevents a malicious VP from binding the
  // depositor's signature to a different output of the same parent.
  const input0Txid = uint8ArrayToHex(
    new Uint8Array(input0.hash).slice().reverse(),
  );
  const peginTxid = peginTx.getId();

  if (input0Txid !== peginTxid || input0.index !== PEGIN_VAULT_OUTPUT_INDEX) {
    throw new Error(
      `Input 0 must spend PegIn:${PEGIN_VAULT_OUTPUT_INDEX}. ` +
        `Expected ${peginTxid}:${PEGIN_VAULT_OUTPUT_INDEX}, got ${input0Txid}:${input0.index}`,
    );
  }

  // Verify input 1 spends Assert:0 (the proof output).
  const input1Txid = uint8ArrayToHex(
    new Uint8Array(input1.hash).slice().reverse(),
  );
  const assertTxid = assertTx.getId();

  if (input1Txid !== assertTxid || input1.index !== ASSERT_PAYOUT_OUTPUT_INDEX) {
    throw new Error(
      `Input 1 must spend Assert:${ASSERT_PAYOUT_OUTPUT_INDEX}. ` +
        `Expected ${assertTxid}:${ASSERT_PAYOUT_OUTPUT_INDEX}, got ${input1Txid}:${input1.index}`,
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

  // Validate the payout output structure against the protocol-canonical
  // layout for this claimer's role. Blocks an extra attacker output and
  // value routed into a non-payout slot. The role is inferred from
  // `claimerBtcPubkey` against the pubkey sets that buildPayoutPsbt already
  // receives, so the caller cannot fabricate a wrong role label.
  assertPayoutOutputLayout({
    payoutTx,
    peginValueSats: peginPrevOut.value,
    claimerBtcPubkey: params.claimerBtcPubkey,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    depositorBtcPubkey: params.depositorBtcPubkey,
    vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
    registeredPayoutScriptPubKey: params.registeredPayoutScriptPubKey,
    commissionBps: params.commissionBps,
  });

  // Bound the implicit fee. With input prevouts pinned the SDK knows the
  // exact value entering the transaction; any value that doesn't reappear as
  // an output is implicit miner fee. A malicious VP could otherwise return a
  // payout tx with the registered output script at vout 0 but deflated
  // values, burning the remainder as fee.
  const inputValueSats = peginPrevOut.value + input1PrevOut.value;
  let outputValueSats = 0;
  for (const out of payoutTx.outs) outputValueSats += out.value;
  if (outputValueSats > inputValueSats) {
    throw new Error(
      `Payout outputs (${outputValueSats} sats) exceed inputs ` +
        `(${inputValueSats} sats); invalid transaction.`,
    );
  }
  const implicitFeeSats = inputValueSats - outputValueSats;
  const maxFeeSats = Math.floor(
    (inputValueSats * MAX_PAYOUT_FEE_FRACTION_NUMERATOR) /
      MAX_PAYOUT_FEE_FRACTION_DENOMINATOR,
  );
  if (implicitFeeSats > maxFeeSats) {
    throw new Error(
      `Payout implicit fee ${implicitFeeSats} sats exceeds the safety cap ` +
        `of ${maxFeeSats} sats ` +
        `(${MAX_PAYOUT_FEE_FRACTION_NUMERATOR}/${MAX_PAYOUT_FEE_FRACTION_DENOMINATOR} ` +
        `of inputs=${inputValueSats}); refusing to sign payout.`,
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
        leafVersion: TAPSCRIPT_LEAF_VERSION,
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
 * Validate that a payout transaction's output structure matches the protocol
 * contract for the claimer's role. Protects depositor value against:
 *
 * - extra/missing attacker output (`outs.length` pinned per role)
 * - outs[0] redirected away from the registered payout address (script pinned)
 * - value drained through the anchor slot (outs[last].value pinned to dust)
 * - (VP-claimer only) value drained through the commission slot
 *   (outs[1].value capped at `floor(peginValue × commissionBps / 10_000)`)
 *
 * Value-burn through implicit fee is enforced separately by the 10% bound in
 * {@link buildPayoutPsbt}.
 *
 * Role inference is keyed purely on `claimerBtcPubkey` against the pubkey
 * sets `buildPayoutPsbt` already receives, so the caller cannot fabricate a
 * wrong role label. Protocol-canonical layouts, per
 * `btc-vault crates/vault/src/transactions/payout.rs`:
 *  - VP-claimer: 3 outputs — [depositor payout, VP commission, CPFP anchor]
 *  - Depositor-as-claimer / VK-claimer: 2 outputs — [claimer payout, CPFP anchor]
 *
 * Defensive checks on outs[1].script (VP commission destination) and
 * outs[last].script (CPFP anchor ownership) are intentionally NOT performed
 * — those are the VP's and claimer's own concerns, not depositor protection.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
function assertPayoutOutputLayout(args: {
  payoutTx: Transaction;
  peginValueSats: number;
  claimerBtcPubkey: string;
  vaultProviderBtcPubkey: string;
  depositorBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  registeredPayoutScriptPubKey: string;
  commissionBps: number;
}): void {
  const {
    payoutTx,
    peginValueSats,
    claimerBtcPubkey,
    vaultProviderBtcPubkey,
    depositorBtcPubkey,
    vaultKeeperBtcPubkeys,
    registeredPayoutScriptPubKey,
    commissionBps,
  } = args;

  if (!isValidHex(registeredPayoutScriptPubKey)) {
    throw new Error("Invalid registeredPayoutScriptPubKey: not valid hex");
  }

  const claimer = stripHexPrefix(claimerBtcPubkey).toLowerCase();
  const vp = stripHexPrefix(vaultProviderBtcPubkey).toLowerCase();
  const dep = stripHexPrefix(depositorBtcPubkey).toLowerCase();
  const keepers = vaultKeeperBtcPubkeys.map((k) =>
    stripHexPrefix(k).toLowerCase(),
  );

  type Role = "vp-claimer" | "depositor-as-claimer" | "vk-claimer";
  let role: Role;
  let expectedOutCount: number;
  let expectedOut0ScriptHex: string;

  if (claimer === vp) {
    role = "vp-claimer";
    expectedOutCount = VP_CLAIMER_PAYOUT_OUTPUT_COUNT;
    expectedOut0ScriptHex = stripHexPrefix(registeredPayoutScriptPubKey);
  } else if (claimer === dep) {
    role = "depositor-as-claimer";
    expectedOutCount = NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT;
    expectedOut0ScriptHex = stripHexPrefix(registeredPayoutScriptPubKey);
  } else if (keepers.includes(claimer)) {
    role = "vk-claimer";
    expectedOutCount = NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT;
    expectedOut0ScriptHex = stripHexPrefix(deriveBip86ScriptPubKeyHex(claimer));
  } else {
    throw new Error(
      `Unknown claimer pubkey ${claimer}: not VP, depositor, or a registered vault keeper`,
    );
  }

  if (payoutTx.outs.length !== expectedOutCount) {
    throw new Error(
      `Payout transaction has ${payoutTx.outs.length} output(s), ` +
        `expected exactly ${expectedOutCount} for role ${role}.`,
    );
  }

  const expectedOut0Script = Buffer.from(expectedOut0ScriptHex, "hex");
  if (!payoutTx.outs[0].script.equals(expectedOut0Script)) {
    throw new Error(
      `Payout transaction output 0 does not pay the expected scriptPubKey for role ${role}`,
    );
  }

  const anchorIdx = expectedOutCount - 1;
  if (payoutTx.outs[anchorIdx].value !== PAYOUT_ANCHOR_DUST_SATS) {
    throw new Error(
      `Payout CPFP anchor (out ${anchorIdx}) value ${payoutTx.outs[anchorIdx].value} sats ` +
        `must equal ${PAYOUT_ANCHOR_DUST_SATS} sats`,
    );
  }

  if (role === "vp-claimer") {
    // Structural guard only — a non-negative integer below the bps
    // denominator, so the cap math `floor(peginValue * bps / 10_000)` is
    // meaningful. The protocol minimum is enforced at the trust boundary
    // (`prepareSigningContext`); a too-low value here is fail-safe.
    if (
      !Number.isInteger(commissionBps) ||
      commissionBps < 0 ||
      commissionBps >= MAX_VP_COMMISSION_BPS_EXCLUSIVE
    ) {
      throw new Error(
        `commissionBps must be an integer in ` +
          `[0, ${MAX_VP_COMMISSION_BPS_EXCLUSIVE}), got ${commissionBps}`,
      );
    }
    const maxCommissionSats = Math.floor(
      (peginValueSats * commissionBps) / MAX_VP_COMMISSION_BPS_EXCLUSIVE,
    );
    if (payoutTx.outs[1].value > maxCommissionSats) {
      throw new Error(
        `Payout VP commission (out 1) value ${payoutTx.outs[1].value} sats ` +
          `exceeds cap ${maxCommissionSats} sats ` +
          `(${commissionBps} bps of peginValue=${peginValueSats})`,
      );
    }
  }
}

/**
 * Extract Schnorr signature from signed payout PSBT.
 *
 * This function supports two cases:
 * 1. Non-finalized PSBT: Extracts from tapScriptSig field
 * 2. Finalized PSBT: Extracts from witness data
 *
 * The signature is returned as a 64-byte hex string (128 hex characters).
 * Payout signatures must use implicit Taproot SIGHASH_DEFAULT, which is
 * encoded by omitting the sighash byte.
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
  // Taproot single-signature script-path witness: [signature, script, controlBlock].
  // Enforce the exact stack size so that if a wallet produces an unexpected
  // finalization (e.g. a multi-signature stack, an annex, or malformed data),
  // we fail loudly instead of silently returning witnessStack[0] which may
  // not be the depositor's signature.
  if (input.finalScriptWitness && input.finalScriptWitness.length > 0) {
    const witnessStack = parseWitnessStack(input.finalScriptWitness);
    if (witnessStack.length !== TAPROOT_SINGLE_SIG_WITNESS_STACK_SIZE) {
      throw new Error(
        `Unexpected finalized witness stack size at input ${inputIndex}: ` +
          `expected ${TAPROOT_SINGLE_SIG_WITNESS_STACK_SIZE} items (signature, script, controlBlock), ` +
          `got ${witnessStack.length}`,
      );
    }
    return extractSchnorrSig(witnessStack[0], inputIndex);
  }

  throw new Error(
    `No tapScriptSig or finalScriptWitness found in signed PSBT at input ${inputIndex}`,
  );
}

/**
 * Extract and validate a 64-byte Schnorr signature.
 * Rejects 65-byte signatures because the appended sighash byte changes the
 * Taproot message being signed; stripping it would produce an unverifiable
 * SIGHASH_DEFAULT signature.
 * @internal
 */
function extractSchnorrSig(sig: Uint8Array, inputIndex: number): string {
  if (sig.length === 64) {
    return uint8ArrayToHex(new Uint8Array(sig));
  }
  if (sig.length === 65) {
    throw new Error(
      `Unexpected sighash byte 0x${sig[64].toString(16).padStart(2, "0")} at input ${inputIndex}. ` +
        "Expected implicit SIGHASH_DEFAULT as a 64-byte signature.",
    );
  }
  throw new Error(
    `Unexpected signature length at input ${inputIndex}: ${sig.length}`,
  );
}

/**
 * Parse a BIP-141 serialized witness stack into individual stack items.
 * Format: [varint item_count] [varint len, data]...
 *
 * Throws on malformed input (truncated buffer, 8-byte varints, or trailing
 * bytes) so callers never receive silently-corrupted witness items.
 * @internal
 */
function parseWitnessStack(witness: Buffer): Buffer[] {
  const items: Buffer[] = [];
  let offset = 0;

  const requireBytes = (n: number): void => {
    if (offset + n > witness.length) {
      throw new Error(
        `Malformed witness data: need ${n} byte(s) at offset ${offset}, only ${witness.length - offset} remaining`,
      );
    }
  };

  const readVarInt = (): number => {
    requireBytes(1);
    const first = witness[offset++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      requireBytes(2);
      const val = (witness[offset] | (witness[offset + 1] << 8)) >>> 0;
      offset += 2;
      return val;
    }
    if (first === 0xfe) {
      requireBytes(4);
      const val =
        (witness[offset] |
          (witness[offset + 1] << 8) |
          (witness[offset + 2] << 16) |
          (witness[offset + 3] << 24)) >>>
        0;
      offset += 4;
      return val;
    }
    // 0xff — 8-byte varint. Not used for witness sizes in practice and JS
    // numbers cannot represent all 64-bit values exactly, so reject rather
    // than risk silent truncation.
    throw new Error(
      `Malformed witness data: 8-byte varint (0xff) not supported at offset ${offset - 1}`,
    );
  };

  const count = readVarInt();
  for (let i = 0; i < count; i++) {
    const len = readVarInt();
    requireBytes(len);
    items.push(Buffer.from(witness.subarray(offset, offset + len)));
    offset += len;
  }

  if (offset !== witness.length) {
    throw new Error(
      `Malformed witness data: ${witness.length - offset} trailing byte(s) after parsing ${count} item(s)`,
    );
  }

  return items;
}

