/**
 * Bands a VP-built payout's implicit fee before the depositor pre-signs it.
 * Ceiling (ours, #2105) blocks a VP deflating outputs and burning the
 * difference as miner fee; floor (vault-wasm `computePayoutFeeFloor`) rejects
 * a fee no legitimate VP model produces and that may not relay at redemption.
 *
 * Caller (`buildPayoutPsbt`) must have run `assertPayoutFeeBandDomain` first,
 * and `implicitFeeSats` must be `inputs − outputs` over verified prevouts.
 * Band non-emptiness is proven by the corner sweep in the tests, not by a
 * closed-form argument — slack is not monotone at small rosters.
 *
 * @module primitives/psbt/assertPayoutFeeBand
 */

import { computePayoutFeeFloor } from "../../wasm";

/**
 * Floor-model limit, NOT a protocol bound: vault-wasm seeds dummy keys from a
 * u8, so 257 keepers trap in `VaultKeepers::new` (measured). The contract sets
 * no keeper maximum — a larger roster is an upstream vault-wasm fix.
 */
const MAX_FLOOR_MODEL_KEEPERS = 256;

/**
 * Mirrors `vault-contracts-aave-v4 ProtocolParams.sol:22`
 * MAX_UNIVERSAL_CHALLENGERS_SIZE. Safe to copy
 * rather than read: it is a bytecode `constant`, not a governance param, so it
 * cannot move without a redeploy — re-verify it on the next one.
 */
const MAX_UNIVERSAL_CHALLENGERS = 1500;

/** Floor-model limit, same u8 dummy-seeding cause as the keeper cap (measured). */
const MAX_FLOOR_MODEL_COUNCIL_SIZE = 256;

/**
 * Coarse garbage-input guard, far above the contract's own cap
 * (`vault-contracts-aave-v4 ProtocolParams.sol:44` MAX_FEE_RATE_SAT_VB = 1000).
 */
const MAX_SANE_FEE_RATE_SAT_PER_VB = 0xffffffffn;

/**
 * Ceiling vsize model `BASE + PER_PARTICIPANT * (N + M)` — ~13%+ headroom over
 * the exact vsize the VP pays. Values adopted per #2105; kept at parity with
 * the Ledger app's bound so device-signable and SDK-acceptable stay aligned.
 */
const MAX_PAYOUT_VSIZE_BASE = 500;
const MAX_PAYOUT_VSIZE_PER_PARTICIPANT = 55;

/** P2TR length the model assumes; a longer pinned outs[0] extends the ceiling linearly. */
const PAYOUT_BOUND_ASSUMED_SCRIPT_LEN = 34;

/** Shape/rate inputs the fee band is evaluated over. */
export interface PayoutFeeBandParams {
  /** Vault core (tx-graph) version — selects the floor's pinned model set. */
  vaultCoreVersion: number;
  /** Vault keeper count (N). */
  numVaultKeepers: number;
  /** Universal challenger count (M). */
  numUniversalChallengers: number;
  /** Security council size from the locked offchain params version. */
  councilSize: number;
  /** Version-locked tx-graph fee rate (sat/vB); anchors both band ends. */
  protocolFeeRate: bigint;
}

/**
 * Validate the fee-band inputs lie in the accepted domain. Bounds differ in
 * KIND per role — see each constant.
 *
 * @throws If the rate, a participant count, or `councilSize` is out of range
 */
export function assertPayoutFeeBandDomain(params: PayoutFeeBandParams): void {
  if (
    typeof params.protocolFeeRate !== "bigint" ||
    params.protocolFeeRate <= 0n ||
    params.protocolFeeRate > MAX_SANE_FEE_RATE_SAT_PER_VB
  ) {
    throw new Error(
      `protocolFeeRate must be in [1, ${MAX_SANE_FEE_RATE_SAT_PER_VB}] sat/vB, ` +
        `got ${params.protocolFeeRate}`,
    );
  }
  // Lower bound 1: btc-vault's VaultKeepers::new / UniversalChallengers::new
  // reject an empty set (crates/vault/src/lib.rs).
  for (const [role, count, max, reason] of [
    [
      "keepers",
      params.numVaultKeepers,
      MAX_FLOOR_MODEL_KEEPERS,
      "fee-floor model limit",
    ],
    [
      "challengers",
      params.numUniversalChallengers,
      MAX_UNIVERSAL_CHALLENGERS,
      "protocol maximum",
    ],
  ] as const) {
    if (!Number.isInteger(count) || count < 1 || count > max) {
      // Only an over-max count is attributable to the bound's reason.
      throw new Error(
        `Participant count for ${role} (${count}) is outside the supported ` +
          `range [1, ${max}]${count > max ? ` (${reason})` : ""}.`,
      );
    }
  }
  // Unvalidated at the WASM boundary: a non-integer truncates at the u32 ABI
  // and 0 is silently promoted to a 1-member council by the estimator.
  if (
    !Number.isInteger(params.councilSize) ||
    params.councilSize < 1 ||
    params.councilSize > MAX_FLOOR_MODEL_COUNCIL_SIZE
  ) {
    throw new Error(
      `councilSize must be an integer in ` +
        `[1, ${MAX_FLOOR_MODEL_COUNCIL_SIZE}], got ${params.councilSize}`,
    );
  }
}

/**
 * Assert `floor <= implicitFeeSats <= ceiling`. `out1Len` is `undefined` for
 * the 2-output (no-commission) layouts.
 *
 * @throws If the fee is below the floor or above the ceiling
 */
export async function assertPayoutFeeInBand(
  params: PayoutFeeBandParams,
  measured: {
    implicitFeeSats: number;
    out0Len: number;
    out1Len: number | undefined;
  },
): Promise<void> {
  const { implicitFeeSats, out0Len, out1Len } = measured;
  const numParticipants =
    params.numVaultKeepers + params.numUniversalChallengers;
  const implicitFee = BigInt(implicitFeeSats);

  // Ceiling first: synchronous, no WASM round-trip. Only outs[0] widens it —
  // including the VP-controlled out1Len would hand a padded commission script
  // up to 94 vB x rate of extra burnable band.
  const scriptExcess = Math.max(0, out0Len - PAYOUT_BOUND_ASSUMED_SCRIPT_LEN);
  const maxPayoutVsize =
    MAX_PAYOUT_VSIZE_BASE +
    MAX_PAYOUT_VSIZE_PER_PARTICIPANT * numParticipants +
    scriptExcess;
  const maxFeeSats = params.protocolFeeRate * BigInt(maxPayoutVsize);
  if (implicitFee > maxFeeSats) {
    throw new Error(
      `Payout implicit fee ${implicitFeeSats} sats exceeds the safety cap ` +
        `of ${maxFeeSats} sats (${params.protocolFeeRate} sat/vB x ` +
        `${maxPayoutVsize} vB for ${numParticipants} ` +
        `participants); refusing to sign payout.`,
    );
  }

  // Local challengers are exactly the keeper count for every claimer role
  // (btc-vault graph.rs derive_challengers).
  const minFeeSats = await computePayoutFeeFloor(
    params.vaultCoreVersion,
    params.numVaultKeepers,
    params.numUniversalChallengers,
    params.numVaultKeepers,
    params.councilSize,
    out0Len,
    out1Len,
    params.protocolFeeRate,
  );
  if (implicitFee < minFeeSats) {
    throw new Error(
      `Payout implicit fee ${implicitFeeSats} sats is below the floor of ` +
        `${minFeeSats} sats (the smallest fee any known vault-provider ` +
        `build produces for this shape); refusing to sign payout.`,
    );
  }
}
