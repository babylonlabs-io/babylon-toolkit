/**
 * Cross-check the values and outputs WASM returns from `createPrePeginTransaction`
 * against independently-known expectations before they feed a signed
 * Bitcoin transaction or the on-chain PegIn registration.
 *
 * CLAUDE.md critical path #1: the Rust/WASM layer computes
 * `htlcValue = peginAmount + depositorClaimValue + p2aAnchorValue +
 * minPeginFee` internally (the anchor term is 0 for graph versions without a
 * P2A anchor, 240 sats for v2/v3) and JS receives the outputs with no runtime
 * validation. A doctored or buggy binary that returns a different
 * `peginAmount`, an out-of-formula `htlcValue`, or a wrong
 * `depositorClaimValue` would otherwise be committed verbatim - taxing the
 * depositor or starving the downstream tx graph of fees.
 *
 * @module primitives/psbt/assertWasmPeginSizing
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { script as bscript, opcodes, payments } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import {
  computeMinClaimValue,
  computeMinPeginFee,
  peginP2aAnchorOutput,
  tapInternalPubkey,
  type PrePeginResult,
} from "../../wasm";

import {
  MAX_REASONABLE_PEGIN_VBYTES,
  peginOutputCount,
} from "../../utils/fee/constants";
import type { ParsedOutput } from "../../utils/transaction/fundPeginTransaction";
import {
  TAPSCRIPT_LEAF_VERSION,
  assertEccInitialized,
  deriveBip86ScriptPubKeyHex,
  stripHexPrefix,
} from "../utils/bitcoin";

import {
  PRE_PEGIN_AUTH_OUTPUT_VALUE_SATS,
  PRE_PEGIN_AUTH_SCRIPT_PREFIX,
  PRE_PEGIN_CPFP_VALUE_SATS,
  PRE_PEGIN_MIN_HTLC_OUTPUT_COUNT,
  PRE_PEGIN_TX_LOCKTIME,
  PRE_PEGIN_TX_VERSION,
} from "./constants";
import type { PrePeginParams } from "./pegin";

const PREIMAGE_LENGTH_BYTES = 32;
const MAX_U16 = 0xffff;
const SEC1_EVEN_Y_PREFIX = 0x02;

type ScriptChunk = number | Buffer;

type PrePeginHtlcParams = Pick<
  PrePeginParams,
  | "depositorPubkey"
  | "vaultProviderPubkey"
  | "vaultKeeperPubkeys"
  | "universalChallengerPubkeys"
  | "timelockRefund"
>;

interface ExpectedPrePeginHtlc {
  hashlockScript: Buffer;
  hashlockControlBlock: Buffer;
  refundScript: Buffer;
  refundControlBlock: Buffer;
  scriptPubKey: Buffer;
  tapMerkleRoot: Buffer;
}

function normalizeXOnlyKey(value: string, label: string): string {
  const key = stripHexPrefix(value).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) {
    throw new Error(`${label} must be a 32-byte x-only public key.`);
  }

  try {
    secp256k1.Point.fromBytes(
      Buffer.concat([
        Buffer.from([SEC1_EVEN_Y_PREFIX]),
        Buffer.from(key, "hex"),
      ]),
    );
  } catch {
    throw new Error(`${label} is not a secp256k1 x-coordinate.`);
  }

  return key;
}

function normalizeKeyGroup(values: readonly string[], label: string): string[] {
  if (values.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  const keys = values
    .map((value, index) => normalizeXOnlyKey(value, `${label}[${index}]`))
    .sort();
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${label} must not contain duplicate keys.`);
  }
  return keys;
}

function nOfNChunks(keys: readonly string[], verify: boolean): ScriptChunk[] {
  const chunks: ScriptChunk[] = [];
  keys.forEach((key, index) => {
    chunks.push(
      Buffer.from(key, "hex"),
      index === 0 ? opcodes.OP_CHECKSIG : opcodes.OP_CHECKSIGADD,
    );
  });
  chunks.push(
    bscript.number.encode(keys.length),
    verify ? opcodes.OP_NUMEQUALVERIFY : opcodes.OP_NUMEQUAL,
  );
  return chunks;
}

/**
 * Derive the canonical Pre-PegIn HTLC without using vault WASM output.
 */
