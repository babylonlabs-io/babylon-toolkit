/**
 * Explicit lazy boundary around the vault-WASM engine package.
 *
 * Importing the SDK (including its legacy root barrels) does not resolve the
 * WASM package or generated binary. The engine is loaded only when a caller
 * invokes an operation that actually needs the Bitcoin transaction graph.
 * ETH-only entry points never import this module.
 *
 * @module tbv/core/wasm
 */

import type {
  AssertNoPayoutScriptInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
  HtlcConnectorInfo,
  HtlcConnectorParams,
  Network,
  PayoutConnectorInfo,
  PayoutConnectorParams,
  PeginP2aAnchorInfo,
  PeginTxResult,
  PrePeginParams,
  PrePeginResult,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";

export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants";

type TbvWasmModule = typeof import("@babylonlabs-io/babylon-tbv-rust-wasm");

let wasmModulePromise: Promise<TbvWasmModule> | undefined;
type RawTbvWasmModule =
  typeof import("@babylonlabs-io/babylon-tbv-rust-wasm/raw");
let rawWasmModulePromise: Promise<RawTbvWasmModule> | undefined;

/** Load the WASM engine on first use and share the in-flight import. */
export function loadTbvWasm(): Promise<TbvWasmModule> {
  wasmModulePromise ??= import("@babylonlabs-io/babylon-tbv-rust-wasm").catch(
    (error: unknown) => {
      wasmModulePromise = undefined;
      throw new Error(
        "The vault-WASM engine @babylonlabs-io/babylon-tbv-rust-wasm failed " +
          "to load. The module could not be resolved, or it threw while " +
          "evaluating, commonly a missing or stale generated WASM build. " +
          "See the cause for the underlying error.",
        { cause: error },
      );
    },
  );
  return wasmModulePromise;
}

/**
 * Load the explicit raw-class entry for the one SDK primitive that must
 * reconstruct a stateful WASM transaction object (refund construction).
 */
export function loadRawTbvWasm(): Promise<RawTbvWasmModule> {
  rawWasmModulePromise ??= import("@babylonlabs-io/babylon-tbv-rust-wasm/raw")
    .catch((error: unknown) => {
      rawWasmModulePromise = undefined;
      throw new Error(
        "The raw vault-WASM entry @babylonlabs-io/babylon-tbv-rust-wasm/raw " +
          "failed to load. The module could not be resolved, or it threw " +
          "while evaluating. See the cause for the underlying error.",
        { cause: error },
      );
    })
    .then(async (wasm) => {
      try {
        await wasm.initWasm();
      } catch (error: unknown) {
        rawWasmModulePromise = undefined;
        throw new Error(
          "The raw vault-WASM entry resolved but its WebAssembly " +
            "binary failed to initialize.",
          { cause: error },
        );
      }
      return wasm;
    });
  return rawWasmModulePromise;
}

/**
 * Creates an unfunded Pre-PegIn transaction with no inputs and HTLC output(s).
 *
 * The HTLC output value (htlcValue) covers the peg-in amount, depositor claim value,
 * and minimum pegin fee — all computed internally from the provided contract parameters.
 *
 * After building the Pre-PegIn transaction, the caller must:
 * 1. Select UTXOs covering htlcValue + network fees
 * 2. Fund the transaction (add inputs and change output)
 * 3. Call reconstructFromFundedTx() with the funded tx hex
 * 4. Call buildPeginTx() to derive the PegIn transaction
 * 5. Sign the PegIn input using the HTLC hashlock leaf (leaf 0)
 *
 * @param params - Pre-PegIn parameters from contract and depositor wallet
 * @returns Unfunded transaction details with HTLC output information
 */
export async function createPrePeginTransaction(
  params: PrePeginParams,
): Promise<PrePeginResult> {
  return (await loadTbvWasm()).createPrePeginTransaction(params);
}

/**
 * Derives the PegIn transaction from a funded Pre-PegIn transaction.
 *
 * The PegIn transaction has a single input spending the Pre-PegIn HTLC output
 * at `htlcVout` via the hashlock + all-party script (leaf 0).
 *
 * @param params - Same PrePeginParams used to create the Pre-PegIn transaction
 * @param timelockPegin - CSV timelock in blocks for the PegIn vault output
 * @param fundedPrePeginTxHex - Hex-encoded funded Pre-PegIn transaction
 * @param htlcVout - Index of the HTLC output to spend
 * @returns PegIn transaction details including vault output information
 */
export async function buildPeginTxFromPrePegin(
  params: PrePeginParams,
  timelockPegin: number,
  fundedPrePeginTxHex: string,
  htlcVout: number,
): Promise<PeginTxResult> {
  return (await loadTbvWasm()).buildPeginTxFromPrePegin(
    params,
    timelockPegin,
    fundedPrePeginTxHex,
    htlcVout,
  );
}

/**
 * Returns HTLC connector script info for signing the PegIn transaction input.
 *
 * The depositor signs PegIn input 0 using the hashlock leaf (leaf 0) of the
 * Pre-PegIn HTLC output. Use getHashlockScript() and getHashlockControlBlock()
 * to construct the tapLeafScript entry in the PSBT.
 *
 * @param params - HTLC connector parameters (subset of PrePeginParams)
 * @returns Hashlock and refund script info for PSBT construction
 */
export async function getPrePeginHtlcConnectorInfo(
  params: HtlcConnectorParams,
): Promise<HtlcConnectorInfo> {
  return (await loadTbvWasm()).getPrePeginHtlcConnectorInfo(params);
}

/**
 * Compute the minimum depositor claim value (PegIn output 1) in satoshis.
 *
 * This covers the full downstream tx graph cost (Claim → Assert → Payout)
 * based on the protocol parameters.
 */
export async function computeMinClaimValue(
  txGraphVersion: number,
  numLocalChallengers: number,
  numUniversalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): Promise<bigint> {
  return (await loadTbvWasm()).computeMinClaimValue(
    txGraphVersion,
    numLocalChallengers,
    numUniversalChallengers,
    councilQuorum,
    councilSize,
    feeRate,
  );
}

/**
 * Compute the minimum PegIn (activation) transaction fee in satoshis.
 *
 * `minPeginFee = peginTxVsize(numVks, numUcs) × minPeginFeeRate`. Each HTLC
 * the depositor funds in the Pre-PegIn tx must reserve at least this fee
 * inside its value (`htlcValue = peginAmount + depositorClaimValue +
 * minPeginFee`), otherwise the VP cannot afford to broadcast the PegIn at
 * activation. The vsize comes from a Taproot script-path-spend weight
 * prediction whose witness shape depends on the VK + UC signer count.
 */
export async function computeMinPeginFee(
  txGraphVersion: number,
  numVks: number,
  numUcs: number,
  minPeginFeeRate: bigint,
): Promise<bigint> {
  return (await loadTbvWasm()).computeMinPeginFee(
    txGraphVersion,
    numVks,
    numUcs,
    minPeginFeeRate,
  );
}

/**
 * Floor of the Payout transaction fee under `txGraphVersion`: the minimum of
 * `estimatedVsize * feeRate` across every output-sizing model a deployed
 * vault provider is known to have used (fixed-34, intermediate,
 * script-aware). A VP-built payout paying less than this is provably not
 * produced by any known VP build. `out0Len` must be the TRUSTED length of the
 * pinned outs[0] script (1..=128); `out1Len` is the measured, UNTRUSTED
 * commission-script length — safe here because padding cannot raise the floor
 * (the fixed-34 model saturates the minimum) and shortening only lowers it.
 * Pass `undefined` for `out1Len` on 2-output (non-VP-claimer) payouts.
 * `feeRate` is the vault's version-locked `offchainParams.feeRate`.
 */
export async function computePayoutFeeFloor(
  txGraphVersion: number,
  numVaultKeepers: number,
  numUniversalChallengers: number,
  numLocalChallengers: number,
  councilSize: number,
  out0Len: number,
  out1Len: number | null | undefined,
  feeRate: bigint,
): Promise<bigint> {
  return (await loadTbvWasm()).computePayoutFeeFloor(
    txGraphVersion,
    numVaultKeepers,
    numUniversalChallengers,
    numLocalChallengers,
    councilSize,
    out0Len,
    out1Len,
    feeRate,
  );
}

/**
 * Tx graph versions the shipped vault-wasm binary can build. Callers must
 * preflight the required version (fresh: active; resume: stamped) against
 * this list and fail closed instead of hitting per-call errors mid-flow.
 *
 * Note: the facade constructors themselves fail closed on unsupported
 * versions, and derived objects carry the version they were built with —
 * value-level cross-checks live in `assertWasmPeginSizing` and the golden
 * byte-parity tests, not in a per-call version echo.
 */
export async function supportedTxGraphVersions(): Promise<number[]> {
  return (await loadTbvWasm()).supportedTxGraphVersions();
}

/**
 * The PegIn transaction's P2A (pay-to-anchor) output for a graph version, or
 * `null` when that version's PegIn carries no anchor (v1). The facade returns
 * one record per version — never a zero-valued placeholder — so an absent
 * anchor can't be mistaken for a real output. For v2/v3: 240 sats at vout 2,
 * script `51024e73`.
 */
export async function peginP2aAnchorOutput(
  txGraphVersion: number,
): Promise<PeginP2aAnchorInfo | null> {
  return (await loadTbvWasm()).peginP2aAnchorOutput(txGraphVersion);
}

/**
 * Validate a PegIn transaction's P2A anchor against a graph version's rules:
 * v2 and v3 require the exact anchor (240 sats, vout 2, P2A script) and v1
 * requires that NO output carries the P2A script. Throws on any mismatch — a
 * v2 PegIn checked as v1 fails closed, and vice versa.
 */
export async function validatePeginP2aAnchor(
  txGraphVersion: number,
  txHex: string,
): Promise<void> {
  return (await loadTbvWasm()).validatePeginP2aAnchor(txGraphVersion, txHex);
}

/**
 * Creates a payout connector for vault transactions.
 *
 * The payout connector generates the necessary taproot scripts and information
 * required for signing payout transactions (both optimistic and regular payout paths).
 *
 * @param params - Parameters for creating the payout connector
 * @param network - Bitcoin network
 * @returns Payout connector information including scripts, hashes, and address
 */
export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network,
): Promise<PayoutConnectorInfo> {
  return (await loadTbvWasm()).createPayoutConnector(params, network);
}

