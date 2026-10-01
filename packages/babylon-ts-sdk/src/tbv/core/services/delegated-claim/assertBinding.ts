/**
 * Binding between the three transactions a delegated claim signs in
 * sequence: Assert must spend Claim:0 and declare it as its prevout, the
 * Payout's Assert-connector input must spend Assert:0 — the Assert that is
 * being signed, not another one the graph might carry — and the Payout's
 * Vault-UTXO input must spend output 0 of the PegIn the Claim spends
 * (btc-vault `payout.rs:66,107` and `claim.rs:120` @ ac4954e7), so the
 * Payout the depositor signs pays out this vault and no other.
 *
 * btc-vault's `check_assert_spends_claim` (`sign.rs:1155-1193` @ ac4954e7)
 * already enforces the Assert half inside `buildClaimPsbt`; it is mirrored
 * here so this export holds for PSBTs built any other way. Nothing covers the
 * Payout half but this. The signatures are collected once and cannot be
 * re-collected, so a pairing mismatch found later leaves a signed Assert the
 * signed Payout can never spend.
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
 * The Assert's declared prevout must be Claim:0 itself, value and script: the
 * SIGHASH_DEFAULT signature commits to both. Mirrors the second half of
 * `check_assert_spends_claim` (`sign.rs:1176-1193` @ ac4954e7).
 */
function assertDeclaresClaimOutput(assert: Psbt, claim: Psbt): void {
  const witnessUtxo = assert.data.inputs[ASSERT_CLAIM_INPUT_INDEX]?.witnessUtxo;
  if (witnessUtxo === undefined) {
    throw new AssertBindingError(
      `Assert input ${ASSERT_CLAIM_INPUT_INDEX} carries no witnessUtxo, so the amount and ` +
        `script its signature commits to cannot be checked; refusing to sign assert.`,
    );
  }
  const claimOutput = claim.txOutputs[CLAIM_CONNECTOR_OUTPUT_INDEX];
  if (!claimOutput) {
    throw new AssertBindingError(
      `Claim PSBT has no output ${CLAIM_CONNECTOR_OUTPUT_INDEX} for the Assert to spend; refusing to sign assert.`,
    );
  }
  if (witnessUtxo.value !== claimOutput.value) {
    throw new AssertBindingError(
      `Assert input ${ASSERT_CLAIM_INPUT_INDEX} declares a prevout of ${witnessUtxo.value} sats ` +
        `but the Claim's output ${CLAIM_CONNECTOR_OUTPUT_INDEX} is worth ${claimOutput.value}; refusing to sign assert.`,
    );
  }
  if (!witnessUtxo.script.equals(claimOutput.script)) {
    throw new AssertBindingError(
      `Assert input ${ASSERT_CLAIM_INPUT_INDEX} declares a prevout script that is not the ` +
        `Claim's output ${CLAIM_CONNECTOR_OUTPUT_INDEX} script; refusing to sign assert.`,
    );
  }
}

/**
 * @throws {AssertBindingError} When Assert input 0 is not Claim:0 or does not
 *         declare Claim:0's value and script as its witnessUtxo, Payout
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
  assertDeclaresClaimOutput(assert, claim);
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