export function deriveExpectedPrePeginHtlc(
  params: PrePeginHtlcParams,
  hashlock: string,
): ExpectedPrePeginHtlc {
  assertEccInitialized();

  const depositor = normalizeXOnlyKey(
    params.depositorPubkey,
    "depositorPubkey",
  );
  const vaultProvider = normalizeXOnlyKey(
    params.vaultProviderPubkey,
    "vaultProviderPubkey",
  );
  const vaultKeepers = normalizeKeyGroup(
    params.vaultKeeperPubkeys,
    "vaultKeeperPubkeys",
  );
  const universalChallengers = normalizeKeyGroup(
    params.universalChallengerPubkeys,
    "universalChallengerPubkeys",
  );
  const cleanHashlock = stripHexPrefix(hashlock).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanHashlock)) {
    throw new Error("hashlock must be 32 bytes.");
  }
  if (
    !Number.isInteger(params.timelockRefund) ||
    params.timelockRefund < 1 ||
    params.timelockRefund > MAX_U16
  ) {
    throw new Error("timelockRefund must be an integer from 1 to 65535.");
  }

  const hashlockScript = bscript.compile([
    opcodes.OP_SIZE,
    bscript.number.encode(PREIMAGE_LENGTH_BYTES),
    opcodes.OP_EQUALVERIFY,
    opcodes.OP_SHA256,
    Buffer.from(cleanHashlock, "hex"),
    opcodes.OP_EQUALVERIFY,
    Buffer.from(depositor, "hex"),
    opcodes.OP_CHECKSIGVERIFY,
    Buffer.from(vaultProvider, "hex"),
    opcodes.OP_CHECKSIGVERIFY,
    ...nOfNChunks(vaultKeepers, true),
    ...nOfNChunks(universalChallengers, false),
  ]);
  const refundScript = bscript.compile([
    Buffer.from(depositor, "hex"),
    opcodes.OP_CHECKSIGVERIFY,
    bscript.number.encode(params.timelockRefund),
    opcodes.OP_CHECKSEQUENCEVERIFY,
  ]);
  const scriptTree: [
    { output: Buffer; version: number },
    { output: Buffer; version: number },
  ] = [
    { output: hashlockScript, version: TAPSCRIPT_LEAF_VERSION },
    { output: refundScript, version: TAPSCRIPT_LEAF_VERSION },
  ];
  const { hash, output, witness } = payments.p2tr({
    internalPubkey: Buffer.from(tapInternalPubkey),
    scriptTree,
    redeem: {
      output: hashlockScript,
      redeemVersion: TAPSCRIPT_LEAF_VERSION,
    },
  });
  const hashlockControlBlock = witness?.[witness.length - 1];
  const refundPayment = payments.p2tr({
    internalPubkey: Buffer.from(tapInternalPubkey),
    scriptTree,
    redeem: {
      output: refundScript,
      redeemVersion: TAPSCRIPT_LEAF_VERSION,
    },
  });
  const refundControlBlock =
    refundPayment.witness?.[refundPayment.witness.length - 1];
  if (!hash || !output || !hashlockControlBlock || !refundControlBlock) {
    throw new Error("Failed to derive the expected Pre-PegIn HTLC output.");
  }

  return {
    hashlockScript,
    hashlockControlBlock,
    refundScript,
    refundControlBlock,
    scriptPubKey: output,
    tapMerkleRoot: hash,
  };
}

