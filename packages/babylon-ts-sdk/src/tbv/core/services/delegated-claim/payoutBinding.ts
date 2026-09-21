/**
 * Binding between a delegated-claim Payout and the destination the vault
 * registered on chain.
 *
 * The Payout transaction is built by the vault provider and moves the whole
 * recovered peg-in. Its outputs are the one thing in this flow that decides
 * where the money lands, and nothing in the artifacts file constrains them:
 * the Rust verification proves the bundled signatures are self-consistent
 * with the same graph that named the outputs. So a graph correctly bound to
 * this vault can still carry a Payout that pays somebody else, and the
 * depositor would sign it in the same prompt as everything else.
 *
 * This is the claim-side counterpart of `assertPayoutOutputLayout` in
 * `primitives/psbt/payout.ts`, which the deposit-time path already runs for
 * the same `depositor-as-claimer` role. It pins the same four things: the
 * output count, the payout script, the CPFP anchor value, and the version
 * and locktime the depositor's signature commits to.
 *
 * @module services/delegated-claim/payoutBinding
 */

import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import {
  NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT,
  PAYOUT_ANCHOR_DUST_SATS,
  PAYOUT_TX_LOCKTIME,
  PAYOUT_TX_VERSION,
} from "../../primitives/psbt/constants";
import { stripHexPrefix } from "../../primitives/utils/bitcoin";

/** Output of the Payout transaction that pays the claimer. */
const PAYOUT_DESTINATION_OUTPUT = 0;

/**
 * Thrown when a Payout does not pay the vault's registered destination.
 *
 * @experimental
 */
export class PayoutDestinationError extends Error {
  constructor(
    /** The vault's registered payout scriptPubKey, hex. */
    readonly expectedScriptHex: string,
    /** The scriptPubKey the Payout actually pays, hex. */
    readonly actualScriptHex: string,
  ) {
    super(
      `Payout transaction output ${PAYOUT_DESTINATION_OUTPUT} pays ` +
        `${actualScriptHex}, not the vault's registered payout script ` +
        `${expectedScriptHex}. Refusing to sign a payout to another ` +
        `destination.`,
    );
    this.name = "PayoutDestinationError";
  }
}

/**
 * The Payout to check, and the destination it must pay.
 *
 * @experimental
 */
export interface AssertPayoutPaysRegisteredScriptParams {
  /** A Payout signing PSBT, base64, as the graph produced it. */
  payoutPsbtBase64: string;
  /**
   * `depositorPayoutScriptPubKey` as the vault registered it on chain, hex.
   * The vault provider does not choose this value, which is the whole point
   * of comparing against it.
   */
  registeredPayoutScriptPubKey: string;
}

/**
 * Throws unless the Payout pays the vault's registered payout script.
 *
 * Run this on every Payout PSBT before the wallet is prompted. Both the
 * depositor and the claimer PSBT describe the same transaction, so both must
 * pass; checking only one would leave the other free to differ.
 *
 * @throws {@link PayoutDestinationError} when output 0 pays elsewhere, or a
 *         plain error when the layout is not the canonical claimer layout.
 *
 * @experimental
 */
export function assertPayoutPaysRegisteredScript(
  params: AssertPayoutPaysRegisteredScriptParams,
): void {
  let psbt: Psbt;
  try {
    psbt = Psbt.fromBase64(params.payoutPsbtBase64);
  } catch (cause) {
    throw new Error("Payout PSBT cannot be parsed.", { cause });
  }

  const { version, locktime, outs } = readPayoutTx(psbt);

  // Version and locktime are part of every sighash the depositor is about to
  // produce, so a deviation means signing a transaction the protocol never
  // constructs.
  if (version !== PAYOUT_TX_VERSION || locktime !== PAYOUT_TX_LOCKTIME) {
    throw new Error(
      `Payout transaction has version ${version} and locktime ${locktime}, ` +
        `expected ${PAYOUT_TX_VERSION} and ${PAYOUT_TX_LOCKTIME}.`,
    );
  }

  if (outs.length !== NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT) {
    throw new Error(
      `Payout transaction has ${outs.length} output(s), expected exactly ` +
        `${NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT} for a depositor-as-claimer ` +
        `payout.`,
    );
  }

  const expected = stripHexPrefix(
    params.registeredPayoutScriptPubKey,
  ).toLowerCase();
  if (expected.length === 0) {
    throw new Error(
      "registeredPayoutScriptPubKey is empty; the vault's on-chain payout " +
        "script is required to check the Payout destination.",
    );
  }
  const actual = outs[PAYOUT_DESTINATION_OUTPUT].script
    .toString("hex")
    .toLowerCase();
  if (!Buffer.from(actual, "hex").equals(Buffer.from(expected, "hex"))) {
    throw new PayoutDestinationError(expected, actual);
  }

  const anchor = outs[NON_VP_CLAIMER_PAYOUT_OUTPUT_COUNT - 1];
  if (anchor.value !== PAYOUT_ANCHOR_DUST_SATS) {
    throw new Error(
      `Payout CPFP anchor value ${anchor.value} sats must equal ` +
        `${PAYOUT_ANCHOR_DUST_SATS} sats.`,
    );
  }
}

/** The unsigned transaction fields this check reads, from the PSBT. */
function readPayoutTx(psbt: Psbt): {
  version: number;
  locktime: number;
  outs: { script: Buffer; value: number }[];
} {
  return {
    version: psbt.version,
    locktime: psbt.locktime,
    outs: psbt.txOutputs.map((out) => ({
      script: Buffer.from(out.script),
      value: out.value,
    })),
  };
}
