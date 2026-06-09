/**
 * Cross-check the values WASM returns from `createPrePeginTransaction`
 * against independently-known expectations before they feed a signed
 * Bitcoin transaction or the on-chain PegIn registration.
 *
 * CLAUDE.md critical path #1: the Rust/WASM layer computes
 * `htlcValue = peginAmount + depositorClaimValue + minPeginFee` internally
 * and JS receives the outputs with no runtime validation. A doctored or
 * buggy binary that returns a different `peginAmount`, an out-of-formula
 * `htlcValue`, or a wrong `depositorClaimValue` would otherwise be committed
 * verbatim — taxing the depositor or starving the downstream tx graph of fees.
 *
 * @module primitives/psbt/assertWasmPeginSizing
 */

import {
  computeMinClaimValue,
  type PrePeginResult,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

import { MAX_REASONABLE_PEGIN_VBYTES } from "../../utils/fee/constants";
import type { ParsedOutput } from "../../utils/transaction/fundPeginTransaction";

import type { PrePeginParams } from "./pegin";

/**
 * Assert the WASM Pre-PegIn sizing result is internally consistent and
 * matches what the caller requested.
 *
 * The strong checks are pure-JS and fully independent of the WASM binary:
 * the per-HTLC `peginAmount` must equal the requested amount, array lengths
 * must match, and every value must be positive. The implied PegIn fee
 * (`htlcValue - peginAmount - depositorClaimValue`) is bounded by
 * plausibility rather than recomputed exactly, because JS↔Rust vbyte parity
 * is not a cross-stack guarantee (see {@link MAX_REASONABLE_PEGIN_VBYTES}).
 * The `depositorClaimValue` cross-check against `computeMinClaimValue` is a
 * WASM-vs-WASM consistency check (a different entry point), not an
 * independent one.
 *
 * @param result - The result returned by `createPrePeginTransaction`.
 * @param params - The parameters that were passed to build it.
 * @throws If any value is missing, non-positive, mismatched against the
 *   request, or outside the protocol formula / plausibility bounds.
 */
export async function assertWasmPeginSizing(
  result: PrePeginResult,
  params: PrePeginParams,
): Promise<void> {
  const expectedCount = params.pegInAmounts.length;

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
        `${expectedClaimValue} (numLocalChallengers=${params.numLocalChallengers}, ` +
        `numUniversalChallengers=${params.universalChallengerPubkeys.length}, ` +
        `councilQuorum=${params.councilQuorum}, councilSize=${params.councilSize}, ` +
        `feeRate=${params.feeRate}).`,
    );
  }

  const maxImpliedFee = params.minPeginFeeRate * MAX_REASONABLE_PEGIN_VBYTES;

  for (let i = 0; i < expectedCount; i++) {
    const requested = params.pegInAmounts[i];
    const peginAmount = result.peginAmounts[i];
    const htlcValue = result.htlcValues[i];

    // Amount echo (strongest, fully independent): the recorded pegin amount
    // must equal exactly what the caller requested. A mismatch is the
    // WASM-tax attack — the contract would record a doctored amount while the
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

    // Formula: htlcValue = peginAmount + depositorClaimValue + minPeginFee.
    // The implied fee must be strictly positive (the HTLC must reserve a real
    // PegIn fee) and within the plausibility bound.
    const impliedFee = htlcValue - peginAmount - result.depositorClaimValue;
    if (impliedFee <= 0n) {
      throw new Error(
        `WASM Pre-PegIn htlcValue[${i}] ${htlcValue} does not strictly cover ` +
          `peginAmount ${peginAmount} + depositorClaimValue ` +
          `${result.depositorClaimValue} + a PegIn fee (implied fee ` +
          `${impliedFee}).`,
      );
    }
    if (impliedFee > maxImpliedFee) {
      throw new Error(
        `WASM Pre-PegIn implied PegIn fee for HTLC[${i}] (${impliedFee} sat) ` +
          `exceeds the plausibility cap ${maxImpliedFee} sat ` +
          `(minPeginFeeRate=${params.minPeginFeeRate} × ` +
          `${MAX_REASONABLE_PEGIN_VBYTES} vbytes); htlcValue ${htlcValue} ` +
          `appears grossly inflated.`,
      );
    }
  }
}

/**
 * Bind the validated metadata to the bytes that actually get funded and
 * signed.
 *
 * `assertWasmPeginSizing` proves the WASM *metadata* (`htlcValues`,
 * `htlcScriptPubKeys`) matches the request and the protocol formula — but the
 * transaction the depositor funds and signs is `result.txHex`. If the encoded
 * tx carried a different HTLC output value or script than the metadata, the
 * depositor would fund a transaction whose real outputs differ from the values
 * that were cross-checked. This closes that final link: the encoded HTLC
 * outputs must equal the validated metadata.
 *
 * The WASM lays out HTLC outputs first (vouts `0..N-1`), then the optional
 * auth-anchor OP_RETURN, then the CPFP anchor — so we only compare the first
 * `htlcValues.length` outputs.
 *
 * @param outputs - Outputs parsed from the unfunded Pre-PegIn tx hex.
 * @param htlcValues - The (already value-validated) per-HTLC values.
 * @param htlcScriptPubKeys - The per-HTLC scriptPubKeys (hex).
 * @throws If the encoded outputs are too few, or any HTLC output's value or
 *   scriptPubKey disagrees with the validated metadata.
 */
export function assertEncodedHtlcOutputsMatch(
  outputs: readonly ParsedOutput[],
  htlcValues: readonly bigint[],
  htlcScriptPubKeys: readonly string[],
): void {
  if (outputs.length < htlcValues.length) {
    throw new Error(
      `Encoded Pre-PegIn tx has ${outputs.length} output(s), fewer than the ` +
        `${htlcValues.length} HTLC output(s) the cross-check validated.`,
    );
  }

  for (let i = 0; i < htlcValues.length; i++) {
    const encodedValue = BigInt(outputs[i].value);
    if (encodedValue !== htlcValues[i]) {
      throw new Error(
        `Encoded Pre-PegIn HTLC output[${i}] value ${encodedValue} does not ` +
          `match the cross-checked htlcValue ${htlcValues[i]}; the funded/signed ` +
          `tx would not pay the validated amount.`,
      );
    }

    const encodedScript = outputs[i].script.toString("hex").toLowerCase();
    const expectedScript = htlcScriptPubKeys[i].toLowerCase();
    if (encodedScript !== expectedScript) {
      throw new Error(
        `Encoded Pre-PegIn HTLC output[${i}] scriptPubKey ${encodedScript} does ` +
          `not match the cross-checked htlcScriptPubKey ${expectedScript}.`,
      );
    }
  }
}
