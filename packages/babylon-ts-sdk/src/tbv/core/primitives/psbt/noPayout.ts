/**
 * NoPayout PSBT Builder
 *
 * Builds unsigned PSBTs for the depositor's NoPayout transaction
 * (depositor-as-claimer path, per challenger). The depositor signs input 0
 * using the NoPayout taproot script from WasmAssertPayoutNoPayoutConnector.
 *
 * @module primitives/psbt/noPayout
 * @see btc-vault crates/vault/docs/btc-transactions-spec.md — Assert output 0 NoPayout connector
 */

import {
  type AssertPayoutNoPayoutConnectorParams,
  type Network,
  getAssertNoPayoutScriptInfo,
  tapInternalPubkey,
} from "../../wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction, payments } from "bitcoinjs-lib";

import {
  TAPSCRIPT_LEAF_VERSION,
  getNetwork,
  hexToUint8Array,
  inputTxidHex,
  processPublicKeyToXOnly,
  stripHexPrefix,
} from "../utils/bitcoin";
import {
  ASSERT_PAYOUT_OUTPUT_INDEX,
  CHALLENGE_ASSERT_OUTPUT_CONNECTOR_INDEX,
  NOPAYOUT_ASSERT_INPUT_SEQUENCE,
  NOPAYOUT_INPUT_COUNT,
  NOPAYOUT_TX_LOCKTIME,
  NOPAYOUT_TX_VERSION,
} from "./constants";

/** Largest `timelockChallengeAssert` the protocol accepts (a Rust `NonZeroU16`). */
const MAX_TIMELOCK_CHALLENGE_ASSERT = 0xffff;

/**
 * Parameters for building a NoPayout PSBT
 */
export interface NoPayoutParams {
  /** NoPayout transaction hex (unsigned) from VP */
  noPayoutTxHex: string;
  /** Challenger's x-only public key (hex encoded) */
  challengerPubkey: string;
  /** Prevouts for all inputs [{script_pubkey, value}], used verbatim — derive them from the parent txs */
  prevouts: Array<{ script_pubkey: string; value: number }>;
  /** Parameters for the Assert Payout/NoPayout connector */
  connectorParams: AssertPayoutNoPayoutConnectorParams;
}

/**
 * Build unsigned NoPayout PSBT.
 *
 * The NoPayout transaction is specific to each challenger.
 * Input 0 is the one the depositor signs using the NoPayout taproot script path.
 *
 * @param params - NoPayout parameters
 * @returns Unsigned PSBT hex ready for signing
 */
export async function buildNoPayoutPsbt(
  params: NoPayoutParams,
): Promise<string> {
  const noPayoutTxHex = stripHexPrefix(params.noPayoutTxHex);
  const noPayoutTx = Transaction.fromHex(noPayoutTxHex);

  // Get NoPayout script and control block for this challenger
  const { noPayoutScript, noPayoutControlBlock } =
    await getAssertNoPayoutScriptInfo(
      params.connectorParams,
      params.challengerPubkey,
    );

  const scriptBytes = hexToUint8Array(noPayoutScript);
  const controlBlockBytes = hexToUint8Array(noPayoutControlBlock);

  const psbt = new Psbt();
  psbt.setVersion(noPayoutTx.version);
  psbt.setLocktime(noPayoutTx.locktime);

  // Add all inputs - depositor signs input 0 only
  for (let i = 0; i < noPayoutTx.ins.length; i++) {
    const input = noPayoutTx.ins[i];
    const prevout = params.prevouts[i];

    if (!prevout) {
      throw new Error(`Missing prevout data for input ${i}`);
    }

    const inputData: Parameters<typeof psbt.addInput>[0] = {
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      witnessUtxo: {
        script: Buffer.from(hexToUint8Array(stripHexPrefix(prevout.script_pubkey))),
        value: prevout.value,
      },
    };

    // Input 0: depositor signs using taproot script path
    if (i === 0) {
      inputData.tapLeafScript = [
        {
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: Buffer.from(scriptBytes),
          controlBlock: Buffer.from(controlBlockBytes),
        },
      ];
      inputData.tapInternalKey = Buffer.from(tapInternalPubkey);
    }

    psbt.addInput(inputData);
  }

  // Add outputs
  for (const output of noPayoutTx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }

  return psbt.toHex();
}

/**
 * Validate that a NoPayout transaction pays to the challenger via the
 * protocol-defined output structure: a single BIP-86 P2TR output derived from
 * the challenger's x-only pubkey.
 *
 * Mirrors the per-role payout output validation now inlined in
 * `buildPayoutPsbt` for the NoPayout path, where the sink is fixed by the
 * protocol rather than read from on-chain registration
 * (see `crates/vault/src/transactions/nopayout.rs::NoPayoutTx::new`).
 *
 * @param noPayoutTxHex - Raw NoPayout transaction hex
 * @param challengerPubkey - Challenger's x-only public key (hex)
 * @param network - Bitcoin network used to derive the P2TR scriptPubKey
 * @throws If the transaction does not have exactly one output
 * @throws If the single output's scriptPubKey does not equal the BIP-86 P2TR
 *         scriptPubKey for the challenger
 */