/**
 * Assert the WASM Pre-PegIn sizing result is internally consistent and
 * matches what the caller requested.
 *
 * Two layers of checks. Pure-JS, binary-INDEPENDENT: the per-HTLC
 * `peginAmount` must echo the requested amount, array lengths must match,
 * every value must be positive, and the implied per-HTLC reserve
 * (`htlcValue - peginAmount - depositorClaimValue`) must be strictly
 * positive and under the plausibility cap
 * ({@link MAX_REASONABLE_PEGIN_VBYTES}). WASM-vs-WASM consistency: the
 * reserve must also EXACTLY equal `computeMinPeginFee(version, ...) +
 * p2aAnchorValue(version)` (like the `computeMinClaimValue` check) -
 * exact, but both sides come from the same binary, which is why the
 * independent bounds above are kept alongside it.
 *
 * The resume rebuild (`deposit-terms/rebuildDepositTermsCore.ts`) mirrors these
 * bounds (positivity + reserve band) - keep the two in sync when editing.
 *
 * @param result - The result returned by `createPrePeginTransaction`.
 * @param params - The parameters that were passed to build it.
 * @returns The independently computed `minPeginFee` this function already
 *   asserted against `result`'s implied reserve - callers that need the
 *   value should reuse this instead of recomputing it.
 * @throws If any value is missing, non-positive, mismatched against the
 *   request, or outside the protocol formula.
 */
