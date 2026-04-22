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

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Psbt } from "bitcoinjs-lib";
import type { Address, Hex } from "viem";

import type { SignPsbtOptions } from "../../../../shared/wallets/interfaces/BitcoinWallet";
import { buildRefundPsbt } from "../../primitives/psbt/refund";
import { stripHexPrefix } from "../../primitives/utils/bitcoin";
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
const REFUND_VSIZE = 160;
// Refund tx has exactly one input — the HTLC output at htlcVout from the
// Pre-PegIn tx. Used to tell the signer how many sign entries to generate.
// (Not the taproot leaf index; the leaf is encoded into the PSBT by the
// WASM PSBT builder based on the refund script path.)
const REFUND_INPUT_COUNT = 1;
const MAX_VOUT = 0xffff;
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
 * Authoritative vault fields needed to build a refund. Versioning fields,
 * the hashlock, and htlcVout must come from the on-chain contract (never the
 * indexer). The amount + `unsignedPrePeginTxHex` + `depositorBtcPubkey` can
 * come from the indexer since they are not security-critical for signing
 * (the PSBT builder re-derives the HTLC script from on-chain params).
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
  numLocalChallengers: number;
  councilQuorum: number;
  councilSize: number;
  network: Network;
}

/** Minimum shape required from a broadcast result. */
export interface BtcBroadcastResult {
  txId: string;
}

export type BtcBroadcaster<
  R extends BtcBroadcastResult = BtcBroadcastResult,
> = (signedTxHex: string) => Promise<R>;

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
  if (
    !Number.isInteger(v.htlcVout) ||
    v.htlcVout < 0 ||
    v.htlcVout > MAX_VOUT
  ) {
    throw new Error(
      `htlcVout must be an integer 0-${MAX_VOUT}, got ${v.htlcVout}`,
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
  if (typeof v.unsignedPrePeginTxHex !== "string" || v.unsignedPrePeginTxHex.length === 0) {
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
  if (
    !Number.isInteger(c.numLocalChallengers) ||
    c.numLocalChallengers < 0
  ) {
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
  const refundFee = BigInt(Math.ceil(feeRate * REFUND_VSIZE));
  signal?.throwIfAborted();

  const { psbtHex } = await buildRefundPsbt({
    prePeginParams: {
      depositorPubkey: stripHexPrefix(vault.depositorBtcPubkey),
      vaultProviderPubkey: stripHexPrefix(ctx.vaultProviderPubkey),
      vaultKeeperPubkeys: ctx.vaultKeeperPubkeys.map(stripHexPrefix),
      universalChallengerPubkeys:
        ctx.universalChallengerPubkeys.map(stripHexPrefix),
      hashlocks: [stripHexPrefix(vault.hashlock)],
      timelockRefund: ctx.timelockRefund,
      pegInAmounts: [vault.amount],
      feeRate: ctx.feeRate,
      numLocalChallengers: ctx.numLocalChallengers,
      councilQuorum: ctx.councilQuorum,
      councilSize: ctx.councilSize,
      network: ctx.network,
    },
    fundedPrePeginTxHex: stripHexPrefix(vault.unsignedPrePeginTxHex),
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
