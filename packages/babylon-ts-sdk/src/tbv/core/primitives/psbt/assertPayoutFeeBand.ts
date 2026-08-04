/**
 * Payout implicit-fee band validation (floor + ceiling).
 *
 * Bands the implicit fee of a VP-built payout transaction before the
 * depositor pre-signs it:
 * - Ceiling: the Ledger device's payout vsize model (`app-babylon-vault`
 *   `sign_psbt_validate.c`, HLD v22 §4.9.7.1) extended by measured script
 *   excess over its 34-byte assumption — blocks a VP deflating outputs and
 *   burning the difference as miner fee.
 * - Floor: the minimum fee any known VP output-sizing model produces
 *   (vault-wasm `computePayoutFeeFloor`) — a lower fee is provably
 *   illegitimate and risks a payout that cannot relay at redemption time.
 *
 * Preconditions, enforced by the caller (`buildPayoutPsbt`):
 * - `assertPayoutFeeBandDomain` has accepted the rate and participant counts,
 *   so the band runs exactly over the domain its dominance proof was swept.
 * - `out0Len` is the layout-trusted length of the PINNED outs[0] script.
 *   `out1Len` is measured from the deliberately-unpinned VP commission
 *   output and is UNTRUSTED: it feeds only the floor, where padding cannot
 *   raise it (the fixed-34 model saturates the minimum) and shortening only
 *   lowers it. It must never widen the ceiling — a VP-controlled length
 *   there would buy burnable headroom.
 * - `implicitFeeSats` is `inputs − outputs` over verified prevouts, `>= 0`.
 *
 * @module primitives/psbt/assertPayoutFeeBand
 */

import { computePayoutFeeFloor } from "@babylonlabs-io/babylon-tbv-rust-wasm";

/**
 * Payout fee-bound vsize model: `maxVsize = BASE + PER_PARTICIPANT * (N + M)`
 * where N = vault keepers, M = universal challengers. Constants and comparison
 * match the Ledger device (`app-babylon-vault` `sign_psbt_validate.c`
 * MAX_PAYOUT_VSIZE_BASE/PER_PARTICIPANT; HLD v22 §4.9.7.1) — a conservative
 * upper estimate with ~13%+ headroom over the exact vsize the VP pays. For
 * payouts whose outs[0] script is <= 34 bytes our accept-set is a subset of
 * the device's: the device bound is FLAT (no script-excess term) and our fee
 * basis (true prevout fee; real graphs build Assert:0 as 546 + council fee)
 * is stricter than its `vault_amount + 546` proxy. A pinned outs[0] script
 * above 34 bytes extends our ceiling past the device's flat bound —
 * contract-legal, but such payouts cannot pass a device today (it also
 * hard-requires 34-byte output scripts).
 */
const MAX_PAYOUT_VSIZE_BASE = 500;
const MAX_PAYOUT_VSIZE_PER_PARTICIPANT = 55;

/**
 * Inclusive range cap `[1, 0xffffffff]` for the tx-graph fee rate (sat/vB):
 * the device's intent parser rejects `base_fee_rate > UINT32_MAX`
 * (`vault_tlv.c` TAG_BASE_FEE_RATE). Mirroring it keeps our bound math in
 * safe integer range and refuses rates no device could ever approve.
 */
const MAX_BASE_FEE_RATE_SAT_PER_VB = 0xffffffffn;

/**
 * Device cap on vault keeper and universal challenger counts (u8 fields,
 * each `[1, 32]` — `app-babylon-vault` `vault_intent.h`). Enforced at the
 * payout boundary so the fee-bound dominance proof's swept domain exactly
 * equals the accepted input domain.
 */
const MAX_PAYOUT_PARTICIPANTS_PER_ROLE = 32;

/**
 * Per-output script length the device's flat payout fee bound implicitly
 * assumes (P2TR, 34 bytes). Measured non-anchor scripts above it extend the
 * ceiling linearly — the estimator's own growth rule — keeping device parity
 * for standard scripts and contract-correctness up to 128-byte ones.
 */
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
 * Validate that the fee-band inputs lie in the proven/accepted domain:
 * `protocolFeeRate` in `[1, 0xffffffff]`, participant counts in `[1, 32]`,
 * `councilSize` a positive integer.
 *
 * @throws If `protocolFeeRate` is not a bigint within the device's range
 * @throws If a participant count is not an integer in the device range `[1, 32]`
 * @throws If `councilSize` is not an integer `>= 1` — the contract write path
 *   (`ProtocolParams.sol`) rejects an empty council, and the WASM floor would
 *   silently treat 0 as a 1-member council rather than erroring
 */
export function assertPayoutFeeBandDomain(params: PayoutFeeBandParams): void {
  // Fail fast on a rate the device's own parser would reject — also keeps the
  // fee-bound product within safe integer range.
  if (
    typeof params.protocolFeeRate !== "bigint" ||
    params.protocolFeeRate <= 0n ||
    params.protocolFeeRate > MAX_BASE_FEE_RATE_SAT_PER_VB
  ) {
    throw new Error(
      `protocolFeeRate must be in [1, ${MAX_BASE_FEE_RATE_SAT_PER_VB}] sat/vB, ` +
        `got ${params.protocolFeeRate}`,
    );
  }
  // Device participant range ([1, 32] per role, vault_intent.h) — also pins
  // the fee band to the domain its dominance proof was swept over
  // (accepted domain == proven domain).
  for (const [role, count] of [
    ["keepers", params.numVaultKeepers],
    ["challengers", params.numUniversalChallengers],
  ] as const) {
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > MAX_PAYOUT_PARTICIPANTS_PER_ROLE
    ) {
      throw new Error(
        `Participant count for ${role} (${count}) is outside the device ` +
          `range [1, ${MAX_PAYOUT_PARTICIPANTS_PER_ROLE}].`,
      );
    }
  }
  // councilSize crosses the WASM boundary with no glue-side validation; a
  // non-integer would silently truncate at the u32 ABI and a 0 would be
  // silently promoted to a 1-member council by the pinned estimator.
  if (!Number.isInteger(params.councilSize) || params.councilSize < 1) {
    throw new Error(
      `councilSize must be an integer >= 1, got ${params.councilSize}`,
    );
  }
}

/**
 * Assert `floor <= implicitFeeSats <= ceiling` for a payout of this shape.
 * `out1Len` is `undefined` for the 2-output (no-commission) layouts.
 *
 * @throws If the fee is below the floor or above the extended device ceiling
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

  // Ceiling first: synchronous arithmetic, no WASM round-trip.
  // Only the PINNED outs[0] script extends the ceiling. out1Len is
  // VP-controlled (commission script deliberately unpinned) — including it
  // would let a padded script widen the burnable band by up to 94 vB x rate.
  // Honest long-commission builds still fit: the flat model's >=175 vB
  // headroom over the exact estimator vsize absorbs the 94 vB with >=81 vB
  // to spare across the entire accepted domain.
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
  // (btc-vault graph.rs derive_challengers: VKs, or VP + N-1 VKs).
  // TODO: memoize if keeper counts grow enough for batch flows to feel it.
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
