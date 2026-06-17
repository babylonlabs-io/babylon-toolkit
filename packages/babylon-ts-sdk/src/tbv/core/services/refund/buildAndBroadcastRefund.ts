/**
 * Vault refund orchestration — reclaim BTC from an expired Pre-PegIn HTLC via
 * the CSV-timelocked refund script (leaf 1). SDK owns the sequence of:
 * fetch → fee calc → PSBT build → sign → finalize → broadcast. Pre-fetched
 * data (fee rate) is passed by value; the data-flow-dependent reads
 * (`readVault`, `readPrePeginContext(vault)`) and the interactive transports
 * (`signPsbt`, `broadcastTx`) stay as injected callbacks so the caller keeps
 * its transport choice (viem, wagmi, mempool client, etc.) and error decoding.
 *
 * @module services/refund
 */

import {
  computeMinClaimValue,
  computeMinPeginFee,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Psbt, Transaction } from "bitcoinjs-lib";
import type { Address, Hex } from "viem";

import type { SignPsbtOptions } from "../../../../shared/wallets/interfaces/BitcoinWallet";
import { findAuthAnchorOpReturn } from "../../managers/pegin";
import { assertPsbtUnsignedTxMatches } from "../../primitives/psbt/assertPsbtUnsignedTxMatches";
import { extractPayoutSignature } from "../../primitives/psbt/payout";
import { buildRefundPsbt } from "../../primitives/psbt/refund";
import { assertScriptPathSchnorrSignature } from "../../primitives/psbt/verifyScriptPathSchnorrSignature";
import {
  processPublicKeyToXOnly,
  stripHexPrefix,
} from "../../primitives/utils/bitcoin";
import { createTaprootScriptPathSignOptions } from "../../utils/signing";

import { BIP68NotMatureError } from "./errors";

const BYTES32_HEX_RE = /^0x[0-9a-fA-F]{64}$/;
// BTC raw-hex convention: 0x prefix optional, even number of hex chars, must
// be non-empty. Named distinctly from the ETH-hex regex in activateVault.ts
// (which requires a 0x prefix and allows empty "0x") to make the convention
// explicit at the call site.
const BTC_HEX_BYTES_RE = /^(?:0x)?(?:[0-9a-fA-F]{2})+$/;
// Pubkeys are either 32 bytes (x-only, 64 hex chars) or 33 bytes (compressed,
// 66 hex chars). 65 hex chars is not a valid byte length — reject it here
// rather than letting the malformed value surface as an opaque PSBT/signing
// failure later.
const PUBKEY_HEX_RE = /^(?:0x)?(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{66})$/;
// Conservative upper bound for the fixed-shape refund tx (1 P2TR script-path
// input spending the HTLC refund leaf → 1 P2TR/P2WPKH output). Taproot
// script-path witness: 64-byte Schnorr sig + refund script + control block.
// This is protocol-owned knowledge; callers don't parameterise it.
export const REFUND_VSIZE = 160;

// Hard upper bound on the per-vbyte fee rate the SDK will sign a refund at.
// Defense-in-depth: a compromised mempool endpoint can legally return up to
// 10_000 sat/vB (see mempoolApi.ts `MAX_FEE_RATE`), which on a 160-vbyte
// refund would burn up to 1.6M sats in miner fees.
//
// Sizing: during the April 2024 halving / Runes launch `fastestFee` peaked
// around 1,800 sat/vB, and `halfHourFee` tracked close to it during the
// worst of the congestion (~1,000–1,500 sat/vB range — the half-hour
// bucket converges with the fastest bucket when the queue is deep enough).
// 2000 leaves ~1.3× margin over that historical extreme so the cap doesn't
// gate legitimate refunds during a comparable event, while still blocking
// the obvious malicious case (10_000) by 5×. Small-vault burn is bounded
// separately by REFUND_MAX_FEE_FRACTION_* below, so the rate cap is free
// to be set generously here.
export const REFUND_MAX_FEE_RATE_SATS_VB = 2000;