export function assertNoPayoutOutputMatchesChallenger(
  noPayoutTxHex: string,
  challengerPubkey: string,
  network: Network,
): void {
  const tx = Transaction.fromHex(stripHexPrefix(noPayoutTxHex));

  if (tx.outs.length !== 1) {
    throw new Error(
      `NoPayout transaction must have exactly 1 output, got ${tx.outs.length}`,
    );
  }

  const xOnly = hexToUint8Array(processPublicKeyToXOnly(challengerPubkey));
  const { output: expectedScript } = payments.p2tr({
    internalPubkey: Buffer.from(xOnly),
    network: getNetwork(network),
  });
  if (!expectedScript) {
    throw new Error(
      "Failed to derive challenger BIP-86 P2TR scriptPubKey for NoPayout output validation",
    );
  }

  if (!tx.outs[0].script.equals(expectedScript)) {
    throw new Error(
      "NoPayout transaction does not pay to the expected challenger BIP-86 P2TR address",
    );
  }
}

/**
 * Parameters for {@link assertCanonicalNoPayoutShape}
 */
export interface AssertCanonicalNoPayoutShapeParams {
  /** The NoPayout transaction the VP supplied */
  noPayoutTx: Transaction;
  /** Authoritative Assert txid (display hex) */
  assertTxid: string;
  /** Canonical ChallengeAssertX txid (display hex) */
  challengeAssertXTxid: string;
  /** Canonical ChallengeAssertY txid (display hex) */
  challengeAssertYTxid: string;
  /** ChallengeAssert CSV timelock in blocks (offchain param `timelockChallengeAssert`) */
  timelockChallengeAssert: number;
  /** Values of Assert:0, ChallengeAssertX:0 and ChallengeAssertY:0, in input order */
  prevoutValues: readonly [number, number, number];
}

/**
 * Require a VP-supplied NoPayout to have the shape btc-vault `NoPayoutTx::new`
 * builds over the canonical parents
 * (`crates/vault/src/transactions/nopayout.rs:148-209` @ b534ff9e): version 2,
 * locktime 0, and exactly the inputs Assert:0, ChallengeAssertX:0 and
 * ChallengeAssertY:0, in that order, with sequences `0xffffffff`, `t`, `t`.
 *
 * The depositor's signature commits to every one of these fields. The
 * challenge window itself is enforced by the ChallengeAssert output connector's
 * NoPayout leaf (`<challenger> CHECKSIGVERIFY <t> CSV`), which the txid binding
 * of both parents pins: a NoPayout with a shorter or disabled sequence, or
 * below version 2, fails that CSV and is invalid rather than early. Pinning the
 * layout keeps the signature on the one transaction btc-vault builds, which is
 * the one that can be mined. The output may not exceed the inputs, for the same
 * reason. The output script is checked by
 * {@link assertNoPayoutOutputMatchesChallenger}.
 *
 * @param params - The supplied NoPayout and the authoritative parents
 * @throws If any input, sequence, version or locktime differs from the
 *   canonical layout, the timelock is not a valid relative timelock, or the
 *   output value exceeds the inputs
 */
export function assertCanonicalNoPayoutShape(
  params: AssertCanonicalNoPayoutShapeParams,
): void {
  const { noPayoutTx, timelockChallengeAssert } = params;
  if (
    !Number.isInteger(timelockChallengeAssert) ||
    timelockChallengeAssert < 1 ||
    timelockChallengeAssert > MAX_TIMELOCK_CHALLENGE_ASSERT
  ) {
    throw new Error(
      `timelockChallengeAssert must be an integer in 1..${MAX_TIMELOCK_CHALLENGE_ASSERT}, got ${timelockChallengeAssert}`,
    );
  }
  if (noPayoutTx.version !== NOPAYOUT_TX_VERSION) {
    throw new Error(
      `NoPayout version must be ${NOPAYOUT_TX_VERSION}, got ${noPayoutTx.version}`,
    );
  }
  if (noPayoutTx.locktime !== NOPAYOUT_TX_LOCKTIME) {
    throw new Error(
      `NoPayout locktime must be ${NOPAYOUT_TX_LOCKTIME}, got ${noPayoutTx.locktime}`,
    );
  }
  if (noPayoutTx.ins.length !== NOPAYOUT_INPUT_COUNT) {
    throw new Error(
      `NoPayout must have exactly ${NOPAYOUT_INPUT_COUNT} inputs, got ${noPayoutTx.ins.length}`,
    );
  }

  const expectedInputs = [
    {
      label: "Assert",
      txid: params.assertTxid,
      vout: ASSERT_PAYOUT_OUTPUT_INDEX,
      sequence: NOPAYOUT_ASSERT_INPUT_SEQUENCE,
    },
    {
      label: "ChallengeAssertX",
      txid: params.challengeAssertXTxid,
      vout: CHALLENGE_ASSERT_OUTPUT_CONNECTOR_INDEX,
      sequence: timelockChallengeAssert,
    },
    {
      label: "ChallengeAssertY",
      txid: params.challengeAssertYTxid,
      vout: CHALLENGE_ASSERT_OUTPUT_CONNECTOR_INDEX,
      sequence: timelockChallengeAssert,
    },
  ];
  expectedInputs.forEach((expected, i) => {
    const input = noPayoutTx.ins[i];
    const txid = inputTxidHex(input);
    if (txid !== expected.txid || input.index !== expected.vout) {
      throw new Error(
        `NoPayout input ${i} must spend ${expected.label} ${expected.txid}:${expected.vout}, got ${txid}:${input.index}`,
      );
    }
    if (input.sequence !== expected.sequence) {
      throw new Error(
        `NoPayout input ${i} (${expected.label}) sequence must be ${expected.sequence}, got ${input.sequence}`,
      );
    }
  });

  const inputValue = params.prevoutValues.reduce((sum, v) => sum + v, 0);
  const outputValue = noPayoutTx.outs.reduce((sum, out) => sum + out.value, 0);
  if (outputValue > inputValue) {
    throw new Error(
      `NoPayout output value ${outputValue} exceeds its inputs (${inputValue} sats)`,
    );
  }
}
