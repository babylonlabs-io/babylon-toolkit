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
import { Psbt, Transaction, type TxInput, type TxOutput } from "bitcoinjs-lib";
import { Buffer } from "buffer";
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
  assertPayoutFeeBandDomain,
  assertPayoutFeeInBand,
} from "./assertPayoutFeeBand";
import {
  ASSERT_PAYOUT_OUTPUT_INDEX,
  BPS_DENOMINATOR,
  DEPOSITOR_PAYOUT_INPUT_COUNT,
  MAX_PAYOUT_SCRIPT_LEN,
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
 * Parameters for building an unsigned Payout PSBT
 *
 * Payout is used in the challenge path after Assert, when the claimer proves validity.
 * Input 1 references the Assert transaction.
 */
export interface PayoutParams {
  /**
   * Vault core (tx-graph) version the vault was registered under — the
   * vault's stamped on-chain `vaultCoreVersion`. Selects which graph's
   * payout connector scripts are derived.
   */
  vaultCoreVersion: number;

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
   * Claimer's x-only BTC public key (64-char hex, no prefix). Drives role
   * inference (VP / depositor-as-claimer / VK-claimer) inside `buildPayoutPsbt`.
   */
  claimerBtcPubkey: string;

  /**
   * On-chain registered depositor payout scriptPubKey (hex, 0x optional).
   * Expected outs[0].script for VP- and depositor-claimer roles; unused for
   * VK-claimer (its outs[0].script is derived from `claimerBtcPubkey`).
   */
  registeredPayoutScriptPubKey: string;

  /**
   * VP commission in basis points (`BTCVaultRegistry.vaultProviderCommissionBps`).
   * Caps the VP-claimer outs[1].value. The protocol minimum is enforced
   * upstream; here only `0 <= bps < 10_000` is checked, for safe cap math.
   */
  commissionBps: number;

  /**
   * Tx-graph fee rate (sat/vB) the graph was built with — the version-locked
   * `offchainParams.feeRate` at the vault's stamped `offchainParamsVersion`,
   * NOT a live read. Anchors both ends of the fee band.
   */
  protocolFeeRate: bigint;

  /**
   * Security council member count from the locked offchain params version.
   * Mirrors the upstream estimator's signature; at the current model pins the
   * council occupies a single taptree leaf regardless of size, so the floor
   * is council-size-invariant — passed for forward compatibility with future
   * pinned models.
   */
  councilSize: number;
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
 * @throws If the implicit fee (inputs − outputs) is outside the fee band —
 *   below the floor or above the extended device ceiling (see
 *   {@link assertPayoutFeeInBand})
 * @throws If `protocolFeeRate`, a participant count, or `councilSize` is
 *   outside the accepted input domain (see {@link assertPayoutFeeBandDomain})
 * @throws If a non-anchor scriptPubKey length is outside `[1,
 *   {@link MAX_PAYOUT_SCRIPT_LEN}]`
 * @throws If `claimerBtcPubkey` is not VP, depositor, or a registered VK
 * @throws If payout output count, outs[0] script, outs[last] anchor value, or
 *   (VP-claimer) outs[1] commission cap do not match the protocol layout
 * @throws If `commissionBps` is not a non-negative integer below 10_000
 */
export async function buildPayoutPsbt(
  params: PayoutParams,
): Promise<PayoutPsbtResult> {
  const feeBandParams = {
    vaultCoreVersion: params.vaultCoreVersion,
    numVaultKeepers: params.vaultKeeperBtcPubkeys.length,
    numUniversalChallengers: params.universalChallengerBtcPubkeys.length,
    councilSize: params.councilSize,
    protocolFeeRate: params.protocolFeeRate,
  };
  assertPayoutFeeBandDomain(feeBandParams);

  const payoutTx = Transaction.fromHex(stripHexPrefix(params.payoutTxHex));
  const peginTx = Transaction.fromHex(stripHexPrefix(params.peginTxHex));
  const assertTx = Transaction.fromHex(stripHexPrefix(params.assertTxHex));

  if (payoutTx.ins.length !== DEPOSITOR_PAYOUT_INPUT_COUNT) {
    throw new Error(
      `Payout transaction must have exactly ${DEPOSITOR_PAYOUT_INPUT_COUNT} ` +
        `inputs, got ${payoutTx.ins.length}`,
    );
  }
  const peginPrevOut = requirePrevOut(
    payoutTx.ins[0],
    0,
    peginTx,
    "PegIn",
    PEGIN_VAULT_OUTPUT_INDEX,
  );
  const assertPrevOut = requirePrevOut(
    payoutTx.ins[1],
    1,
    assertTx,
    "Assert",
    ASSERT_PAYOUT_OUTPUT_INDEX,
  );
  // Assert:0's value is deliberately NOT validated: the taproot sighash
  // commits to input 1's amount and outpoint, so a misstated value yields a
  // signature invalid against the real Assert tx — nothing to protect. (The
  // device's ==546 pin here is the known-buggy firmware behavior, Q15.)

  // Per-role output validation — blocks an extra attacker output or value
  // routed into a non-payout slot. Returns the layout-trusted script lengths
  // the fee band consumes.
  const { out0Len, out1Len } = assertPayoutOutputLayout(
    payoutTx,
    peginPrevOut.value,
    params,
  );

  const inputValueSats = peginPrevOut.value + assertPrevOut.value;
  let outputValueSats = 0;
  for (const out of payoutTx.outs) outputValueSats += out.value;
  if (outputValueSats > inputValueSats) {
    throw new Error(
      `Payout outputs (${outputValueSats} sats) exceed inputs ` +
        `(${inputValueSats} sats); invalid transaction.`,
    );
  }
  const implicitFeeSats = inputValueSats - outputValueSats;
  await assertPayoutFeeInBand(feeBandParams, {
    implicitFeeSats,
    out0Len,
    out1Len,
  });

  // Only assembly needs the WASM-derived script — derive it after the
  // transaction has passed every validation gate.
  const payoutConnector = await createPayoutScript({
    vaultCoreVersion: params.vaultCoreVersion,
    depositor: params.depositorBtcPubkey,
    vaultProvider: params.vaultProviderBtcPubkey,
    vaultKeepers: params.vaultKeeperBtcPubkeys,
    universalChallengers: params.universalChallengerBtcPubkeys,
    timelockPegin: params.timelockPegin,
    network: params.network,
  });

  return {
    psbtHex: assemblePayoutPsbt(
      payoutTx,
      peginPrevOut,
      assertPrevOut,
      payoutConnector,
    ),
  };
}

/**
 * Verify `payoutTx.ins[inputIndex]` spends `parentTx:expectedVout` (both txid
 * AND vout — the vout is the input-side anchor that prevents a malicious VP
 * from binding the depositor's signature to a different output of the same
 * parent) and return the referenced previous output.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
function requirePrevOut(
  input: TxInput,
  inputIndex: number,
  parentTx: Transaction,
  parentLabel: string,
  expectedVout: number,
): TxOutput {
  const inputTxid = uint8ArrayToHex(
    new Uint8Array(input.hash).slice().reverse(),
  );
  const parentTxid = parentTx.getId();
  if (inputTxid !== parentTxid || input.index !== expectedVout) {
    throw new Error(
      `Input ${inputIndex} must spend ${parentLabel}:${expectedVout}. ` +
        `Expected ${parentTxid}:${expectedVout}, got ${inputTxid}:${input.index}`,
    );
  }
  const prevOut = parentTx.outs[input.index];
  if (!prevOut) {
    throw new Error(
      `Previous output not found for input ${inputIndex} ` +
        `(txid: ${inputTxid}, index: ${input.index})`,
    );
  }
  return prevOut;
}

/**
 * Assemble the unsigned PSBT from the validated payout transaction.
 *
 * IMPORTANT: For Taproot SIGHASH_DEFAULT (0x00), the sighash commits to ALL
 * inputs' prevouts, not just the one being signed — both inputs must be in
 * the PSBT so the wallet computes the sighash the VP expects.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
function assemblePayoutPsbt(
  payoutTx: Transaction,
  peginPrevOut: TxOutput,
  assertPrevOut: TxOutput,
  payoutConnector: { payoutScript: string; payoutControlBlock: string },
): string {
  const psbt = new Psbt();
  psbt.setVersion(payoutTx.version);
  psbt.setLocktime(payoutTx.locktime);

  const [input0, input1] = payoutTx.ins;

  // Input 0: depositor signs via Taproot script path — carries tapLeafScript.
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
        script: Buffer.from(hexToUint8Array(payoutConnector.payoutScript)),
        controlBlock: Buffer.from(
          hexToUint8Array(payoutConnector.payoutControlBlock),
        ),
      },
    ],
    tapInternalKey: Buffer.from(tapInternalPubkey),
    // sighashType omitted - defaults to SIGHASH_DEFAULT (0x00) for Taproot
  });

  // Input 1: from Assert — witnessUtxo only (in sighash, not signed by the
  // depositor), so no tapLeafScript.
  psbt.addInput({
    hash: input1.hash,
    index: input1.index,
    sequence: input1.sequence,
    witnessUtxo: {
      script: assertPrevOut.script,
      value: assertPrevOut.value,
    },
  });

  for (const output of payoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}

/**
 * Validate a payout transaction's output structure for the claimer's role,
 * keyed on `claimerBtcPubkey`. Pins per role: `outs.length`, `outs[0].script`,
 * `outs[last].value` (anchor dust), and (VP-claimer) `outs[1].value` capped at
 * `floor(peginValue × commissionBps / 10_000)`. Canonical layouts: VP-claimer
 * = [payout, commission, anchor]; depositor/VK-claimer = [payout, anchor].
 *
 * `outs[1].script` and `outs[last].script` are intentionally not pinned: the
 * value pins above bound depositor exposure regardless of where those outputs
 * are sent, so the value pins — not script pins — are load-bearing.
 *
 * Returns the layout-trusted non-anchor script lengths for the fee band:
 * `out0Len` from the pinned outs[0] script (registered payout script, or
 * derived BIP-86 for the VK-claimer role — see #2150 Stage 6 for the pending
 * registered-script switch); `out1Len` measured from the deliberately
 * unpinned VP-claimer commission output, `undefined` for the other roles.
 * Both are rejected outside the contract's registration cap `[1, 128]`.
 *
 * @internal Helper invoked by {@link buildPayoutPsbt}.
 */
function assertPayoutOutputLayout(
  payoutTx: Transaction,
  peginValueSats: number,
  params: PayoutParams,
): { out0Len: number; out1Len: number | undefined } {
  const {
    claimerBtcPubkey,
    vaultProviderBtcPubkey,
    depositorBtcPubkey,
    vaultKeeperBtcPubkeys,
    registeredPayoutScriptPubKey,
    commissionBps,
  } = params;

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
      (peginValueSats * commissionBps) / BPS_DENOMINATOR,
    );
    if (payoutTx.outs[1].value > maxCommissionSats) {
      throw new Error(
        `Payout VP commission (out 1) value ${payoutTx.outs[1].value} sats ` +
          `exceeds cap ${maxCommissionSats} sats ` +
          `(${commissionBps} bps of peginValue=${peginValueSats})`,
      );
    }
  }

  const out0Len = expectedOut0Script.length;
  if (out0Len === 0 || out0Len > MAX_PAYOUT_SCRIPT_LEN) {
    throw new Error(
      `Payout receiver scriptPubKey length ${out0Len} is outside the ` +
        `contract's registration cap [1, ${MAX_PAYOUT_SCRIPT_LEN}]; ` +
        `refusing to sign payout.`,
    );
  }
  const out1Len =
    role === "vp-claimer" ? payoutTx.outs[1].script.length : undefined;
  if (
    out1Len !== undefined &&
    (out1Len === 0 || out1Len > MAX_PAYOUT_SCRIPT_LEN)
  ) {
    throw new Error(
      `Payout commission scriptPubKey length ${out1Len} is outside the ` +
        `contract's registration cap [1, ${MAX_PAYOUT_SCRIPT_LEN}]; ` +
        `refusing to sign payout.`,
    );
  }

  return { out0Len, out1Len };
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
