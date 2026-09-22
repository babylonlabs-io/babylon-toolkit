/**
 * Binding between the three transactions a delegated claim signs in
 * sequence: Assert must spend Claim:0, and the Payout's Assert-connector
 * input must spend Assert:0 — the Assert that is being signed, not another
 * one the graph might carry.
 *
 * btc-vault's `check_assert_spends_claim` covers the first half when the
 * Claim is finalized; nothing covered the second half until here. The
 * signatures are collected once and cannot be re-collected, so a pairing
 * mismatch found later leaves a signed Assert the signed Payout can never
 * spend.
 *
 * @module services/delegated-claim/assertBinding
 */

import { Psbt, Transaction } from "bitcoinjs-lib";

const ASSERT_CLAIM_INPUT = 0;
const CLAIM_CONNECTOR_VOUT = 0;
const PAYOUT_ASSERT_INPUT = 1;
const ASSERT_CONNECTOR_VOUT = 0;

/** @experimental */
export class AssertBindingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AssertBindingError";
  }
}

/** @experimental */
export interface AssertAssertBindsClaimAndPayoutParams {
  claimPsbtBase64: string;
  assertPsbtBase64: string;
  payoutClaimerPsbtBase64: string;
}

function parse(label: string, psbtBase64: string): Psbt {
  try {
    return Psbt.fromBase64(psbtBase64);
  } catch (cause) {
    throw new AssertBindingError(`${label} PSBT cannot be parsed.`, { cause });
  }
}

/** Internal-order hash of a PSBT's unsigned transaction. */
function unsignedTxHash(psbt: Psbt): Buffer {
  return Transaction.fromBuffer(psbt.data.globalMap.unsignedTx.toBuffer()).getHash();
}

function assertInputSpends(
  label: string,
  psbt: Psbt,
  inputIndex: number,
  expectedHash: Buffer,
  expectedVout: number,
  target: string,
): void {
  const input = psbt.txInputs[inputIndex];
  if (!input) {
    throw new AssertBindingError(`${label} PSBT has no input ${inputIndex}.`);
  }
  if (!input.hash.equals(expectedHash) || input.index !== expectedVout) {
    throw new AssertBindingError(
      `${label} input ${inputIndex} does not spend ${target}: the graph pairs this ${label} with a different transaction.`,
    );
  }
}

/**
 * @throws {AssertBindingError} When Assert input 0 is not Claim:0, or Payout
 *         input 1 is not Assert:0.
 * @experimental
 */
export function assertAssertBindsClaimAndPayout(
  params: AssertAssertBindsClaimAndPayoutParams,
): void {
  const claim = parse("Claim", params.claimPsbtBase64);
  const assert = parse("Assert", params.assertPsbtBase64);
  const payout = parse("Payout", params.payoutClaimerPsbtBase64);

  assertInputSpends("Assert", assert, ASSERT_CLAIM_INPUT, unsignedTxHash(claim), CLAIM_CONNECTOR_VOUT, "Claim:0");
  assertInputSpends("Payout", payout, PAYOUT_ASSERT_INPUT, unsignedTxHash(assert), ASSERT_CONNECTOR_VOUT, "Assert:0");
}
