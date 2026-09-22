/**
 * Claim-side counterpart of the CSV-sequence pins and the implicit-fee band
 * that `primitives/psbt/payout.ts` runs at deposit time on the same Payout
 * transaction: input 0's sequence is `timelock_pegin`, input 1's is
 * `timelock_assert`, and `inputs − outputs` is the miner fee
 * (btc-vault `payout.rs:103-140` @ ac4954e7).
 *
 * The transaction-level checks read the claimer PSBT's unsigned transaction,
 * which is proved byte-equal to the depositor's here. The declared prevout
 * amounts are not part of that transaction — they live in each PSBT's own
 * input map — so they are pinned on both PSBTs.
 *
 * @module services/delegated-claim/assertPayoutFeeAndTimelocks
 */

import { Psbt } from "bitcoinjs-lib";

import {
  assertPayoutFeeBandDomain,
  assertPayoutFeeInBand,
  type PayoutFeeBandParams,
} from "../../primitives/psbt/assertPayoutFeeBand";
import {
  ASSERT_PAYOUT_OUTPUT_INDEX,
  DEPOSITOR_PAYOUT_INPUT_COUNT,
  NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT,
  PAYOUT_ASSERT_INPUT_INDEX,
  PAYOUT_DESTINATION_OUTPUT_INDEX,
  PAYOUT_PEGIN_INPUT_INDEX,
  PEGIN_VAULT_OUTPUT_INDEX,
} from "../../primitives/psbt/constants";
import type { DelegatedClaimVaultContext } from "./types";

function parse(label: string, psbtBase64: string): Psbt {
  try {
    return Psbt.fromBase64(psbtBase64);
  } catch (cause) {
    throw new Error(`${label} PSBT cannot be parsed.`, { cause });
  }
}

/**
 * Pins both declared prevout amounts of one Payout PSBT.
 *
 * BIP-341's `sha_amounts` commits to every input's amount under
 * SIGHASH_DEFAULT, which is what this path signs with
 * (`primitives/psbt/payout.ts:511`,
 * `primitives/psbt/verifyScriptPathSchnorrSignature.ts:153`), so a misstated
 * Assert:0 amount on input 1 invalidates input 0's signature just as an
 * overstated Vault UTXO does. The builder declares both (btc-vault
 * `psbt.rs:125-128` @ ac4954e7 sets `witness_utxo` on every input), so a
 * missing one is itself a refusal.
 *
 * Deposit time needs no such check: `primitives/psbt/payout.ts:306-312`
 * derives input 1's prevout from the real Assert and writes it at `:520-523`,
 * so it is right by construction there, whereas these PSBTs arrive pre-built
 * from the vault provider's graph. The pin makes the amount the wallet signs
 * over the amount the fee below is measured over.
 */
function assertDeclaredPrevouts(
  label: string,
  payout: Psbt,
  peginValueSats: number,
  assertOutputValueSats: number,
): void {
  const pins = [
    {
      inputIndex: PAYOUT_PEGIN_INPUT_INDEX,
      expectedSats: peginValueSats,
      source: `the vault's PegIn output ${PEGIN_VAULT_OUTPUT_INDEX}`,
    },
    {
      inputIndex: PAYOUT_ASSERT_INPUT_INDEX,
      expectedSats: assertOutputValueSats,
      source: `the Assert's output ${ASSERT_PAYOUT_OUTPUT_INDEX}`,
    },
  ];
  for (const { inputIndex, expectedSats, source } of pins) {
    const witnessUtxo = payout.data.inputs[inputIndex]?.witnessUtxo;
    if (witnessUtxo === undefined) {
      throw new Error(
        `${label} Payout input ${inputIndex} carries no witnessUtxo, so the amount ` +
          `its signature commits to cannot be checked; refusing to sign payout.`,
      );
    }
    if (witnessUtxo.value !== expectedSats) {
      throw new Error(
        `${label} Payout input ${inputIndex} declares a prevout of ${witnessUtxo.value} sats ` +
          `but ${source} is worth ${expectedSats}; refusing to sign payout.`,
      );
    }
  }
}

/**
 * Throws unless the Payout's two input sequences are the vault's stamped CSV
 * timelocks, both PSBTs declare the two prevout amounts the signatures commit
 * to, and its implicit fee lies in the version-locked band.
 *
 * Not part of the public surface: it does not check which outpoints the
 * Payout spends, so it is only meaningful once they are proved elsewhere.
 * `buildBoundPsbtSet` proves them for the claimer PSBT with
 * `assertAssertBindsClaimAndPayout`; the depositor PSBT inherits that proof
 * from the byte-equality of the two unsigned transactions, which this
 * function enforces itself.
 *
 * @throws When the fee-band inputs are out of domain, a PSBT cannot be
 *         parsed, the two Payout PSBTs are not the same transaction, the
 *         Assert has no output
 *         {@link ASSERT_PAYOUT_OUTPUT_INDEX}, the Payout has the wrong input
 *         count, a sequence is not the stamped timelock, the Payout has the
 *         wrong output count, the outputs exceed the inputs, the fee falls
 *         outside the band, or either PSBT declares no prevout on an input or
 *         one whose value is not the vault's PegIn output (input 0) or the
 *         Assert's output (input 1).
 *
 * @internal
 */
