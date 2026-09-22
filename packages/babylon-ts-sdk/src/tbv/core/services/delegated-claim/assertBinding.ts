/**
 * Binding between the three transactions a delegated claim signs in
 * sequence: Assert must spend Claim:0, the Payout's Assert-connector input
 * must spend Assert:0 — the Assert that is being signed, not another one the
 * graph might carry — and the Payout's Vault-UTXO input must spend output 0
 * of the PegIn the Claim spends (btc-vault `payout.rs:66,107` and
 * `claim.rs:120` @ ac4954e7), so the Payout the depositor signs pays out
 * this vault and no other.
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

import {
  ASSERT_CLAIM_INPUT_INDEX,
  ASSERT_PAYOUT_OUTPUT_INDEX,
  CLAIM_CONNECTOR_OUTPUT_INDEX,
  CLAIM_PEGIN_INPUT_INDEX,
  PAYOUT_ASSERT_INPUT_INDEX,
  PAYOUT_PEGIN_INPUT_INDEX,
  PEGIN_VAULT_OUTPUT_INDEX,
} from "../../primitives/psbt/constants";

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

/** Internal-order prevout hash of one input, present or not. */
function inputHash(label: string, psbt: Psbt, inputIndex: number): Buffer {
  const input = psbt.txInputs[inputIndex];
  if (!input) {
    throw new AssertBindingError(`${label} PSBT has no input ${inputIndex}.`);
  }
  return input.hash;
}

/** Internal-order hash of a PSBT's unsigned transaction. */
function unsignedTxHash(psbt: Psbt): Buffer {
  return Transaction.fromBuffer(
    psbt.data.globalMap.unsignedTx.toBuffer(),
  ).getHash();
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
 * @throws {AssertBindingError} When Assert input 0 is not Claim:0, Payout
 *         input 1 is not Assert:0, or Payout input 0 is not output 0 of the
 *         PegIn the Claim spends.
 * @experimental
 */
export function assertAssertBindsClaimAndPayout(
  params: AssertAssertBindsClaimAndPayoutParams,
): void {
  const claim = parse("Claim", params.claimPsbtBase64);
  const assert = parse("Assert", params.assertPsbtBase64);
  const payout = parse("Payout", params.payoutClaimerPsbtBase64);

  assertInputSpends(
    "Assert",
    assert,
    ASSERT_CLAIM_INPUT_INDEX,
    unsignedTxHash(claim),
    CLAIM_CONNECTOR_OUTPUT_INDEX,
    "Claim:0",
  );
  assertInputSpends(
    "Payout",
    payout,
    PAYOUT_ASSERT_INPUT_INDEX,
    unsignedTxHash(assert),
    ASSERT_PAYOUT_OUTPUT_INDEX,
    "Assert:0",
  );
  assertInputSpends(
    "Payout",
    payout,
    PAYOUT_PEGIN_INPUT_INDEX,
    inputHash("Claim", claim, CLAIM_PEGIN_INPUT_INDEX),
    PEGIN_VAULT_OUTPUT_INDEX,
    "this vault's PegIn:0",
  );
}
