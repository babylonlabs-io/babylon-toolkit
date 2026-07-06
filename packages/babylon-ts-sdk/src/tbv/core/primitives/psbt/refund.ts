/**
 * Refund PSBT Builder Primitive
 *
 * Builds an unsigned refund PSBT for a depositor to reclaim BTC from
 * a timed-out Pre-PegIn HTLC output via the refund script (leaf 1).
 *
 * The refund script enforces a CSV timelock (timelockRefund blocks) and
 * requires only the depositor's Schnorr signature — no vault provider or
 * keeper involvement.
 *
 * @module primitives/psbt/refund
 */

import {
  assertPositiveBigintArray,
  getPrePeginHtlcConnectorInfo,
  initWasm,
  tapInternalPubkey,
  WasmPrePeginTx,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";

import {
  TAPSCRIPT_LEAF_VERSION,
  deriveBip86ScriptPubKeyHex,
  hexToUint8Array,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../utils/bitcoin";
import { normalizeAuthAnchorHash, type PrePeginParams } from "./pegin";

/**
 * Parameters for building a refund PSBT
 */
export interface BuildRefundPsbtParams {
  /** Same PrePeginParams used when the original Pre-PegIn tx was created */
  prePeginParams: PrePeginParams;
  /** Funded Pre-PegIn transaction hex (the tx whose HTLC output is being refunded) */
  fundedPrePeginTxHex: string;
  /** Index of the HTLC output in the Pre-PegIn transaction */
  htlcVout: number;
  /** Transaction fee in satoshis for the refund transaction */
  refundFee: bigint;
  /** SHA256 hash commitment for the HTLC (64 hex chars, no 0x prefix) */
  hashlock: string;
}

/**
 * Result of building a refund PSBT
 */
export interface BuildRefundPsbtResult {
  /** PSBT hex ready for depositor signing */
  psbtHex: string;
}

/**
 * Build a PSBT for signing the refund transaction.
 *
 * The refund transaction spends the Pre-PegIn HTLC output via leaf 1
 * (the refund script: `<timelockRefund> CSV DROP <depositorPubkey> CHECKSIG`).
 * The PSBT includes the tapLeafScript entry so the depositor's wallet can
 * sign using Taproot script-path spending.
 *
 * The input's sequence is set to `timelockRefund` by the WASM, enforcing
 * the Bitcoin CSV timelock. The refund broadcast will be rejected by the
 * network if the timelock has not yet expired.
 *
 * @param params - Refund PSBT parameters
 * @returns PSBT hex for depositor signing
 * @throws If the HTLC output at htlcVout is not found
 * @throws If the refund transaction does not have exactly 1 input
 */
export async function buildRefundPsbt(
  params: BuildRefundPsbtParams,
): Promise<BuildRefundPsbtResult> {
  await initWasm();

  const { prePeginParams, fundedPrePeginTxHex, htlcVout, refundFee, hashlock } =
    params;

  // The 14th positional arg `auth_anchor_hash` is `Option<String>` in
  // the Rust WASM constructor (the 9th arg `min_pegin_fee_rate` requires
  // the two-rate constructor from btc-vault #1930). Production peg-ins
  // (PeginManager) always commit an OP_RETURN <PUSH32 SHA256(authAnchor)>
  // output at `vout = hashlocks.length`; the unfunded template must
  // include it so `fromFundedTransaction` aligns with the funded tx.
  // Normalize identically to the peg-in primitives (`0x` strip,
  // lowercase, length/charset validation) so a direct primitive caller
  // reusing successful peg-in params doesn't hand unnormalized bytes to
  // WASM. Pass `undefined` for legacy non-auth-anchored Pre-PegIns.
  const normalizedAuthAnchorHash = normalizeAuthAnchorHash(
    prePeginParams.authAnchorHash,
  );
  const unfundedTx = new (WasmPrePeginTx as unknown as new (
    depositor: string,
    vault_provider: string,
    vault_keepers: string[],
    universal_challengers: string[],
    hashlocks: string[],
    pegin_amounts: BigUint64Array,
    timelock_refund: number,
    fee_rate: bigint,
    min_pegin_fee_rate: bigint,
    num_local_challengers: number,
    council_quorum: number,
    council_size: number,
    network: string,
    auth_anchor_hash?: string,
  ) => typeof WasmPrePeginTx.prototype)(
    prePeginParams.depositorPubkey,
    prePeginParams.vaultProviderPubkey,
    prePeginParams.vaultKeeperPubkeys,
    prePeginParams.universalChallengerPubkeys,
    [...prePeginParams.hashlocks],
    new BigUint64Array(
      assertPositiveBigintArray(prePeginParams.pegInAmounts, "pegInAmounts"),
    ),
    prePeginParams.timelockRefund,
    prePeginParams.feeRate,
    prePeginParams.minPeginFeeRate,
    prePeginParams.numLocalChallengers,
    prePeginParams.councilQuorum,
    prePeginParams.councilSize,
    prePeginParams.network,
    normalizedAuthAnchorHash,
  );

  let fundedTx: WasmPrePeginTx | null = null;
  try {
    // Cross-check the reconstructed unfunded template against the funded
    // transaction: the WASM template's HTLC scriptPubKey at `htlcVout`
    // must equal the bytes the funded tx carries at the same output.
    // If they disagree, the template was reconstructed from the wrong
    // (hashlocks, amounts) vector — signing it would produce a refund
    // that does not spend the on-chain HTLC the depositor expects.
    // This is the explicit invariant the audit recommends: never sign a
    // refund whose template doesn't match the on-chain output bytes.
    const expectedHtlcScriptPubKey = unfundedTx
      .getHtlcScriptPubKey(htlcVout)
      .toLowerCase();
    // The reconstructed template's HTLC output value at `htlcVout`,
    // sized by WASM from the supplied `pegInAmounts` via the protocol
    // formula `htlcValue = peginAmount + depositorClaimValue + minPeginFee`.
    // Captured before `fromFundedTransaction` to bind it to the value the
    // funded tx actually carries (see the cross-check below).
    const expectedHtlcValue = unfundedTx.getHtlcValue(htlcVout);

    fundedTx = unfundedTx.fromFundedTransaction(fundedPrePeginTxHex);

    const refundTxHex = fundedTx.buildRefundTx(refundFee, htlcVout);

    const htlcConnector = await getPrePeginHtlcConnectorInfo({
      depositorPubkey: prePeginParams.depositorPubkey,
      vaultProviderPubkey: prePeginParams.vaultProviderPubkey,
      vaultKeeperPubkeys: prePeginParams.vaultKeeperPubkeys,
      universalChallengerPubkeys: prePeginParams.universalChallengerPubkeys,
      hashlock,
      timelockRefund: prePeginParams.timelockRefund,
      network: prePeginParams.network,
    });

    const cleanPrePeginHex = fundedPrePeginTxHex.startsWith("0x")
      ? fundedPrePeginTxHex.slice(2)
      : fundedPrePeginTxHex;
    const prePeginTx = Transaction.fromHex(cleanPrePeginHex);

    const htlcOutput = prePeginTx.outs[htlcVout];
    if (!htlcOutput) {
      throw new Error(
        `HTLC output at vout ${htlcVout} not found in funded Pre-PegIn tx ` +
          `(tx has ${prePeginTx.outs.length} outputs)`,
      );
    }

    const actualHtlcScriptPubKey = uint8ArrayToHex(
      new Uint8Array(htlcOutput.script),
    ).toLowerCase();
    if (actualHtlcScriptPubKey !== expectedHtlcScriptPubKey) {
      throw new Error(
        `HTLC scriptPubKey mismatch at vout ${htlcVout}: reconstructed ` +
          `template expects ${expectedHtlcScriptPubKey}, funded tx carries ` +
          `${actualHtlcScriptPubKey}. Refund refused — the (hashlocks, ` +
          `pegInAmounts) vector does not match the on-chain commitment.`,
      );
    }

    // Value cross-check (mirrors the script check above): the template's
    // HTLC value — derived by WASM from `pegInAmounts` via the protocol
    // formula — must equal the value the funded tx pays at this output.
    // A caller that hands the full HTLC output value (or any wrong amount)
    // as `pegInAmounts` would inflate the template value and trip this
    // guard, rather than silently signing a refund built from a template
    // that disagrees with the on-chain commitment.
    const actualHtlcValue = BigInt(htlcOutput.value);
    if (actualHtlcValue !== expectedHtlcValue) {
      throw new Error(
        `HTLC value mismatch at vout ${htlcVout}: reconstructed template ` +
          `expects ${expectedHtlcValue} sat, funded tx carries ` +
          `${actualHtlcValue} sat. Refund refused — the pegInAmounts vector ` +
          `does not match the on-chain commitment.`,
      );
    }

    const refundTx = Transaction.fromHex(refundTxHex);

    if (refundTx.ins.length !== 1) {
      throw new Error(
        `Refund transaction must have exactly 1 input, got ${refundTx.ins.length}`,
      );
    }

    const refundInput = refundTx.ins[0];

    // Verify the refund input spends the correct Pre-PegIn HTLC output
    const prePeginTxid = prePeginTx.getId();
    const refundInputTxid = uint8ArrayToHex(
      new Uint8Array(refundInput.hash).slice().reverse(),
    );
    if (refundInputTxid !== prePeginTxid) {
      throw new Error(
        `Refund input does not reference the Pre-PegIn transaction. ` +
          `Expected ${prePeginTxid}, got ${refundInputTxid}`,
      );
    }
    if (refundInput.index !== htlcVout) {
      throw new Error(
        `Refund input index ${refundInput.index} does not match expected htlcVout ${htlcVout}`,
      );
    }

    const psbt = new Psbt();
    psbt.setVersion(refundTx.version);
    psbt.setLocktime(refundTx.locktime);

    psbt.addInput({
      hash: refundInput.hash,
      index: refundInput.index,
      sequence: refundInput.sequence,
      witnessUtxo: {
        script: htlcOutput.script,
        value: htlcOutput.value,
      },
      tapLeafScript: [
        {
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: Buffer.from(hexToUint8Array(htlcConnector.refundScript)),
          controlBlock: Buffer.from(
            hexToUint8Array(htlcConnector.refundControlBlock),
          ),
        },
      ],
      tapInternalKey: Buffer.from(tapInternalPubkey),
    });

    // Output side: pin the single refund output to the depositor's own
    // BIP-86 P2TR address, mirroring the input-side pinning above. WASM
    // builds the refund output from the refund leaf's depositor key, so a
    // correct template always pays exactly one output back to the depositor.
    // Asserting it here means a malformed template (or a tampered WASM)
    // cannot redirect the reclaimed funds to a script the depositor does
    // not control.
    if (refundTx.outs.length !== 1) {
      throw new Error(
        `Refund transaction must have exactly 1 output, got ${refundTx.outs.length}`,
      );
    }
    const refundOutput = refundTx.outs[0];
    const expectedDepositorScriptPubKey = stripHexPrefix(
      deriveBip86ScriptPubKeyHex(prePeginParams.depositorPubkey),
    ).toLowerCase();
    const actualRefundOutputScriptPubKey = uint8ArrayToHex(
      new Uint8Array(refundOutput.script),
    ).toLowerCase();
    if (actualRefundOutputScriptPubKey !== expectedDepositorScriptPubKey) {
      throw new Error(
        `Refund output scriptPubKey ${actualRefundOutputScriptPubKey} does not ` +
          `match the depositor's BIP-86 address ${expectedDepositorScriptPubKey}. ` +
          `Refund refused — the reclaimed funds would not return to the depositor.`,
      );
    }

    // Value: the single refund output must return the full HTLC value minus
    // exactly the requested fee. The refund is 1-in/1-out (asserted above), so
    // a value below `htlcValue - refundFee` means WASM applied a larger fee
    // than requested — the difference would be burned as miner fee. Pin it so
    // the depositor reclaims the expected amount, not a silently reduced one.
    const expectedRefundOutputValue = actualHtlcValue - refundFee;
    if (BigInt(refundOutput.value) !== expectedRefundOutputValue) {
      throw new Error(
        `Refund output value ${BigInt(refundOutput.value)} sat does not equal ` +
          `the HTLC value ${actualHtlcValue} sat minus the requested fee ` +
          `${refundFee} sat (expected ${expectedRefundOutputValue} sat). ` +
          `Refund refused — the reclaimed amount would be burned as excess fee.`,
      );
    }

    psbt.addOutput({
      script: refundOutput.script,
      value: refundOutput.value,
    });

    return { psbtHex: psbt.toHex() };
  } finally {
    fundedTx?.free();
    unfundedTx.free();
  }
}
