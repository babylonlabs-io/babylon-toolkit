/**
 * Device-envelope validation for the Ledger vault app.
 *
 * The device rejects an out-of-range intent at APPROVE_VAULT_INTENT with an
 * opaque status word and nullifies the session. This runs the same checks
 * BEFORE any device I/O, so the depositor gets an actionable error instead of
 * a dead ceremony.
 *
 * This is the provider obligation the SDK's `DepositTermsApprover` documents.
 * It lives here and nowhere else — the SDK is vendor-neutral.
 *
 * @module wallets/btc/ledger-vault/envelope
 */

import {
  DEVICE_MAX_BASE_FEE_RATE_SAT_PER_VB,
  DEVICE_MAX_PARTICIPANTS_PER_ROLE,
  DEVICE_MAX_VAULTS_PER_INTENT,
  DEVICE_MIN_DEPOSITOR_CLAIM_VALUE_SATS,
  DEVICE_MIN_VAULT_CORE_VERSION,
  DEVICE_PAYOUT_TIMELOCK_MAX_BLOCKS,
  DEVICE_PAYOUT_TIMELOCK_MIN_BLOCKS,
  DEVICE_PEGIN_AMOUNT_DUST_MULTIPLE,
  DEVICE_PEGIN_CSV_TIMELOCK_MAX_BLOCKS,
  DEVICE_REFUND_TIMELOCK_MAX_BLOCKS,
  DEVICE_TIMELOCK_MIN_BLOCKS,
  DEVICE_VAULT_DUST_LIMIT_SATS,
} from "./deviceCaps";
import { DepositTermsRejectedError, type DepositTerms } from "./types";

const RANGE_MSG = "Deposit terms outside the device-supported range";

function requireIntInRange(field: string, value: number, lo: number, hi: number): void {
  if (!Number.isInteger(value) || value < lo || value > hi) {
    throw new DepositTermsRejectedError(`${RANGE_MSG}: ${field} ${value} not in [${lo}, ${hi}]`);
  }
}

/**
 * Assert the terms lie inside the device's accepted intent domain.
 *
 * @throws {DepositTermsRejectedError} on the first violation
 */