export async function assertWasmPeginSizing(
  result: PrePeginResult,
  params: PrePeginParams,
): Promise<bigint> {
  const expectedCount = params.pegInAmounts.length;

  if (params.hashlocks.length !== expectedCount) {
    throw new Error(
      `Pre-PegIn has ${params.hashlocks.length} hashlock(s), expected ` +
        `${expectedCount} (one per requested deposit).`,
    );
  }

  // Count: every parallel array must carry exactly one entry per requested
  // deposit, otherwise the per-HTLC indexing downstream is meaningless.
  if (result.htlcValues.length !== expectedCount) {
    throw new Error(
      `WASM Pre-PegIn returned ${result.htlcValues.length} HTLC value(s), ` +
        `expected ${expectedCount} (one per requested deposit).`,
    );
  }
  if (
    result.peginAmounts.length !== expectedCount ||
    result.htlcScriptPubKeys.length !== expectedCount ||
    result.htlcAddresses.length !== expectedCount
  ) {
    throw new Error(
      `WASM Pre-PegIn returned mismatched array lengths ` +
        `(htlcValues=${result.htlcValues.length}, ` +
        `peginAmounts=${result.peginAmounts.length}, ` +
        `htlcScriptPubKeys=${result.htlcScriptPubKeys.length}, ` +
        `htlcAddresses=${result.htlcAddresses.length}); ` +
        `expected ${expectedCount} each.`,
    );
  }

  // depositorClaimValue: positivity + WASM-vs-WASM consistency. Sized by the
  // tx-graph `feeRate` (see PrePeginParams.feeRate), so the standalone
  // `computeMinClaimValue` must reproduce the constructor's internal value.
  if (result.depositorClaimValue <= 0n) {
    throw new Error(
      `WASM Pre-PegIn returned non-positive depositorClaimValue ` +
        `${result.depositorClaimValue}; expected > 0.`,
    );
  }
  const expectedClaimValue = await computeMinClaimValue(
    // Must price the same graph version the builder constructed.
    params.vaultCoreVersion,
    params.numLocalChallengers,
    params.universalChallengerPubkeys.length,
    params.councilQuorum,
    params.councilSize,
    params.feeRate,
  );
  if (result.depositorClaimValue !== expectedClaimValue) {
    throw new Error(
      `WASM Pre-PegIn depositorClaimValue ${result.depositorClaimValue} does ` +
        `not match the independently computed minimum claim value ` +
        `${expectedClaimValue} (vaultCoreVersion=${params.vaultCoreVersion}, ` +
        `numLocalChallengers=${params.numLocalChallengers}, ` +
        `numUniversalChallengers=${params.universalChallengerPubkeys.length}, ` +
        `councilQuorum=${params.councilQuorum}, councilSize=${params.councilSize}, ` +
        `feeRate=${params.feeRate}).`,
    );
  }

  // The per-HTLC reserve above pegin+claim decomposes into the version's
  // P2A anchor value (0 when the version has no anchor) plus the exact
  // minimum PegIn fee. Both terms are Rust-model values fetched through
  // independent WASM entry points; the builder must reproduce their sum.
  // The Rust fee model sizes the PegIn input witness from the vault keeper
  // and universal challenger counts (btc-vault `PegInTx::estimate_vsize`).
  const anchor = await peginP2aAnchorOutput(params.vaultCoreVersion);
  const anchorValue = anchor?.value ?? 0n;
  const expectedPeginFee = await computeMinPeginFee(
    params.vaultCoreVersion,
    params.vaultKeeperPubkeys.length,
    params.universalChallengerPubkeys.length,
    params.minPeginFeeRate,
  );
  const expectedReserve = expectedPeginFee + anchorValue;
  // Binary-INDEPENDENT plausibility cap: the exact identity below compares
  // WASM against WASM, so a consistently doctored binary could satisfy it
  // with an inflated reserve. This pure-JS bound (max standard-relay tx
  // vbytes x the caller's fee rate) caps how much a compromised binary can
  // burn.
  const maxImpliedReserve =
    params.minPeginFeeRate * MAX_REASONABLE_PEGIN_VBYTES;

  for (let i = 0; i < expectedCount; i++) {
    const requested = params.pegInAmounts[i];
    const peginAmount = result.peginAmounts[i];
    const htlcValue = result.htlcValues[i];

    // Amount echo (strongest, fully independent): the recorded pegin amount
    // must equal exactly what the caller requested. A mismatch is the
    // WASM-tax attack - the contract would record a doctored amount while the
    // depositor's wallet funds the original, and the difference is a
    // WASM-controlled tax.
    if (peginAmount !== requested) {
      throw new Error(
        `WASM Pre-PegIn peginAmount[${i}] ${peginAmount} does not match the ` +
          `requested amount ${requested}; refusing to build a tx whose ` +
          `recorded amount differs from the depositor's request.`,
      );
    }
    if (peginAmount <= 0n) {
      throw new Error(
        `WASM Pre-PegIn peginAmount[${i}] is non-positive (${peginAmount}); ` +
          `expected > 0.`,
      );
    }
    if (htlcValue <= 0n) {
      throw new Error(
        `WASM Pre-PegIn htlcValue[${i}] is non-positive (${htlcValue}); ` +
          `expected > 0.`,
      );
    }

    // Formula: htlcValue = peginAmount + depositorClaimValue +
    // p2aAnchorValue + minPeginFee. The reserve must match exactly - a
    // shortfall starves the PegIn's fee/anchor, an excess locks sats
    // irrecoverably in the HTLC.
    const impliedReserve = htlcValue - peginAmount - result.depositorClaimValue;
    // Independent JS-side bounds first (see maxImpliedReserve above): the
    // reserve must be strictly positive (a zero reserve starves the PegIn
    // of its fee) and plausibly sized, regardless of what the binary's own
    // reference entry points claim.
    if (impliedReserve <= 0n) {
      throw new Error(
        `WASM Pre-PegIn htlcValue[${i}] ${htlcValue} does not strictly ` +
          `cover peginAmount ${peginAmount} + depositorClaimValue ` +
          `${result.depositorClaimValue} + a PegIn reserve (implied ` +
          `reserve ${impliedReserve}).`,
      );
    }
    if (impliedReserve > maxImpliedReserve) {
      throw new Error(
        `WASM Pre-PegIn implied reserve for HTLC[${i}] (${impliedReserve} ` +
          `sat) exceeds the plausibility cap ${maxImpliedReserve} sat ` +
          `(minPeginFeeRate=${params.minPeginFeeRate} × ` +
          `${MAX_REASONABLE_PEGIN_VBYTES} vbytes); htlcValue ${htlcValue} ` +
          `appears grossly inflated.`,
      );
    }
    if (impliedReserve !== expectedReserve) {
      throw new Error(
        `WASM Pre-PegIn htlcValue[${i}] ${htlcValue} implies a PegIn ` +
          `fee+anchor reserve of ${impliedReserve} sat, expected exactly ` +
          `${expectedReserve} sat (minPeginFee ${expectedPeginFee} + ` +
          `p2aAnchor ${anchorValue} for vaultCoreVersion ` +
          `${params.vaultCoreVersion}, vaultKeepers=` +
          `${params.vaultKeeperPubkeys.length}, universalChallengers=` +
          `${params.universalChallengerPubkeys.length}, minPeginFeeRate=` +
          `${params.minPeginFeeRate}).`,
      );
    }
  }

  return expectedPeginFee;
}

