/**
 * Claim-side counterpart of the CSV-sequence pins and the implicit-fee band
 * that `primitives/psbt/payout.ts` runs at deposit time on the same Payout
 * transaction: input 0's sequence is `timelock_pegin`, input 1's is
 * `timelock_assert`, and `inputs − outputs` is the miner fee
 * (btc-vault `payout.rs:103-140` @ ac4954e7).
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
} from "../../primitives/psbt/constants";
import type { DelegatedClaimVaultContext } from "./types";

/** Payout input that spends the Vault UTXO (PegIn:0). */
const PAYOUT_PEGIN_INPUT = 0;
/** Payout input that spends the Assert connector (Assert:0). */
const PAYOUT_ASSERT_INPUT = 1;

function parse(label: string, psbtBase64: string): Psbt {
  try {
    return Psbt.fromBase64(psbtBase64);
  } catch (cause) {
    throw new Error(`${label} PSBT cannot be parsed.`, { cause });
  }
}

/**
 * Throws unless the Payout's two input sequences are the vault's stamped CSV
 * timelocks and its implicit fee lies in the version-locked band.
 *
 * Not part of the public surface: it does not check which outpoints the
 * Payout spends, so it is only meaningful after `assertAssertBindsClaimAndPayout`
 * has run on the same PSBTs, which `buildBoundPsbtSet` guarantees.
 *
 * @throws When the fee-band inputs are out of domain, either PSBT cannot be
 *         parsed, the Payout has the wrong input count, a sequence is not the
 *         stamped timelock, the outputs exceed the inputs, or the fee falls
 *         outside the band.
 *
 * @internal
 */
export async function assertPayoutFeeAndTimelocks(params: {
  /** A Payout signing PSBT, base64, as the graph produced it. */
  payoutPsbtBase64: string;
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

  const payout = parse("Payout", params.payoutPsbtBase64);
  const assertPsbt = parse("Assert", params.assertPsbtBase64);

  if (payout.txInputs.length !== DEPOSITOR_PAYOUT_INPUT_COUNT) {
    throw new Error(
      `Payout transaction must have exactly ${DEPOSITOR_PAYOUT_INPUT_COUNT} ` +
        `inputs, got ${payout.txInputs.length}`,
    );
  }
  const peginSequence = payout.txInputs[PAYOUT_PEGIN_INPUT].sequence;
  if (peginSequence !== vault.timelockPegin) {
    throw new Error(
      `Payout input ${PAYOUT_PEGIN_INPUT} sequence ${peginSequence} must equal the ` +
        `PegIn CSV timelock ${vault.timelockPegin}; refusing to sign payout.`,
    );
  }
  const assertSequence = payout.txInputs[PAYOUT_ASSERT_INPUT].sequence;
  if (assertSequence !== vault.timelockAssert) {
    throw new Error(
      `Payout input ${PAYOUT_ASSERT_INPUT} sequence ${assertSequence} must equal the ` +
        `Assert CSV timelock ${vault.timelockAssert}; refusing to sign payout.`,
    );
  }

  // `assertAssertBindsClaimAndPayout` already proved input 0 spends this
  // vault's PegIn:0 and input 1 spends this Assert's output 0, so the two
  // prevout values are read straight off those transactions.
  const assertOutput = assertPsbt.txOutputs[ASSERT_PAYOUT_OUTPUT_INDEX];
  if (assertOutput === undefined) {
    throw new Error(
      `Assert transaction has no output ${ASSERT_PAYOUT_OUTPUT_INDEX}; the ` +
        `Payout's implicit fee cannot be measured.`,
    );
  }
  const inputValueSats = vault.peginVaultOutputValueSats + assertOutput.value;
  const outs = payout.txOutputs;
  // The precondition for the `out1Len: undefined` below, and what makes
  // `outs[0]` the pinned destination.
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
    out0Len: outs[0].script.length,
    out1Len: undefined,
  });
}