export function assertDepositTermsDeviceCompatible(terms: DepositTerms): void {
  // The firmware hardcodes the v2 PegIn shape, but a v1 intent LOADS fine and
  // only fails at PSBT time — i.e. after the user has physically approved.
  if (terms.vaultCoreVersion < DEVICE_MIN_VAULT_CORE_VERSION) {
    throw new DepositTermsRejectedError(
      `${RANGE_MSG}: vaultCoreVersion ${terms.vaultCoreVersion} is below ` +
        `${DEVICE_MIN_VAULT_CORE_VERSION}; this device cannot complete a ` +
        `tx-graph v1 deposit.`,
    );
  }

  // The >= 1 floor is the contract/Rust invariant, not a device check.
  if (terms.protocolFeeRate < 1n || terms.protocolFeeRate > DEVICE_MAX_BASE_FEE_RATE_SAT_PER_VB) {
    throw new DepositTermsRejectedError(
      `${RANGE_MSG}: protocolFeeRate ${terms.protocolFeeRate} not in ` + `[1, ${DEVICE_MAX_BASE_FEE_RATE_SAT_PER_VB}]`,
    );
  }

  // timelockPegin and timelockAssert are the same on-chain value, checked
  // against two device ranges — so the admissible band is their intersection.
  requireIntInRange(
    "timelockPegin",
    terms.timelockPegin,
    DEVICE_TIMELOCK_MIN_BLOCKS,
    DEVICE_PEGIN_CSV_TIMELOCK_MAX_BLOCKS,
  );
  requireIntInRange(
    "timelockAssert",
    terms.timelockAssert,
    DEVICE_PAYOUT_TIMELOCK_MIN_BLOCKS,
    DEVICE_PAYOUT_TIMELOCK_MAX_BLOCKS,
  );
  requireIntInRange(
    "timelockRefund",
    terms.timelockRefund,
    DEVICE_TIMELOCK_MIN_BLOCKS,
    DEVICE_REFUND_TIMELOCK_MAX_BLOCKS,
  );

  requireIntInRange("keeper count", terms.vaultKeeperBtcPubkeys.length, 1, DEVICE_MAX_PARTICIPANTS_PER_ROLE);
  requireIntInRange(
    "challenger count",
    terms.universalChallengerBtcPubkeys.length,
    1,
    DEVICE_MAX_PARTICIPANTS_PER_ROLE,
  );
  requireIntInRange("vault count", terms.vaults.length, 1, DEVICE_MAX_VAULTS_PER_INTENT);

  // The intent parser rejects prepegin_max_fee == 0 (vault_tlv.c:152).
  if (terms.prepeginMaxFee < 1n) {
    throw new DepositTermsRejectedError(`${RANGE_MSG}: prepeginMaxFee ${terms.prepeginMaxFee} must be >= 1`);
  }

  // The device requires strictly ascending htlc_vout across groups and kills the
  // session mid-ceremony otherwise (approve_vault_intent.c). htlcVout is a u8 on
  // the wire, so an out-of-range value must fail here with the seam's error
  // shape rather than as a raw encoder Error.
  let previousVout = -1;
  for (const vault of terms.vaults) {
    if (!Number.isInteger(vault.htlcVout) || vault.htlcVout < 0 || vault.htlcVout > 0xff) {
      throw new DepositTermsRejectedError(`${RANGE_MSG}: htlcVout ${vault.htlcVout} not in [0, 255]`);
    }
    if (vault.htlcVout <= previousVout) {
      throw new DepositTermsRejectedError(
        `${RANGE_MSG}: vault groups must be in strictly ascending htlcVout order; ` +
          `got ${vault.htlcVout} after ${previousVout}`,
      );
    }
    previousVout = vault.htlcVout;
  }

  // Global uniqueness across BOTH rosters, plus no key equal to the vault
  // provider's. The settlement contract is the authority here — the firmware
  // enforces the same thing (VAULT_KEY_ERR_DUPLICATE / _ROLE_COLLISION in
  // approve_vault_intent_core.h), so this is protocol, not a device quirk, and
  // we are not stricter than what a legal vault can register. Note ordering is
  // per-role while uniqueness is global.
  const canonicalKey = (key: string) => key.replace(/^0x/, "").toLowerCase();
  const vpKeys = new Set(terms.vaults.map((v) => canonicalKey(v.vaultProviderBtcPubkey)));
  const seenKeys = new Set<string>();
  for (const [role, keys] of [
    ["vaultKeeperBtcPubkeys", terms.vaultKeeperBtcPubkeys],
    ["universalChallengerBtcPubkeys", terms.universalChallengerBtcPubkeys],
  ] as const) {
    for (const key of keys) {
      const canonical = canonicalKey(key);
      if (vpKeys.has(canonical)) {
        throw new DepositTermsRejectedError(
          `${RANGE_MSG}: ${role} contains the vault provider's own key ` + `(${canonical.slice(0, 16)}…)`,
        );
      }
      if (seenKeys.has(canonical)) {
        throw new DepositTermsRejectedError(
          `${RANGE_MSG}: duplicate participant key in ${role} (${canonical.slice(0, 16)}…)`,
        );
      }
      seenKeys.add(canonical);
    }
  }

  const dust = DEVICE_VAULT_DUST_LIMIT_SATS;
  const crossFieldFloor = DEVICE_PEGIN_AMOUNT_DUST_MULTIPLE * dust;

  for (const vault of terms.vaults) {
    if (vault.commissionFee < dust) {
      throw new DepositTermsRejectedError(
        `${RANGE_MSG}: vault ${vault.htlcVout} commissionFee ` +
          `${vault.commissionFee} below the ${dust}-sat dust limit`,
      );
    }
    if (vault.depositorClaimValue < DEVICE_MIN_DEPOSITOR_CLAIM_VALUE_SATS) {
      throw new DepositTermsRejectedError(
        `${RANGE_MSG}: vault ${vault.htlcVout} depositorClaimValue ` +
          `${vault.depositorClaimValue} below the ` +
          `${DEVICE_MIN_DEPOSITOR_CLAIM_VALUE_SATS}-sat device floor`,
      );
    }
    if (vault.peginAmount <= vault.commissionFee + crossFieldFloor) {
      throw new DepositTermsRejectedError(
        `${RANGE_MSG}: vault ${vault.htlcVout} peginAmount ` +
          `${vault.peginAmount} must exceed commissionFee + ${crossFieldFloor} ` +
          `(${vault.commissionFee + crossFieldFloor})`,
      );
    }
  }
}