/**
 * A funded Pre-PegIn's HTLC outputs disagree with the expected value or
 * scriptPubKey.
 *
 * Typed so a caller trialling several parameter sets can tell "the transaction
 * definitively does not match these parameters" - a genuine, informative
 * rejection - from "evaluating this parameter set failed", which says nothing
 * about the transaction and must not be counted as a rejection. Without the
 * distinction an incidental failure on the true parameter set silently removes
 * it from consideration and a look-alike wins.
 */
export class HtlcOutputMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HtlcOutputMismatchError";
  }
}

/**
 * Bind the validated metadata to the bytes that actually get funded and
 * signed.
 *
 * `assertWasmPeginSizing` proves the WASM values match the request and the
 * protocol formula. It also checks the script metadata count. The transaction
 * the depositor funds and signs is `result.txHex`. If the encoded tx carried a
 * different HTLC output value or script than the metadata, the depositor would
 * fund a transaction whose outputs differ from the checked metadata. This
 * function closes that link.
 *
 * The WASM lays out HTLC outputs first (vouts `0..N-1`), then the optional
 * auth-anchor OP_RETURN, then the CPFP anchor - so we only compare the first
 * `htlcValues.length` outputs.
 *
 * @param outputs - Outputs parsed from the unfunded Pre-PegIn tx hex.
 * @param htlcValues - The (already value-validated) per-HTLC values.
 * @param htlcScriptPubKeys - The per-HTLC scriptPubKeys (hex).
 * @throws {HtlcOutputMismatchError} If the encoded outputs are too few, or any
 *   HTLC output's value or scriptPubKey disagrees with the validated metadata.
 */
export function assertEncodedHtlcOutputsMatch(
  outputs: readonly ParsedOutput[],
  htlcValues: readonly bigint[],
  htlcScriptPubKeys: readonly string[],
): void {
  if (outputs.length < htlcValues.length) {
    throw new HtlcOutputMismatchError(
      `Encoded Pre-PegIn tx has ${outputs.length} output(s), fewer than the ` +
        `${htlcValues.length} HTLC output(s) the cross-check validated.`,
    );
  }

  for (let i = 0; i < htlcValues.length; i++) {
    const encodedValue = BigInt(outputs[i].value);
    if (encodedValue !== htlcValues[i]) {
      throw new HtlcOutputMismatchError(
        `Encoded Pre-PegIn HTLC output[${i}] value ${encodedValue} does not ` +
          `match the cross-checked htlcValue ${htlcValues[i]}; the funded/signed ` +
          `tx would not pay the validated amount.`,
      );
    }

    const encodedScript = outputs[i].script.toString("hex").toLowerCase();
    const expectedScript = htlcScriptPubKeys[i].toLowerCase();
    if (encodedScript !== expectedScript) {
      throw new HtlcOutputMismatchError(
        `Encoded Pre-PegIn HTLC output[${i}] scriptPubKey ${encodedScript} does ` +
          `not match the cross-checked htlcScriptPubKey ${expectedScript}.`,
      );
    }
  }
}

/**
 * Validate the unfunded Pre-PegIn protocol output layout.
 *
 * This check rejects a wrong output count, a wrong auth or CPFP output, and an
 * HTLC output that does not match the request. Run it before value summing,
 * UTXO selection, or signing.
 */