export async function assertPayoutFeeAndTimelocks(params: {
  /** The claimer Payout signing PSBT, base64, as the graph produced it. */
  payoutClaimerPsbtBase64: string;
  /** The depositor Payout signing PSBT, base64, proved to be the same transaction. */
  payoutDepositorPsbtBase64: string;
  /** The Assert PSBT of the same graph; its output 0 is Payout input 1's prevout. */
  assertPsbtBase64: string;
  vault: DelegatedClaimVaultContext;
}): Promise<void> {
  const { vault } = params;
  const feeBandParams: PayoutFeeBandParams = {
    vaultCoreVersion: vault.vaultCoreVersion,
    numVaultKeepers: vault.vaultKeeperBtcPubkeys.length,
    numUniversalChallengers: vault.universalChallengerBtcPubkeys.length,
    councilSize: vault.councilSize,
    protocolFeeRate: vault.protocolFeeRate,
  };
  assertPayoutFeeBandDomain(feeBandParams);

  const payoutClaimer = parse("Claimer Payout", params.payoutClaimerPsbtBase64);
  const payoutDepositor = parse(
    "Depositor Payout",
    params.payoutDepositorPsbtBase64,
  );
  const assertPsbt = parse("Assert", params.assertPsbtBase64);

  // The transaction-level checks below read the claimer PSBT alone, so the two
  // must be one transaction; each keeps its own input map, pinned separately.
  if (
    !payoutDepositor.data.globalMap.unsignedTx
      .toBuffer()
      .equals(payoutClaimer.data.globalMap.unsignedTx.toBuffer())
  ) {
    throw new Error(
      "Depositor and claimer Payout PSBTs describe different transactions; refusing to sign payout.",
    );
  }

  // The caller's outpoint proof (module doc) covers input 1 spending this
  // Assert's output 0, so that output is what input 1 is worth.
  const assertOutput = assertPsbt.txOutputs[ASSERT_PAYOUT_OUTPUT_INDEX];
  if (assertOutput === undefined) {
    throw new Error(
      `Assert transaction has no output ${ASSERT_PAYOUT_OUTPUT_INDEX}; the ` +
        `Payout's implicit fee cannot be measured.`,
    );
  }

  // Transaction-level checks run on the claimer PSBT alone: the depositor's
  // unsigned transaction was checked byte-equal to it above.
  if (payoutClaimer.txInputs.length !== DEPOSITOR_PAYOUT_INPUT_COUNT) {
    throw new Error(
      `Payout transaction must have exactly ${DEPOSITOR_PAYOUT_INPUT_COUNT} ` +
        `inputs, got ${payoutClaimer.txInputs.length}`,
    );
  }
  const peginSequence =
    payoutClaimer.txInputs[PAYOUT_PEGIN_INPUT_INDEX].sequence;
  if (peginSequence !== vault.timelockPegin) {
    throw new Error(
      `Payout input ${PAYOUT_PEGIN_INPUT_INDEX} sequence ${peginSequence} must equal the ` +
        `PegIn CSV timelock ${vault.timelockPegin}; refusing to sign payout.`,
    );
  }
  const assertSequence =
    payoutClaimer.txInputs[PAYOUT_ASSERT_INPUT_INDEX].sequence;
  if (assertSequence !== vault.timelockAssert) {
    throw new Error(
      `Payout input ${PAYOUT_ASSERT_INPUT_INDEX} sequence ${assertSequence} must equal the ` +
        `Assert CSV timelock ${vault.timelockAssert}; refusing to sign payout.`,
    );
  }

  // Each PSBT carries its own input map, which the byte-equality of the two
  // unsigned transactions does not cover, so both are pinned.
  assertDeclaredPrevouts(
    "Claimer",
    payoutClaimer,
    vault.peginVaultOutputValueSats,
    assertOutput.value,
  );
  assertDeclaredPrevouts(
    "Depositor",
    payoutDepositor,
    vault.peginVaultOutputValueSats,
    assertOutput.value,
  );

  const inputValueSats = vault.peginVaultOutputValueSats + assertOutput.value;
  const outs = payoutClaimer.txOutputs;
  // The precondition for the `out1Len: undefined` below, and what makes
  // `outs[PAYOUT_DESTINATION_OUTPUT_INDEX]` the pinned destination.
  if (outs.length !== NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT) {
    throw new Error(
      `Payout transaction has ${outs.length} output(s), expected exactly ` +
        `${NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT} for a depositor-as-claimer payout.`,
    );
  }
  let outputValueSats = 0;
  for (const out of outs) outputValueSats += out.value;
  if (outputValueSats > inputValueSats) {
    throw new Error(
      `Payout outputs (${outputValueSats} sats) exceed inputs ` +
        `(${inputValueSats} sats); invalid transaction.`,
    );
  }

  // `out1Len` is undefined: the claimer layout's second output is the CPFP
  // anchor, not a commission (`assertPayoutPaysRegisteredScript` pins both).
  await assertPayoutFeeInBand(feeBandParams, {
    implicitFeeSats: inputValueSats - outputValueSats,
    out0Len: outs[PAYOUT_DESTINATION_OUTPUT_INDEX].script.length,
    out1Len: undefined,
  });
}
