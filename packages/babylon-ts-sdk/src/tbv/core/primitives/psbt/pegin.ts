/**
 * Pre-PegIn PSBT Builder Primitive
 *
 * This module provides pure functions for building unfunded Pre-PegIn transactions
 * and deriving PegIn transactions from them, using the WASM implementation from
 * @babylonlabs-io/babylon-tbv-rust-wasm.
 *
 * Pre-PegIn Flow:
 * 1. buildPrePeginPsbt()     — creates unfunded Pre-PegIn tx (HTLC output)
 * 2. [caller funds Pre-PegIn tx and computes txid]
 * 3. buildPeginTxFromFundedPrePegin() — derives PegIn tx spending the HTLC
 * 4. buildPeginInputPsbt()   — PSBT for depositor to sign PegIn HTLC leaf 0 input
 *
 * @module primitives/psbt/pegin
 */

import {
  buildPeginTxFromPrePegin,
  computeMinClaimValue,
  createPrePeginTransaction,
  peginP2aAnchorOutput,
  tapInternalPubkey,
  validatePeginP2aAnchor,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Buffer } from "buffer";
import { payments, script as bscript, Transaction, opcodes } from "bitcoinjs-lib";

import { parseUnfundedWasmTransaction } from "../../utils/transaction/fundPeginTransaction";
import {
  hexToUint8Array,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../utils/bitcoin";

import {
  assertEncodedHtlcOutputsMatch,
  assertWasmPeginSizing,
} from "./assertWasmPeginSizing";

/**
 * Parameters for building an unfunded Pre-PegIn PSBT
 */
export interface PrePeginParams {
  /**
   * Vault core (tx-graph) version to build. Fresh deposits use the contract's
   * `ProtocolParams.activeVaultCoreVersion()`; resumed vaults use their
   * stamped on-chain `vaultCoreVersion`. The WASM facade fails closed on
   * versions it wasn't compiled with.
   */
  vaultCoreVersion: number;
  /** Depositor's BTC public key (x-only, 64-char hex without 0x prefix) */
  depositorPubkey: string;
  /** Vault provider's BTC public key (x-only, 64-char hex) */
  vaultProviderPubkey: string;
  /** Array of vault keeper BTC public keys (x-only, 64-char hex) */
  vaultKeeperPubkeys: string[];
  /** Array of universal challenger BTC public keys (x-only, 64-char hex) */
  universalChallengerPubkeys: string[];
  /** SHA256 hash commitment(s) (64 hex chars = 32 bytes each) */
  hashlocks: readonly string[];
  /** CSV timelock in blocks for the HTLC refund path */
  timelockRefund: number;
  /** Amounts to peg in (satoshis), one per deposit */
  pegInAmounts: readonly bigint[];
  /** TX-graph fee rate in sat/vB from contract offchain params; sizes the depositor claim value */
  feeRate: bigint;
  /** Minimum PegIn fee rate in sat/vB from contract offchain params; sizes the PegIn tx fee */
  minPeginFeeRate: bigint;
  /** Number of local challengers (from contract params) */
  numLocalChallengers: number;
  /** M in M-of-N council multisig (from contract params) */
  councilQuorum: number;
  /** N in M-of-N council multisig (from contract params) */
  councilSize: number;
  /** Bitcoin network */
  network: Network;
  /**
   * Optional 32-byte `SHA256(auth_anchor)` commitment (64-char hex, no
   * `0x` prefix). If provided, the Pre-PegIn tx will include an
   * `OP_RETURN <PUSH32 authAnchorHash>` output at vout =
   * `hashlocks.length`, binding the depositor's bearer-token
   * `auth_anchor` preimage to this Pre-PegIn.
   */
  authAnchorHash?: string;
}

/**
 * Byte length of an `auth_anchor_hash` commitment when encoded as a
 * lowercase hex string (32 bytes → 64 hex chars).
 */
const AUTH_ANCHOR_HASH_HEX_LEN = 64;

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Result of building an unfunded Pre-PegIn transaction
 */
export interface PrePeginPsbtResult {
  /**
   * Unfunded transaction hex (no inputs, HTLC outputs + optional
   * auth-anchor OP_RETURN + CPFP anchor).
   *
   * The caller is responsible for:
   * - Selecting UTXOs covering totalOutputValue + network fees
   * - Funding the transaction (add inputs and change output)
   * - Calling buildPeginTxFromFundedPrePegin() with the funded tx hex
   */
  psbtHex: string;
  /** Sum of all unfunded outputs — use this for UTXO selection */
  totalOutputValue: bigint;
  /**
   * HTLC output values in satoshis, one per deposit. Each includes
   * peginAmount + depositorClaimValue + p2aAnchorValue + minPeginFee (the
   * anchor term is 0 for graph versions without a P2A anchor, 240 for v2).
   */
  htlcValues: readonly bigint[];
  /** HTLC output scriptPubKeys (hex encoded), one per deposit */
  htlcScriptPubKeys: readonly string[];
  /** HTLC Taproot addresses, one per deposit */
  htlcAddresses: readonly string[];
  /** Pegin amounts in satoshis, one per deposit */
  peginAmounts: readonly bigint[];
  /** Depositor claim value computed by WASM from contract parameters */
  depositorClaimValue: bigint;
  /**
   * Vout index of the auth-anchor `OP_RETURN` output if one was
   * included (i.e. `authAnchorHash` was provided), or `null` if not.
   * Always equals `htlcValues.length` when present.
   */
  authAnchorVout: number | null;
}

/**
 * Parameters for building the PegIn transaction from a funded Pre-PegIn tx
 */
export interface BuildPeginTxParams {
  /** Same PrePeginParams used to create the Pre-PegIn transaction */
  prePeginParams: PrePeginParams;
  /** CSV timelock in blocks for the PegIn vault output */
  timelockPegin: number;
  /** Hex-encoded funded Pre-PegIn transaction */
  fundedPrePeginTxHex: string;
  /** Index of the HTLC output to spend */
  htlcVout: number;
}

/**
 * Result of building the PegIn transaction
 */
export interface PeginTxResult {
  /**
   * PegIn transaction hex. 1 input spending the HTLC; outputs are
   * version-shaped: v1 = vault + depositor claim, v2 = vault + depositor
   * claim + P2A anchor at vout 2 (nVersion 3 / TRUC).
   */
  txHex: string;
  /** PegIn transaction ID */
  txid: string;
  /** Vault output scriptPubKey (hex encoded) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
}

/**
 * Build unfunded Pre-PegIn transaction using WASM.
 *
 * Creates a Bitcoin transaction template with no inputs, an HTLC output, and a
 * CPFP anchor output. The HTLC value is computed internally from the contract
 * parameters — the caller does not need to compute depositorClaimValue separately.
 *
 * @param params - Pre-PegIn parameters
 * @returns Unfunded Pre-PegIn transaction details with HTLC output information
 * @throws If WASM initialization fails or parameters are invalid
 */
export async function buildPrePeginPsbt(
  params: PrePeginParams,
): Promise<PrePeginPsbtResult> {
  const authAnchorHash = normalizeAuthAnchorHash(params.authAnchorHash);

  const result = await createPrePeginTransaction({
    txGraphVersion: params.vaultCoreVersion,
    depositorPubkey: params.depositorPubkey,
    vaultProviderPubkey: params.vaultProviderPubkey,
    vaultKeeperPubkeys: params.vaultKeeperPubkeys,
    universalChallengerPubkeys: params.universalChallengerPubkeys,
    hashlocks: [...params.hashlocks],
    timelockRefund: params.timelockRefund,
    pegInAmounts: [...params.pegInAmounts],
    feeRate: params.feeRate,
    minPeginFeeRate: params.minPeginFeeRate,
    numLocalChallengers: params.numLocalChallengers,
    councilQuorum: params.councilQuorum,
    councilSize: params.councilSize,
    network: params.network,
    authAnchorHash,
  });

  // CLAUDE.md critical path #1: the WASM outputs reach JS with no runtime
  // validation. Cross-check every value-bearing field against the request
  // and the protocol formula before it can feed a signed tx or the on-chain
  // PegIn registration. Both the sizing and commit passes route through here.
  await assertWasmPeginSizing(result, params);

  // Parse the unfunded tx to sum all output values
  // (HTLCs + optional OP_RETURN + CPFP anchor). This is the amount
  // UTXOs must cover before adding network fees.
  const parsed = parseUnfundedWasmTransaction(result.txHex);

  // Bind the validated metadata to the bytes that get funded and signed:
  // the encoded HTLC outputs must carry exactly the values/scripts the
  // cross-check above validated. Otherwise a tx whose real outputs differ
  // from the checked metadata could still be funded and signed.
  assertEncodedHtlcOutputsMatch(
    parsed.outputs,
    result.htlcValues,
    result.htlcScriptPubKeys,
  );

  const totalOutputValue = parsed.outputs.reduce(
    (sum, o) => sum + BigInt(o.value),
    0n,
  );

  // The WASM places the OP_RETURN commitment immediately after the
  // HTLC outputs when authAnchorHash is provided.
  const authAnchorVout =
    authAnchorHash !== undefined ? result.htlcValues.length : null;

  return {
    psbtHex: result.txHex,
    totalOutputValue,
    htlcValues: result.htlcValues,
    htlcScriptPubKeys: result.htlcScriptPubKeys,
    htlcAddresses: result.htlcAddresses,
    peginAmounts: result.peginAmounts,
    depositorClaimValue: result.depositorClaimValue,
    authAnchorVout,
  };
}

/**
 * Validate and normalize an `authAnchorHash` hex string before passing
 * it to the WASM boundary. WASM expects exactly 64 lowercase hex chars.
 */
export function normalizeAuthAnchorHash(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const cleaned =
    value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
  if (
    cleaned.length !== AUTH_ANCHOR_HASH_HEX_LEN ||
    !HEX_PATTERN.test(cleaned)
  ) {
    throw new Error(
      `authAnchorHash must be 32-byte hex (${AUTH_ANCHOR_HASH_HEX_LEN} chars, no 0x prefix); got length ${cleaned.length}`,
    );
  }
  return cleaned.toLowerCase();
}

/**
 * Build the PegIn transaction from a funded Pre-PegIn transaction.
 *
 * The PegIn transaction spends the Pre-PegIn HTLC output at htlcVout via the
 * hashlock + all-party script (leaf 0).
 *
 * @param params - Build parameters including Pre-PegIn params and funded tx hex
 * @returns PegIn transaction details
 * @throws If WASM initialization fails or parameters are invalid
 */
export async function buildPeginTxFromFundedPrePegin(
  params: BuildPeginTxParams,
): Promise<PeginTxResult> {
  // WASM reconstructs the Pre-PegIn template from these params to
  // decode the funded tx. Must pass `authAnchorHash` (normalized
  // identically to buildPrePeginPsbt) so the reconstruction matches
  // the original outputs, including the OP_RETURN at vout =
  // hashlocks.length.
  const result = await buildPeginTxFromPrePegin(
    {
      txGraphVersion: params.prePeginParams.vaultCoreVersion,
      depositorPubkey: params.prePeginParams.depositorPubkey,
      vaultProviderPubkey: params.prePeginParams.vaultProviderPubkey,
      vaultKeeperPubkeys: params.prePeginParams.vaultKeeperPubkeys,
      universalChallengerPubkeys:
        params.prePeginParams.universalChallengerPubkeys,
      hashlocks: [...params.prePeginParams.hashlocks],
      timelockRefund: params.prePeginParams.timelockRefund,
      pegInAmounts: [...params.prePeginParams.pegInAmounts],
      feeRate: params.prePeginParams.feeRate,
      minPeginFeeRate: params.prePeginParams.minPeginFeeRate,
      numLocalChallengers: params.prePeginParams.numLocalChallengers,
      councilQuorum: params.prePeginParams.councilQuorum,
      councilSize: params.prePeginParams.councilSize,
      network: params.prePeginParams.network,
      authAnchorHash: normalizeAuthAnchorHash(
        params.prePeginParams.authAnchorHash,
      ),
    },
    params.timelockPegin,
    params.fundedPrePeginTxHex,
    params.htlcVout,
  );

  await assertPeginTxShape(result, params);

  return {
    txHex: result.txHex,
    txid: result.txid,
    vaultScriptPubKey: result.vaultScriptPubKey,
    vaultValue: result.vaultValue,
  };
}

/**
 * PegIn outputs common to every graph version: the vault output (vout 0)
 * and the depositor claim output (vout 1). Versions with a P2A anchor (v2)
 * append it after these.
 */
const PEGIN_BASE_OUTPUT_COUNT = 2;

/**
 * Vout of the depositor-claim output in every PegIn version (btc-vault:
 * vault at 0, depositor claim at 1, optional P2A anchor appended after).
 */
const PEGIN_DEPOSITOR_CLAIM_VOUT = 1;

/**
 * Cross-check the WASM-built PegIn transaction's bytes against the request
 * and the version's expected output layout before the depositor signs it.
 *
 * CLAUDE.md critical path #1: the metadata (`vaultValue`, `txid`,
 * `vaultScriptPubKey`) and the tx bytes both come from WASM — bind them to
 * each other and to the caller's requested amount so a doctored binary
 * can't commit one thing and encode another. The vault output value is the
 * exact on-chain vault amount, so it must equal the requested peg-in amount
 * (btc-vault: PegIn vout 0 carries `pegin_amount` verbatim). The P2A anchor
 * (exact value/vout/script for v2; complete absence for v1) is enforced by
 * the version-dispatched `validatePeginP2aAnchor`.
 *
 * @throws If the encoded outputs disagree with the metadata, the requested
 *   amount, or the version's anchor rules.
 */
async function assertPeginTxShape(
  result: {
    txHex: string;
    txid: string;
    vaultScriptPubKey: string;
    vaultValue: bigint;
  },
  params: BuildPeginTxParams,
): Promise<void> {
  const version = params.prePeginParams.vaultCoreVersion;

  await validatePeginP2aAnchor(version, result.txHex);

  const anchor = await peginP2aAnchorOutput(version);
  const expectedOutputCount = PEGIN_BASE_OUTPUT_COUNT + (anchor ? 1 : 0);

  const peginTx = Transaction.fromHex(stripHexPrefix(result.txHex));

  // Input bind: the PegIn must spend EXACTLY the requested HTLC outpoint
  // (fundedPrePeginTxid, htlcVout). Without this, a doctored tx could spend
  // a sibling HTLC while the caller registers it under `htlcVout` — in a
  // multi-HTLC batch that both double-spends the sibling and strands the
  // registered vault. The downstream PSBT builder follows the tx's own
  // input index, so this is the only place the requested vout is enforced.
  if (peginTx.ins.length !== 1) {
    throw new Error(
      `PegIn tx has ${peginTx.ins.length} input(s), expected exactly 1 ` +
        `(the Pre-PegIn HTLC outpoint).`,
    );
  }
  const fundedPrePeginTxid = Transaction.fromHex(
    stripHexPrefix(params.fundedPrePeginTxHex),
  ).getId();
  const inputTxid = uint8ArrayToHex(
    new Uint8Array(peginTx.ins[0].hash).slice().reverse(),
  );
  if (inputTxid !== fundedPrePeginTxid) {
    throw new Error(
      `PegIn input spends txid ${inputTxid}, expected the funded Pre-PegIn ` +
        `${fundedPrePeginTxid}.`,
    );
  }
  if (peginTx.ins[0].index !== params.htlcVout) {
    throw new Error(
      `PegIn input spends Pre-PegIn output ${peginTx.ins[0].index}, ` +
        `expected the requested HTLC vout ${params.htlcVout}.`,
    );
  }

  if (peginTx.outs.length !== expectedOutputCount) {
    throw new Error(
      `PegIn tx has ${peginTx.outs.length} output(s), expected exactly ` +
        `${expectedOutputCount} for vaultCoreVersion ${version} (vault + ` +
        `depositor claim${anchor ? " + P2A anchor" : ""}).`,
    );
  }

  const requestedAmount =
    params.prePeginParams.pegInAmounts[params.htlcVout];
  if (result.vaultValue !== requestedAmount) {
    throw new Error(
      `PegIn vault output value ${result.vaultValue} does not match the ` +
        `requested peg-in amount ${requestedAmount} for HTLC ` +
        `${params.htlcVout}; refusing to sign a vault that locks a ` +
        `different amount than requested.`,
    );
  }

  const encodedVaultOut = peginTx.outs[0];
  if (BigInt(encodedVaultOut.value) !== result.vaultValue) {
    throw new Error(
      `Encoded PegIn vault output value ${encodedVaultOut.value} does not ` +
        `match the WASM-reported vaultValue ${result.vaultValue}.`,
    );
  }
  const encodedVaultScript = encodedVaultOut.script.toString("hex");
  const expectedVaultScript = stripHexPrefix(
    result.vaultScriptPubKey,
  ).toLowerCase();
  if (encodedVaultScript.toLowerCase() !== expectedVaultScript) {
    throw new Error(
      `Encoded PegIn vault output scriptPubKey ${encodedVaultScript} does ` +
        `not match the WASM-reported vaultScriptPubKey ` +
        `${result.vaultScriptPubKey}.`,
    );
  }

  const encodedTxid = peginTx.getId();
  if (encodedTxid !== stripHexPrefix(result.txid).toLowerCase()) {
    throw new Error(
      `Encoded PegIn txid ${encodedTxid} does not match the WASM-reported ` +
        `txid ${result.txid}.`,
    );
  }

  // Depositor-claim output (vout 1): a doctored binary could burn the claim
  // into miner fee or redirect it while the vault, anchor, and txid binds
  // all pass. Bind its value to the independently recomputed minimum claim
  // value (the same WASM-vs-WASM identity `assertWasmPeginSizing` uses) and
  // its script to a fully JS-derived expectation. With the vault bind, the
  // output count, and value conservation against the validated HTLC input,
  // the implied fee is bound too.
  const expectedClaimValue = await computeMinClaimValue(
    version,
    params.prePeginParams.numLocalChallengers,
    params.prePeginParams.universalChallengerPubkeys.length,
    params.prePeginParams.councilQuorum,
    params.prePeginParams.councilSize,
    params.prePeginParams.feeRate,
  );
  const encodedClaimOut = peginTx.outs[PEGIN_DEPOSITOR_CLAIM_VOUT];
  if (BigInt(encodedClaimOut.value) !== expectedClaimValue) {
    throw new Error(
      `Encoded PegIn depositor-claim output value ${encodedClaimOut.value} ` +
        `does not match the independently computed claim value ` +
        `${expectedClaimValue} for vaultCoreVersion ${version}.`,
    );
  }

  const expectedClaimScript = deriveDepositorClaimScriptPubKey(
    params.prePeginParams.depositorPubkey,
  );
  if (!encodedClaimOut.script.equals(expectedClaimScript)) {
    throw new Error(
      `Encoded PegIn depositor-claim output scriptPubKey ` +
        `${encodedClaimOut.script.toString("hex")} does not pay to the ` +
        `depositor's claim script (expected ` +
        `${expectedClaimScript.toString("hex")}).`,
    );
  }
}

/**
 * Independently derive the PegIn depositor-claim output's scriptPubKey in
 * JS: a Taproot output with the NUMS internal key and a single
 * `<depositor> OP_CHECKSIG` leaf — btc-vault's `SingleKeyConnector`
 * (`crates/vault/src/connectors/mod.rs`, identical across graph versions).
 * Uses the same `tapInternalPubkey` NUMS constant the HTLC connector pins.
 */
function deriveDepositorClaimScriptPubKey(depositorPubkey: string): Buffer {
  const claimLeafScript = bscript.compile([
    Buffer.from(hexToUint8Array(depositorPubkey)),
    opcodes.OP_CHECKSIG,
  ]);
  const { output } = payments.p2tr({
    internalPubkey: Buffer.from(tapInternalPubkey),
    scriptTree: { output: claimLeafScript },
  });
  if (!output) {
    throw new Error(
      "Failed to derive the depositor-claim P2TR scriptPubKey for PegIn output validation",
    );
  }
  return output;
}
