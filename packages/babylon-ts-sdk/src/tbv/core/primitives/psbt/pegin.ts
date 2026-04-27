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
  createPrePeginTransaction,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

import { parseUnfundedWasmTransaction } from "../../utils/transaction/fundPeginTransaction";

/**
 * Parameters for building an unfunded Pre-PegIn PSBT
 */
export interface PrePeginParams {
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
  /** Fee rate in sat/vB from contract offchain params */
  feeRate: bigint;
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
  /** HTLC output values in satoshis, one per deposit (each includes peginAmount + depositorClaimValue + minPeginFee) */
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
  /** PegIn transaction hex (1 input spending HTLC, 1 vault output) */
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
    depositorPubkey: params.depositorPubkey,
    vaultProviderPubkey: params.vaultProviderPubkey,
    vaultKeeperPubkeys: params.vaultKeeperPubkeys,
    universalChallengerPubkeys: params.universalChallengerPubkeys,
    hashlocks: [...params.hashlocks],
    timelockRefund: params.timelockRefund,
    pegInAmounts: [...params.pegInAmounts],
    feeRate: params.feeRate,
    numLocalChallengers: params.numLocalChallengers,
    councilQuorum: params.councilQuorum,
    councilSize: params.councilSize,
    network: params.network,
    authAnchorHash,
  });

  // Parse the unfunded tx to sum all output values
  // (HTLCs + optional OP_RETURN + CPFP anchor). This is the amount
  // UTXOs must cover before adding network fees.
  const parsed = parseUnfundedWasmTransaction(result.txHex);
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
function normalizeAuthAnchorHash(
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
      depositorPubkey: params.prePeginParams.depositorPubkey,
      vaultProviderPubkey: params.prePeginParams.vaultProviderPubkey,
      vaultKeeperPubkeys: params.prePeginParams.vaultKeeperPubkeys,
      universalChallengerPubkeys:
        params.prePeginParams.universalChallengerPubkeys,
      hashlocks: [...params.prePeginParams.hashlocks],
      timelockRefund: params.prePeginParams.timelockRefund,
      pegInAmounts: [...params.prePeginParams.pegInAmounts],
      feeRate: params.prePeginParams.feeRate,
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

  return {
    txHex: result.txHex,
    txid: result.txid,
    vaultScriptPubKey: result.vaultScriptPubKey,
    vaultValue: result.vaultValue,
  };
}
