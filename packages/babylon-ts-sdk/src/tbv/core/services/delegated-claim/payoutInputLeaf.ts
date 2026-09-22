/**
 * The depositor Payout PSBT the WASM builder emits populates only input 0
 * (the vault UTXO it signs). A hardware wallet's intent-bound payout
 * validator reads input 1's leaf to identify the claimer before it signs
 * input 0, so without it the device refuses. The claimer Payout PSBT is the
 * same unsigned transaction and carries exactly that leaf on input 1, so it
 * is copied across here, once, for every wallet: software wallets sign
 * input 0 and ignore input 1's metadata.
 *
 * @module services/delegated-claim/payoutInputLeaf
 */

import { Psbt } from "bitcoinjs-lib";

const ASSERT_CONNECTOR_INPUT = 1;

/** @experimental */
export class PayoutInputLeafError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutInputLeafError";
  }
}

/** @experimental */
export interface CopyAssertConnectorLeafParams {
  payoutDepositorPsbtBase64: string;
  payoutClaimerPsbtBase64: string;
}

/**
 * @returns The depositor Payout PSBT (base64) with input 1's taproot
 *          metadata taken from the claimer Payout PSBT.
 * @throws {PayoutInputLeafError} If the two PSBTs are not the same unsigned
 *         transaction, the claimer PSBT carries no single input-1 leaf, or
 *         the depositor PSBT already carries one.
 * @experimental
 */
export function copyAssertConnectorLeaf(
  params: CopyAssertConnectorLeafParams,
): string {
  const depositor = Psbt.fromBase64(params.payoutDepositorPsbtBase64);
  const claimer = Psbt.fromBase64(params.payoutClaimerPsbtBase64);

  const depositorTx = depositor.data.globalMap.unsignedTx.toBuffer();
  const claimerTx = claimer.data.globalMap.unsignedTx.toBuffer();
  if (!depositorTx.equals(claimerTx)) {
    throw new PayoutInputLeafError(
      "Depositor and claimer Payout PSBTs describe different transactions; the graph is inconsistent.",
    );
  }

  const from = claimer.data.inputs[ASSERT_CONNECTOR_INPUT];
  const to = depositor.data.inputs[ASSERT_CONNECTOR_INPUT];
  if (!from || !to) {
    throw new PayoutInputLeafError("Payout PSBT has no Assert-connector input.");
  }
  if (!from.tapLeafScript || from.tapLeafScript.length !== 1) {
    throw new PayoutInputLeafError(
      "Claimer Payout PSBT must carry exactly one leaf on the Assert-connector input.",
    );
  }
  if (to.tapLeafScript && to.tapLeafScript.length > 0) {
    throw new PayoutInputLeafError(
      "Depositor Payout PSBT already carries an Assert-connector leaf; refusing to overwrite it.",
    );
  }

  depositor.updateInput(ASSERT_CONNECTOR_INPUT, {
    tapLeafScript: from.tapLeafScript,
    ...(from.tapInternalKey ? { tapInternalKey: from.tapInternalKey } : {}),
    ...(from.tapMerkleRoot ? { tapMerkleRoot: from.tapMerkleRoot } : {}),
  });
  return depositor.toBase64();
}