/**
 * Get the Payout script and control block for the depositor's Assert output.
 *
 * Used to build the depositor's Payout PSBT (depositor-as-claimer path).
 *
 * @param params - Assert Payout/NoPayout connector parameters
 * @returns Payout script and control block (hex encoded)
 */
export async function getAssertPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
): Promise<AssertPayoutScriptInfo> {
  return (await loadTbvWasm()).getAssertPayoutScriptInfo(params);
}

/**
 * Get the NoPayout script and control block for a specific challenger.
 *
 * Used to build the depositor's NoPayout PSBT (depositor-as-claimer path).
 * Each challenger has a distinct NoPayout script.
 *
 * @param params - Assert Payout/NoPayout connector parameters
 * @param challengerPubkey - The challenger's x-only public key (hex encoded)
 * @returns NoPayout script and control block (hex encoded)
 */
export async function getAssertNoPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
  challengerPubkey: string,
): Promise<AssertNoPayoutScriptInfo> {
  return (await loadTbvWasm()).getAssertNoPayoutScriptInfo(
    params,
    challengerPubkey,
  );
}

/**
 * Get the ChallengeAssert script and control block.
 *
 * Used to build ChallengeAssert PSBTs for the depositor-as-claimer path.
 * Each challenger has 3 ChallengeAssert transactions, and this connector
 * generates the spending scripts using WOTS public keys from the VP.
 *
 * @param params - ChallengeAssert connector parameters
 * @returns Script and control block (hex encoded)
 */