// Hard upper bound on the absolute refund fee as a fraction of the vault
// amount. Protects small vaults where even a moderate fee rate burns a
// disproportionate share (e.g. on a 100k-sat vault, 500 sat/vB would burn
// 80%). The fraction cap binds before the rate cap whenever the vault is
// small. Expressed as numerator/denominator to keep arithmetic in bigint
// and avoid float-precision drift in the comparison.
export const REFUND_MAX_FEE_FRACTION_NUMERATOR = 10n;
export const REFUND_MAX_FEE_FRACTION_DENOMINATOR = 100n;

/**
 * Network fee (sats) the SDK will charge for a refund tx at the given
 * sat/vB rate. Mirrors the internal computation in
 * {@link buildAndBroadcastRefund} so callers (e.g. UI fee previews) don't
 * have to duplicate the constant.
 */
export function estimateRefundFeeSats(feeRateSatsVb: number): bigint {
  if (!Number.isFinite(feeRateSatsVb) || feeRateSatsVb <= 0) {
    throw new Error(
      `feeRateSatsVb must be a positive finite number, got ${feeRateSatsVb}`,
    );
  }
  return BigInt(Math.ceil(feeRateSatsVb * REFUND_VSIZE));
}
// Refund tx has exactly one input — the HTLC output at htlcVout from the
// Pre-PegIn tx. Used to tell the signer how many sign entries to generate.
// (Not the taproot leaf index; the leaf is encoded into the PSBT by the
// WASM PSBT builder based on the refund script path.)
const REFUND_INPUT_COUNT = 1;
const BIP68_ERROR_RE = /non-BIP68-final/i;

function assertBytes32(value: string, label: string): void {
  if (value.length !== 66) {
    throw new Error(
      `${label} must be 32 bytes (66 hex chars with 0x prefix), got length ${value.length}`,
    );
  }
  if (!BYTES32_HEX_RE.test(value)) {
    throw new Error(
      `${label} must contain only hex characters after the 0x prefix`,
    );
  }
}

/**
 * One vault's per-HTLC binding in a Pre-PegIn batch. Carries the fields
 * needed to reconstruct the WASM `WasmPrePeginTx` template byte-for-byte
 * against the funded transaction.
 */
export interface VaultBatchEntry {
  /** SHA-256 hashlock commitment for this vault (bytes32, 0x-prefixed). */
  hashlock: Hex;
  /** HTLC output value in satoshis for this vault. */
  amount: bigint;
  /** Index of this vault's HTLC output in the funded Pre-PegIn tx. */
  htlcVout: number;
}

/**
 * Authoritative vault fields needed to build a refund. Versioning fields,
 * the hashlock, and htlcVout must come from the on-chain contract (never the
 * indexer). The amount + `unsignedPrePeginTxHex` + `depositorBtcPubkey` can
 * come from the indexer since they are not security-critical for signing
 * (the PSBT builder re-derives the HTLC script from on-chain params).
 *
 * `batch` is the full, vout-ordered HTLC vector for the Pre-PegIn (one
 * entry per sibling vault that shares this funded transaction). For a
 * single-vault deposit this is a length-1 array. For batched deposits
 * (e.g. the Aave split) the orchestrator passes every sibling through
 * so the WASM template matches the funded tx's shape.
 */
export interface VaultRefundData {
  hashlock: Hex;
  htlcVout: number;
  offchainParamsVersion: number;
  appVaultKeepersVersion: number;
  universalChallengersVersion: number;
  vaultProvider: Address;
  applicationEntryPoint: Address;
  /** Pre-PegIn HTLC output value in satoshis. */
  amount: bigint;
  /**
   * Funded, pre-witness Pre-PegIn transaction hex. 0x prefix optional.
   * The name mirrors the contract/indexer schema; the bytes are the
   * funded form (refund construction needs real outpoints).
   */
  unsignedPrePeginTxHex: string;
  /** Depositor's BTC public key (x-only or compressed hex; 0x prefix optional). */
  depositorBtcPubkey: string;
  /**
   * Full vout-ordered HTLC vector for the funded Pre-PegIn (one entry
   * per sibling vault, including the target vault). Must satisfy
   * `batch[i].htlcVout === i` for all i, and the target's `htlcVout` /
   * `hashlock` / `amount` must equal `batch[vault.htlcVout]`.
   */
  batch: ReadonlyArray<VaultBatchEntry>;
}

