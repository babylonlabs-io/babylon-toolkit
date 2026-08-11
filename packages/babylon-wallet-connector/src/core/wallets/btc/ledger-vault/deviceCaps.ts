/**
 * Ledger vault-app intent caps, mirrored from the device firmware.
 *
 * Source of truth: `dbaranov-hoodies/app-babylon-vault` @ develop `8f99b8b`
 * (v0.9.3 — TLV tags, field counts, timelock bounds and roster caps unchanged
 * since v0.9.2; re-verified 2026-08-11) — `src/vault_tlv.c` (TLV parse-time range checks),
 * `src/vault_intent.h` (u8 count fields), `src/vault_constants.h` (dust and
 * timelock bounds). Violations are rejected by the device with
 * SW_INCORRECT_DATA at APPROVE_VAULT_INTENT, nullifying the session — so we
 * mirror them here and fail with a comprehensible error BEFORE the ceremony.
 *
 * None of these exist on-chain or in btc-vault (except the `>= 1` floors).
 * They are device-envelope limits and live in this adapter only: the SDK is
 * vendor-neutral and must never learn them.
 *
 * @module wallets/btc/ledger-vault/deviceCaps
 */

/**
 * Keeper and universal-challenger counts, each `[1, 32]` (`vault_intent.h:8-9`,
 * checked `vault_tlv.c:130,137`). Far below the protocol: the contract allows
 * 1500 universal challengers and sets no keeper cap at all.
 */
export const DEVICE_MAX_PARTICIPANTS_PER_ROLE = 32;

/**
 * Vault groups per intent (`vault_constants.h:92` VAULT_MAX_VAULTS).
 *
 * Multi-vault PegIn signing IS supported as of v0.9.3: `_validate_pegin`
 * auto-detects the group by matching Input 0's PSBT_IN_OUTPUT_INDEX against
 * each group's `htlc_vout` (`sign_psbt_validate.c:1187-1215`), with a
 * per-group replay mask at `:1223-1228`.
 */
export const DEVICE_MAX_VAULTS_PER_INTENT = 10;

/**
 * Upper cap for the tx-graph fee rate (sat/vB): the intent parser rejects
 * `base_fee_rate > UINT32_MAX` (`vault_tlv.c:63`), far above the contract's own
 * cap (`vault-contracts-aave-v4 ProtocolParams.sol:44` MAX_FEE_RATE_SAT_VB =
 * 1000). The `>= 1` floor enforced alongside it is NOT a device check — the
 * firmware parses rate 0 fine; it is the contract/Rust invariant.
 */
export const DEVICE_MAX_BASE_FEE_RATE_SAT_PER_VB = 0xffffffffn;

/** Shared lower bound for the CSV/refund timelocks (`vault_constants.h:100`). */
export const DEVICE_TIMELOCK_MIN_BLOCKS = 72;

/** Inclusive upper bound for `pegin_csv_timelock` (`vault_constants.h:103`). */
export const DEVICE_PEGIN_CSV_TIMELOCK_MAX_BLOCKS = 1008;

/** Inclusive upper bound for `htlc_refund_timelock` (`vault_constants.h:106`). */
export const DEVICE_REFUND_TIMELOCK_MAX_BLOCKS = 4320;

/**
 * Inclusive bounds for `payout_timelock`. The intent parser's check is
 * EXCLUSIVE `(90, 4032)` (`vault_tlv.c:82`), so the accepted inclusive range is
 * `[91, 4031]`. Note Screen 8 uses the INCLUSIVE form of the same two constants
 * (`sign_psbt_validate_helpers.c:180,189`) — the firmware disagrees with itself
 * and it is raised with Ledger. The exclusive form gates deposits, so it wins.
 */
export const DEVICE_PAYOUT_TIMELOCK_MIN_BLOCKS = 91;
export const DEVICE_PAYOUT_TIMELOCK_MAX_BLOCKS = 4031;

/**
 * Relay dust limit the device applies to per-vault commission and depositor
 * reclaim values (`vault_constants.h:67`). Numerically equal to btc-vault's
 * `DUST_AMOUNT` but a distinct role from a distinct source — never merge them.
 */
export const DEVICE_VAULT_DUST_LIMIT_SATS = 546n;

/**
 * Device-only floor on `depositorClaimValue`. btc-vault's own floor is
 * `P2TR_DUST_THRESHOLD` = 330 (`crates/vault/src/lib.rs:163`), so `[330, 545]`
 * is a band the protocol allows and the device does not. Provably empty in
 * practice — `compute_min_claim_value` accumulates upward from 546 — but the
 * asymmetry is firmware-specific and must not be "fixed" on the protocol side.
 */
export const DEVICE_MIN_DEPOSITOR_CLAIM_VALUE_SATS = DEVICE_VAULT_DUST_LIMIT_SATS;

/**
 * The device's `peginAmount > commissionFee + 2 * dust` cross-field check.
 * There is NO btc-vault counterpart: a VP payout has three non-anchor outputs
 * plus the anchor, so the `2 x dust` term is the firmware's own approximation.
 * Mirrored so we fail early, labelled so nobody ports it into the protocol.
 */
export const DEVICE_PEGIN_AMOUNT_DUST_MULTIPLE = 2n;

/**
 * The device hardcodes the tx-graph v2 PegIn shape — mandatory 240-sat P2A
 * anchor and `min_htlc = V + Dcv + 240` (`sign_psbt_validate.c:973-1005`). A v1
 * graph loads its intent fine and then fails at PSBT time, i.e. AFTER the user
 * has physically approved. We refuse v1 before any device I/O.
 */
export const DEVICE_MIN_VAULT_CORE_VERSION = 2;