export async function getChallengeAssertScriptInfo(
  params: ChallengeAssertConnectorParams,
): Promise<ChallengeAssertScriptInfo> {
  return (await loadTbvWasm()).getChallengeAssertScriptInfo(params);
}

/**
 * Derive 32-byte `authAnchor` (OP_RETURN preimage → VP bearer token).
 * @stability frozen — forwards the frozen expander in `@babylonlabs-io/babylon-tbv-rust-wasm`; see CLAUDE.md §4.
 */
/**
 * Derive 32-byte `authAnchor` (OP_RETURN preimage → VP bearer token).
 * @stability frozen — owned by btc-vault Rust via the vault-wasm pin (`VAULT_WASM_COMMIT`); rotation breaks VP auth for existing deposits.
 */
export async function expandAuthAnchor(root: Uint8Array): Promise<Uint8Array> {
  return (await loadTbvWasm()).expandAuthAnchor(root);
}

/**
 * Derive 32-byte `hashlockSecret` for HTLC `htlcVout` (preimage → `activateVaultWithSecret`).
 * @stability frozen — forwards the frozen expander in `@babylonlabs-io/babylon-tbv-rust-wasm`; see CLAUDE.md §4.
 */
/**
 * Derive 32-byte `hashlockSecret` for HTLC `htlcVout` (preimage → `activateVaultWithSecret`).
 * @stability frozen — owned by btc-vault Rust; rotation means affected vaults can never activate.
 */