/**
 * Version-resolved protocol context that parameterises the HTLC's taproot
 * scripts. The *signer-set* fields (`vaultKeeperPubkeys`,
 * `universalChallengerPubkeys`) and the version-locked numeric protocol
 * params **must** be sourced from the on-chain contract at the version
 * pinned in {@link VaultRefundData} — this is the trust boundary.
 * `vaultProviderPubkey` today is sourced from the GraphQL indexer via
 * `fetchVaultProviderById`; the caller is responsible for any additional
 * cross-check it requires. Keeper and challenger pubkey arrays must be
 * pre-sorted the same way the Rust protocol sorts them (canonical for
 * script derivation).
 */
export interface RefundPrePeginContext {
  vaultProviderPubkey: string;
  vaultKeeperPubkeys: readonly string[];
  universalChallengerPubkeys: readonly string[];
  timelockRefund: number;
  feeRate: bigint;
  minPeginFeeRate: bigint;
  numLocalChallengers: number;
  councilQuorum: number;
  councilSize: number;
  network: Network;
}

/** Minimum shape required from a broadcast result. */
export interface BtcBroadcastResult {
  txId: string;
}

export type BtcBroadcaster<R extends BtcBroadcastResult = BtcBroadcastResult> =
  (signedTxHex: string) => Promise<R>;

export type RefundPsbtSigner = (
  psbtHex: string,
  opts: SignPsbtOptions,
) => Promise<string>;

export interface RefundInput<
  R extends BtcBroadcastResult = BtcBroadcastResult,