export function assertUnfundedPrePeginOutputLayout(
  outputs: readonly ParsedOutput[],
  htlcValues: readonly bigint[],
  htlcScriptPubKeys: readonly string[],
  params: PrePeginParams,
  authAnchorHash: string | undefined,
  version: number,
  locktime: number,
): void {
  if (version !== PRE_PEGIN_TX_VERSION) {
    throw new Error(
      `WASM Pre-PegIn transaction version ${version}; expected ` +
        `${PRE_PEGIN_TX_VERSION}.`,
    );
  }
  if (locktime !== PRE_PEGIN_TX_LOCKTIME) {
    throw new Error(
      `WASM Pre-PegIn transaction locktime ${locktime}; expected ` +
        `${PRE_PEGIN_TX_LOCKTIME}.`,
    );
  }

  if (htlcValues.length < PRE_PEGIN_MIN_HTLC_OUTPUT_COUNT) {
    throw new Error(
      `WASM Pre-PegIn output layout has ${htlcValues.length} HTLC output(s); ` +
        `expected at least ${PRE_PEGIN_MIN_HTLC_OUTPUT_COUNT}.`,
    );
  }

  const authOutputIndex = htlcValues.length;
  const cpfpOutputIndex =
    authOutputIndex + Number(authAnchorHash !== undefined);
  const expectedCount = peginOutputCount(
    htlcValues.length,
    authAnchorHash !== undefined,
  );
  if (outputs.length !== expectedCount) {
    throw new Error(
      `WASM Pre-PegIn output layout has ${outputs.length} output(s); ` +
        `expected exactly ${expectedCount}.`,
    );
  }

  assertEncodedHtlcOutputsMatch(outputs, htlcValues, htlcScriptPubKeys);

  for (let i = 0; i < htlcValues.length; i++) {
    const expectedScript = deriveExpectedPrePeginHtlc(
      params,
      params.hashlocks[i],
    ).scriptPubKey;
    if (!outputs[i].script.equals(expectedScript)) {
      throw new HtlcOutputMismatchError(
        `Pre-PegIn HTLC output[${i}] does not match the independently ` +
          `derived scriptPubKey.`,
      );
    }
  }

  if (authAnchorHash !== undefined) {
    const authOutput = outputs[authOutputIndex];
    if (authOutput.value !== PRE_PEGIN_AUTH_OUTPUT_VALUE_SATS) {
      throw new Error(
        `WASM Pre-PegIn auth output[${authOutputIndex}] value ` +
          `${authOutput.value} sat; expected exactly ` +
          `${PRE_PEGIN_AUTH_OUTPUT_VALUE_SATS} sat.`,
      );
    }

    const encodedAuthScript = authOutput.script.toString("hex").toLowerCase();
    const expectedAuthScript =
      PRE_PEGIN_AUTH_SCRIPT_PREFIX + authAnchorHash.toLowerCase();
    if (encodedAuthScript !== expectedAuthScript) {
      throw new Error(
        `WASM Pre-PegIn auth output[${authOutputIndex}] scriptPubKey ` +
          `${encodedAuthScript}; expected ${expectedAuthScript}.`,
      );
    }
  }

  const cpfpOutput = outputs[cpfpOutputIndex];
  if (cpfpOutput.value !== PRE_PEGIN_CPFP_VALUE_SATS) {
    throw new Error(
      `WASM Pre-PegIn CPFP output[${cpfpOutputIndex}] value ` +
        `${cpfpOutput.value} sat; expected exactly ` +
        `${PRE_PEGIN_CPFP_VALUE_SATS} sat.`,
    );
  }

  const encodedCpfpScript = cpfpOutput.script.toString("hex").toLowerCase();
  const expectedCpfpScript = stripHexPrefix(
    deriveBip86ScriptPubKeyHex(params.depositorPubkey),
  ).toLowerCase();
  if (encodedCpfpScript !== expectedCpfpScript) {
    throw new Error(
      `WASM Pre-PegIn CPFP output[${cpfpOutputIndex}] scriptPubKey ` +
        `${encodedCpfpScript}; expected depositor BIP-86 script ` +
        `${expectedCpfpScript}.`,
    );
  }
}