export async function expandHashlockSecret(
  root: Uint8Array,
  htlcVout: number,
): Promise<Uint8Array> {
  return (await loadTbvWasm()).expandHashlockSecret(root, htlcVout);
}

/**
 * Derive 64-byte `wotsSeed` for HTLC `htlcVout` (→ WOTS keys, hashed as `depositorWotsPkHash`).
 * @stability frozen — forwards the frozen expander in `@babylonlabs-io/babylon-tbv-rust-wasm`; see CLAUDE.md §4.
 */
/**
 * Derive 64-byte `wotsSeed` for HTLC `htlcVout` (→ WOTS keys, hashed as `depositorWotsPkHash`).
 * @stability frozen — owned by btc-vault Rust; rotation breaks existing `depositorWotsPkHash` → no claim path.
 */
export async function expandWotsSeed(
  root: Uint8Array,
  htlcVout: number,
): Promise<Uint8Array> {
  return (await loadTbvWasm()).expandWotsSeed(root, htlcVout);
}

/**
 * Derives the vault ID from a PegIn transaction hash and depositor ETH address.
 *
 * Vault ID = keccak256(abi.encode(peginTxHash, depositor))
 * This matches the Solidity-side derivation in BTCVaultRegistry.
 *
 * @param peginTxHash - 32-byte PegIn tx hash in display order (big-endian), hex encoded
 * @param depositor - 20-byte Ethereum address of the depositor, hex encoded
 * @returns Hex-encoded vault ID (32 bytes)
 */
export async function deriveVaultId(
  peginTxHash: string,
  depositor: string,
): Promise<string> {
  return (await loadTbvWasm()).deriveVaultId(peginTxHash, depositor);
}

export type {
  AssertNoPayoutScriptInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
  HtlcConnectorInfo,
  HtlcConnectorParams,
  Network,
  PayoutConnectorInfo,
  PayoutConnectorParams,
  PeginP2aAnchorInfo,
  PeginTxResult,
  PrePeginParams,
  PrePeginResult,
};