> {
  vaultId: Hex;
  /**
   * Fetch authoritative on-chain + indexer vault data. The SDK passes no
   * arguments — the caller closes over `vaultId` (or any other context it
   * needs).
   */
  readVault: () => Promise<VaultRefundData>;
  /**
   * Fetch the version-pinned refund context (sorted pubkeys, timelock, etc.)
   * derived from the vault's locked versions.
   */
  readPrePeginContext: (
    vault: VaultRefundData,
  ) => Promise<RefundPrePeginContext>;
  /**
   * Mempool-derived sat/vB fee rate to use for the refund tx (positive
   * number). Caller fetches this before invoking — it does not depend on
   * any value the SDK computes, and folding it into the call keeps the
   * orchestration honest.
   */
  feeRate: number;
  /** BTC wallet signer; receives a PSBT hex + taproot script-path options. */
  signPsbt: RefundPsbtSigner;
  /** Broadcast callback — returns whatever shape the caller needs. */
  broadcastTx: BtcBroadcaster<R>;
  /** Checked at every async boundary. */
  signal?: AbortSignal;
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${value}`);
  }
}

function validateVaultRefundData(v: VaultRefundData): void {
  assertBytes32(v.hashlock, "hashlock");
  if (!Number.isInteger(v.htlcVout) || v.htlcVout < 0) {
    throw new Error(
      `htlcVout must be a non-negative integer, got ${v.htlcVout}`,
    );
  }
  // Batch shape — one entry per sibling HTLC, vout-ordered and
  // contiguous from 0. The reconstructed WASM template uses these
  // arrays directly: any gap, duplicate, or mis-ordering against the
  // funded tx would produce an unspendable refund. The target's
  // (hashlock, amount, htlcVout) must equal the corresponding batch
  // entry so the orchestrator and the caller can't disagree about
  // which output is being refunded.
  if (!Array.isArray(v.batch) || v.batch.length === 0) {
    throw new Error("batch must be a non-empty array of HTLC entries");
  }
  if (v.htlcVout >= v.batch.length) {
    throw new Error(
      `htlcVout ${v.htlcVout} is out of range for batch of size ${v.batch.length}`,
    );
  }
  for (let i = 0; i < v.batch.length; i++) {
    const entry = v.batch[i];
    assertBytes32(entry.hashlock, `batch[${i}].hashlock`);
    if (!Number.isInteger(entry.htlcVout) || entry.htlcVout !== i) {
      throw new Error(
        `batch[${i}].htlcVout must equal ${i} (contiguous vout-ordered vector), got ${entry.htlcVout}`,
      );
    }
    if (typeof entry.amount !== "bigint" || entry.amount <= 0n) {
      throw new Error(
        `batch[${i}].amount must be a positive bigint, got ${entry.amount}`,
      );
    }
  }
  const targetEntry = v.batch[v.htlcVout];
  if (targetEntry.hashlock.toLowerCase() !== v.hashlock.toLowerCase()) {
    throw new Error(
      `batch[${v.htlcVout}].hashlock (${targetEntry.hashlock}) does not match target hashlock (${v.hashlock})`,
    );
  }
  if (targetEntry.amount !== v.amount) {
    throw new Error(
      `batch[${v.htlcVout}].amount (${targetEntry.amount}) does not match target amount (${v.amount})`,
    );
  }
  // Version fields flow directly into on-chain script derivation via
  // `readPrePeginContext` — NaN, negative, or non-integer values would
  // silently produce wrong scripts. Guard here as defence in depth even
  // though the caller sources these from bigint on-chain reads.
  assertNonNegativeInteger(v.offchainParamsVersion, "offchainParamsVersion");
  assertNonNegativeInteger(v.appVaultKeepersVersion, "appVaultKeepersVersion");
  assertNonNegativeInteger(
    v.universalChallengersVersion,
    "universalChallengersVersion",
  );
  if (
    typeof v.unsignedPrePeginTxHex !== "string" ||
    v.unsignedPrePeginTxHex.length === 0
  ) {
    throw new Error("unsignedPrePeginTxHex must be a non-empty hex string");
  }
  if (!BTC_HEX_BYTES_RE.test(v.unsignedPrePeginTxHex)) {
    throw new Error(
      "unsignedPrePeginTxHex must be a hex byte string (optional 0x prefix, even length)",
    );
  }
  if (!v.depositorBtcPubkey || !PUBKEY_HEX_RE.test(v.depositorBtcPubkey)) {
    throw new Error(
      "depositorBtcPubkey must be 32 or 33 bytes of hex (optional 0x prefix)",
    );
  }
  if (typeof v.amount !== "bigint" || v.amount <= 0n) {
    throw new Error(`amount must be a positive bigint, got ${v.amount}`);
  }
}

function validateRefundPrePeginContext(c: RefundPrePeginContext): void {
  if (!c.vaultProviderPubkey || !PUBKEY_HEX_RE.test(c.vaultProviderPubkey)) {
    throw new Error("vaultProviderPubkey must be 32 or 33 bytes of hex");
  }
  if (c.vaultKeeperPubkeys.length === 0) {
    throw new Error("vaultKeeperPubkeys must be non-empty");
  }
  if (c.universalChallengerPubkeys.length === 0) {
    throw new Error("universalChallengerPubkeys must be non-empty");
  }
  if (!Number.isInteger(c.timelockRefund) || c.timelockRefund <= 0) {
    throw new Error(
      `timelockRefund must be a positive integer, got ${c.timelockRefund}`,
    );
  }
  if (typeof c.feeRate !== "bigint" || c.feeRate <= 0n) {
    throw new Error(
      `protocol feeRate must be a positive bigint, got ${c.feeRate}`,
    );
  }
  if (typeof c.minPeginFeeRate !== "bigint" || c.minPeginFeeRate <= 0n) {
    throw new Error(
      `minPeginFeeRate must be a positive bigint, got ${c.minPeginFeeRate}`,
    );
  }
  if (!Number.isInteger(c.numLocalChallengers) || c.numLocalChallengers < 0) {
    throw new Error("numLocalChallengers must be a non-negative integer");
  }
  if (
    !Number.isInteger(c.councilQuorum) ||
    !Number.isInteger(c.councilSize) ||
    c.councilQuorum <= 0 ||
    c.councilSize <= 0 ||
    c.councilQuorum > c.councilSize
  ) {
    throw new Error(
      `councilQuorum (${c.councilQuorum}) must be in [1, councilSize=${c.councilSize}]`,
    );
  }
}

/**
 * Re-derive each HTLC's original peg-in amount from its on-chain HTLC output
 * value, inverting the protocol formula
 * `htlcValue = peginAmount + depositorClaimValue + minPeginFee`.
 *
 * The original peg-in amount is not persisted anywhere — only the HTLC output
 * value (`batch[i].amount`) survives on-chain. WASM refund template
 * reconstruction needs the *peg-in amount*, not the HTLC value: feeding the
 * HTLC value would size the template's HTLC output above what the funded tx
 * carries, and `buildRefundPsbt`'s value cross-check would refuse the refund.
 *
 * `depositorClaimValue` and `minPeginFee` are constant across the batch
 * (fixed by the version-pinned protocol params in {@link ctx}), so they are
 * computed once via the same WASM entry points the peg-in path uses, then
 * subtracted from every entry's value. The subtraction is the inverse of the
 * sizing WASM performs internally; `buildRefundPsbt` then re-binds the result
 * to the funded tx bytes, so a wrong derivation fails closed rather than
 * signing a mis-sized refund.
 */
export async function deriveRefundPeginAmounts(
  batch: ReadonlyArray<VaultBatchEntry>,
  ctx: RefundPrePeginContext,
): Promise<bigint[]> {
  const depositorClaimValue = await computeMinClaimValue(
    ctx.numLocalChallengers,
    ctx.universalChallengerPubkeys.length,
    ctx.councilQuorum,
    ctx.councilSize,
    ctx.feeRate,
  );
  const minPeginFee = await computeMinPeginFee(
    ctx.vaultKeeperPubkeys.length,
    ctx.universalChallengerPubkeys.length,
    ctx.minPeginFeeRate,
  );
  const reserved = depositorClaimValue + minPeginFee;

  return batch.map((entry, i) => {
    const peginAmount = entry.amount - reserved;
    if (peginAmount <= 0n) {
      throw new Error(
        `Re-derived peginAmount for batch[${i}] is non-positive ` +
          `(${peginAmount}): HTLC value ${entry.amount} does not exceed ` +
          `depositorClaimValue ${depositorClaimValue} + minPeginFee ` +
          `${minPeginFee}. Refusing to build a refund from an inconsistent ` +
          `(amount, protocol params) pair.`,
      );
    }
    return peginAmount;
  });
}

function finalizeAndExtract(signedPsbtHex: string): string {
  const psbt = Psbt.fromHex(signedPsbtHex);
  try {
    psbt.finalizeAllInputs();
  } catch (e: unknown) {
    // Some wallets (e.g. Keystone) finalize during signPsbt; bitcoinjs then
    // throws "Input is already finalized". Treat that case as a no-op.
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes("already finalized")) {
      throw new Error(`Failed to finalize refund PSBT: ${message}`);
    }
  }
  return psbt.extractTransaction().toHex();
}

/**
 * Build, sign, and broadcast a refund transaction for an expired vault.
 *
 * Trust boundary: `readVault` must source the hashlock, htlcVout, and
 * versioning fields from the on-chain contract — an indexer-only path
 * leaves the refund flow open to signer-set substitution. The SDK does
 * not enforce this; it is the caller's responsibility.
 *
 * The broadcast transport is expected to surface Bitcoin's `non-BIP68-final`
 * policy rejection as an `Error` whose message contains that string; when
 * it does, the SDK wraps it in {@link BIP68NotMatureError}. All other
 * transport errors propagate unchanged.
 *
 * @returns whatever the injected `broadcastTx` returns (generic pass-through)
 * @throws `Error` if any validation fails
 * @throws {@link BIP68NotMatureError} if the broadcast is rejected because
 *         the refund CSV timelock has not yet matured
 * @throws anything `readVault`, `readPrePeginContext`,
 *         `signPsbt`, or `broadcastTx` throws
 */
export async function buildAndBroadcastRefund<
  R extends BtcBroadcastResult = BtcBroadcastResult,
>(input: RefundInput<R>): Promise<R> {
  const {
    vaultId,
    readVault,
    readPrePeginContext,
    feeRate,
    signPsbt,
    broadcastTx,
    signal,
  } = input;

  signal?.throwIfAborted();
  assertBytes32(vaultId, "vaultId");

  const vault = await readVault();
  validateVaultRefundData(vault);
  signal?.throwIfAborted();

  const ctx = await readPrePeginContext(vault);
  validateRefundPrePeginContext(ctx);
  signal?.throwIfAborted();

  if (!Number.isFinite(feeRate) || feeRate <= 0) {
    throw new Error(`feeRate must be a positive number, got ${feeRate}`);
  }
  // Rate cap: fail closed before PSBT construction if the seeded value
  // exceeds the safety ceiling. A compromised mempool API (or upstream
  // proxy / BGP hijack) can otherwise drive `halfHourFee` to the API's
  // 10_000 sat/vB ceiling and burn the refund as miner fee.
  if (feeRate > REFUND_MAX_FEE_RATE_SATS_VB) {
    throw new Error(
      `feeRate ${feeRate} sat/vB exceeds refund safety cap ` +
        `${REFUND_MAX_FEE_RATE_SATS_VB} sat/vB; refusing to sign refund.`,
    );
  }
  const refundFee = BigInt(Math.ceil(feeRate * REFUND_VSIZE));
  // Fraction cap: even within the rate ceiling, refuse to sign if the
  // absolute fee would consume more than the configured percentage of the
  // vault amount. Protects small vaults from disproportionate burn.
  const maxFeeByFraction =
    (vault.amount * REFUND_MAX_FEE_FRACTION_NUMERATOR) /
    REFUND_MAX_FEE_FRACTION_DENOMINATOR;
  if (refundFee > maxFeeByFraction) {
    throw new Error(
      `Refund fee ${refundFee} sats exceeds the per-vault safety cap ` +
        `of ${maxFeeByFraction} sats ` +
        `(${REFUND_MAX_FEE_FRACTION_NUMERATOR}/${REFUND_MAX_FEE_FRACTION_DENOMINATOR} ` +
        `of vault.amount=${vault.amount}); refusing to sign refund.`,
    );
  }
  signal?.throwIfAborted();

  // `vault.depositorBtcPubkey` may arrive as wallet-native compressed sec1
  // (33 bytes) because the caller fetches it live from the wallet for
  // signing. WASM script derivation wants x-only (32 bytes), so normalize
  // here; the raw form is kept for the wallet sign call below.
  const xOnlyDepositorPubkey = processPublicKeyToXOnly(
    vault.depositorBtcPubkey,
  );

  const cleanFundedPrePeginTxHex = stripHexPrefix(vault.unsignedPrePeginTxHex);

  // Production peg-ins (PeginManager) commit an OP_RETURN <PUSH32
  // SHA256(authAnchor)> output at `vout = hashlocks.length`. The
  // reconstructed unfunded template carries `batch.length` HTLC outputs,
  // so the OP_RETURN — when present — must sit at exactly that vout.
  // Legacy non-auth-anchored Pre-PegIns return `undefined` from the
  // finder; the template then has no OP_RETURN either, which is a
  // matching configuration.
  const found = findAuthAnchorOpReturn(cleanFundedPrePeginTxHex);
  if (found !== undefined && found.vout !== vault.batch.length) {
    throw new Error(
      `Auth-anchor OP_RETURN at vout ${found.vout} does not match batch size ` +
        `(${vault.batch.length} HTLC outputs expect the anchor at vout ${vault.batch.length}). ` +
        `Refund refused — sibling HTLC vector is incomplete.`,
    );
  }
  const authAnchorHash = found?.hash;

  // Independent structural check on the funded tx: it must carry at
  // least N HTLC outputs (one per batch entry). If the anchor is
  // present we've already pinned its position above, which transitively
  // proves the tx has ≥ N+1 outputs; if the anchor is absent (legacy)
  // we still need ≥ N to spend `htlcVout = N-1`.
  let parsedFundedTx: Transaction;
  try {
    parsedFundedTx = Transaction.fromHex(cleanFundedPrePeginTxHex);
  } catch (e) {
    throw new Error(
      `Failed to parse funded Pre-PegIn transaction hex: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (parsedFundedTx.outs.length < vault.batch.length) {
    throw new Error(
      `Funded Pre-PegIn tx has ${parsedFundedTx.outs.length} outputs but batch ` +
        `requires at least ${vault.batch.length} HTLC outputs. ` +
        `Refund refused — funded tx shape disagrees with sibling vector.`,
    );
  }

  // Re-derive the original peg-in amounts from the on-chain HTLC values.
  // `batch[i].amount` is the HTLC *output* value, not the peg-in amount the
  // WASM template constructor expects; feeding it verbatim mis-sizes the
  // template. The derivation is bound back to the funded tx bytes by
  // `buildRefundPsbt`'s value cross-check, so an inconsistent result fails
  // closed instead of producing a mis-sized refund.
  const refundPeginAmounts = await deriveRefundPeginAmounts(vault.batch, ctx);
  signal?.throwIfAborted();

  const { psbtHex } = await buildRefundPsbt({
    prePeginParams: {
      depositorPubkey: xOnlyDepositorPubkey,
      vaultProviderPubkey: stripHexPrefix(ctx.vaultProviderPubkey),
      vaultKeeperPubkeys: ctx.vaultKeeperPubkeys.map(stripHexPrefix),
      universalChallengerPubkeys:
        ctx.universalChallengerPubkeys.map(stripHexPrefix),
      hashlocks: vault.batch.map((b) => stripHexPrefix(b.hashlock)),
      timelockRefund: ctx.timelockRefund,
      pegInAmounts: refundPeginAmounts,
      feeRate: ctx.feeRate,
      minPeginFeeRate: ctx.minPeginFeeRate,
      numLocalChallengers: ctx.numLocalChallengers,
      councilQuorum: ctx.councilQuorum,
      councilSize: ctx.councilSize,
      network: ctx.network,
      authAnchorHash,
    },
    fundedPrePeginTxHex: cleanFundedPrePeginTxHex,
    htlcVout: vault.htlcVout,
    refundFee,
    // buildRefundPsbt's top-level `hashlock` param is documented as "no 0x
    // prefix" and flows into the WASM HTLC connector derivation; a prefixed
    // value would derive the wrong refund script leaf and yield an
    // unspendable PSBT. Match the `hashlocks` array handling above.
    hashlock: stripHexPrefix(vault.hashlock),
  });
  signal?.throwIfAborted();

  const signOptions = createTaprootScriptPathSignOptions(
    vault.depositorBtcPubkey,
    REFUND_INPUT_COUNT,
  );
  const signedPsbtHex = await signPsbt(psbtHex, signOptions);

  assertPsbtUnsignedTxMatches({
    requestedPsbtHex: psbtHex,
    returnedPsbtHex: signedPsbtHex,
  });

  // Critical Path #7: verify the depositor's script-path signature against a
  // sighash recomputed from the PSBT we built before finalizing and broadcasting.
  // The refund spends a single input (the HTLC output) on input 0.
  const REFUND_SIGNED_INPUT_INDEX = 0;
  const refundSignature = extractPayoutSignature(
    signedPsbtHex,
    xOnlyDepositorPubkey,
    REFUND_SIGNED_INPUT_INDEX,
  );
  assertScriptPathSchnorrSignature({
    requestedPsbtHex: psbtHex,
    signatureHex: refundSignature,
    signerXOnlyPubkeyHex: xOnlyDepositorPubkey,
    inputIndex: REFUND_SIGNED_INPUT_INDEX,
  });

  const signedTxHex = finalizeAndExtract(signedPsbtHex);
  signal?.throwIfAborted();

  try {
    return await broadcastTx(signedTxHex);
  } catch (error) {
    if (error instanceof Error && BIP68_ERROR_RE.test(error.message)) {
      throw new BIP68NotMatureError(vaultId, error);
    }
    throw error;
  }
}
