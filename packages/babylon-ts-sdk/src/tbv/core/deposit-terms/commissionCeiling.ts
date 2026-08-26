/**
 * The depositor's commission ceiling (`maxAcceptableCommissionBps`) policy:
 * quoted VP commission + drift headroom, capped below the contract's
 * exclusive bound. Shared by the fresh path (`PeginManager`) and the
 * resume-rebuild path so both compute the same ceiling.
 *
 * @module deposit-terms/commissionCeiling
 */

/*
 * Commission-check map (each guards a DIFFERENT boundary — do not consolidate):
 *  1. assertVpCommissionInProtocolRange (vault app, vaultPayoutSignatureService)
 *     — chain-read trust boundary; mirrors VPKeyRegistryLogic.sol bounds.
 *  2. capMaxAcceptableCommissionBps (here) — depositor quote → ceiling policy;
 *     mirrors PeginLogic.sol's strict > check via the +25bps headroom.
 *  3. buildDepositTerms range check — public-API precondition on the projection
 *     that mints the device-enforced commissionFee.
 *  4. payout.ts commission cap — the VP-built tx's output value vs bps at the
 *     signing site (CLAUDE.md Critical Path #3).
 *  5. envelope.ts dust/cross-field gates (ledger-vault-signer) — firmware-only
 *     constants, pre-device-I/O (Critical Path #7).
 */

import { MAX_VP_COMMISSION_BPS_EXCLUSIVE } from "../primitives/psbt/constants";

/**
 * Headroom (in basis points) added to the current VP commission to compute
 * `maxAcceptableCommissionBps` at submit time. Lets the VP raise its
 * commission by up to this amount between read and submit without forcing
 * a re-quote. Capped by {@link MAX_ACCEPTABLE_COMMISSION_BPS_CAP}.
 *
 * Contract check is strict `>` (PeginLogic.sol `VaultProviderCommissionExceeded`
 * revert), so +25 allows up
 * to +25 bps of drift.
 */
export const COMMISSION_BPS_HEADROOM = 25;

/**
 * Hard ceiling for `maxAcceptableCommissionBps`. The contract enforces
 * `commissionBps < 10000`, so any value at/above that is unreachable;
 * `9999` is the maximum useful cap.
 */
export const MAX_ACCEPTABLE_COMMISSION_BPS_CAP = 9999;

/**
 * The commission ceiling submitted as registration calldata and mirrored
 * into `DepositTerms.commissionFee`: quoted + drift headroom, capped.
 * Single source for both consumers — feed it the SAME quoted bps at prepare
 * and register time so device-accept stays coextensive with contract-accept.
 */
export function capMaxAcceptableCommissionBps(bps: number): number {
  // Validate the raw quote before headroom shifts its domain — a negative
  // quote must throw here, not become a small "legal" ceiling.
  // Reject an out-of-range quote outright — clamping it to 9999 would turn a
  // bad read into a 99.99% ceiling, the exact failure the cap exists to stop.
  if (
    !Number.isInteger(bps) ||
    bps < 0 ||
    bps >= MAX_VP_COMMISSION_BPS_EXCLUSIVE
  ) {
    throw new Error(
      `Quoted commissionBps must be an integer in ` +
        `[0, ${MAX_VP_COMMISSION_BPS_EXCLUSIVE}), got ${bps}`,
    );
  }
  return Math.min(
    bps + COMMISSION_BPS_HEADROOM,
    MAX_ACCEPTABLE_COMMISSION_BPS_CAP,
  );
}
