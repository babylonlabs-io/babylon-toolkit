/**
 * Ledger vault-app intent caps, mirrored from the firmware
 * (`app-babylon-vault` @ `8f99b8b`: `vault_tlv.c`, `vault_intent.h`,
 * `vault_constants.h`). The device rejects violations with SW_INCORRECT_DATA
 * and a dead session, so we fail comprehensibly BEFORE the ceremony.
 *
 * These are device-envelope limits only — none exist on-chain or in
 * btc-vault. They live in this signer package; the SDK must never learn them.
 *
 * @module ledger-vault-signer/deviceCaps
 */

/**
 * Vault-core (tx-graph) versions the device can sign: v2 is the firmware's
 * Core-2 tx shape; v3 is byte-identical (btc-vault e1e50f66; SDK parity vector
 * pegin.test.ts). Widen only on evidence a future version is device-compatible.
 */
export const DEVICE_MIN_VAULT_CORE_VERSION = 2;
export const DEVICE_MAX_VAULT_CORE_VERSION = 3;

/**
 * Keeper and universal-challenger counts, each `[1, 32]` (`vault_intent.h:8-9`,
 * checked `vault_tlv.c:130,137`). Far below the protocol: the contract allows
 * 1500 universal challengers and sets no keeper cap at all.
 */
export const DEVICE_MAX_PARTICIPANTS_PER_ROLE = 32;

/**
 * Vault groups per intent (`vault_constants.h` VAULT_MAX_VAULTS). Multi-vault
 * PegIn signing works in one session — `_validate_pegin` auto-detects the
 * group from Input 0's PSBT_IN_OUTPUT_INDEX.
 */
export const DEVICE_MAX_VAULTS_PER_INTENT = 10;

/**
 * Fee-rate bounds (sat/vB): the intent parser rejects rate == 0 AND
 * rate > UINT32_MAX (`vault_tlv.c:73`), so the `>= 1` floor is both a device
 * check and the contract invariant.
 */
export const DEVICE_MAX_BASE_FEE_RATE_SAT_PER_VB = 0xffffffffn;

/** Shared lower bound for the CSV/refund timelocks (`vault_constants.h:100`). */
export const DEVICE_TIMELOCK_MIN_BLOCKS = 72;

/** Inclusive upper bound for `pegin_csv_timelock` (`vault_constants.h:103`). */
export const DEVICE_PEGIN_CSV_TIMELOCK_MAX_BLOCKS = 1008;

/** Inclusive upper bound for `htlc_refund_timelock` (`vault_constants.h:106`). */
export const DEVICE_REFUND_TIMELOCK_MAX_BLOCKS = 4320;

/**
 * Inclusive bounds for `payout_timelock`. The intent parser is EXCLUSIVE
 * `(90, 4032)` (`vault_tlv.c`), so the accepted range is `[91, 4031]`; the
 * exclusive form gates deposits, so it wins over Screen 8's inclusive form.
 */
export const DEVICE_PAYOUT_TIMELOCK_MIN_BLOCKS = 91;
export const DEVICE_PAYOUT_TIMELOCK_MAX_BLOCKS = 4031;

/**
 * Relay dust limit for per-vault commission and reclaim values
 * (`vault_constants.h`). Equal to btc-vault's `DUST_AMOUNT` by value but a
 * distinct role — never merge them.
 */
export const DEVICE_VAULT_DUST_LIMIT_SATS = 546n;

/**
 * Device-only floor on `depositorClaimValue` — btc-vault's own floor is 330,
 * so `[330, 545]` is allowed by the protocol but not the device. Firmware
 * asymmetry; must not be "fixed" on the protocol side.
 */
export const DEVICE_MIN_DEPOSITOR_CLAIM_VALUE_SATS = DEVICE_VAULT_DUST_LIMIT_SATS;

/**
 * The device's `peginAmount > commissionFee + 2 * dust` check. No btc-vault
 * counterpart — firmware-only; mirrored to fail early, never to be ported
 * into the protocol.
 */
export const DEVICE_PEGIN_AMOUNT_DUST_MULTIPLE = 2n;
