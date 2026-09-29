/**
 * Pegout state definitions and protocol-level terminal checks.
 *
 * Maps VP-reported pegout statuses from
 * `vaultProvider_batchGetPegoutStatusByVaultId` to protocol lifecycle states.
 *
 * Lifecycle (pegin-level, see btc-vault mod.rs PegoutStatus):
 *   ClaimEventReceived -> ClaimBroadcast -> AssertBroadcast ->
 *     PayoutConfirmed (success) | PayoutBlocked (NoPayout / CouncilNoPayout)
 */

/** Claimer-side pegout statuses reported by the VP. */
export enum ClaimerPegoutStatusValue {
  CLAIM_EVENT_RECEIVED = "ClaimEventReceived",
  CLAIM_BROADCAST = "ClaimBroadcast",
  ASSERT_BROADCAST = "AssertBroadcast",
  PAYOUT_CONFIRMED = "PayoutConfirmed",
  PAYOUT_BLOCKED = "PayoutBlocked",
}

/**
 * Wire name of `PayoutConfirmed` before btc-vault v0.7.0 (btc-vault #2294).
 * Vault providers that run an older daemon still send it.
 */
const LEGACY_PAYOUT_BROADCAST = "PayoutBroadcast";

const PEGOUT_TERMINAL_STATUSES = new Set<string>([
  ClaimerPegoutStatusValue.PAYOUT_CONFIRMED,
  ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
]);

/**
 * Replace the pre-v0.7.0 name `PayoutBroadcast` with `PayoutConfirmed`.
 * Other statuses pass through unchanged.
 */
export function normalizeClaimerPegoutStatus(status: string): string {
  return status === LEGACY_PAYOUT_BROADCAST
    ? ClaimerPegoutStatusValue.PAYOUT_CONFIRMED
    : status;
}

/** Whether a claimer status string maps to a known pegout state. */
export function isRecognizedPegoutStatus(status: string): boolean {
  return Object.values(ClaimerPegoutStatusValue).includes(
    status as ClaimerPegoutStatusValue,
  );
}

/**
 * Whether a claimer status is a hard-terminal pegout status
 * (PayoutConfirmed or PayoutBlocked). Soft-terminal conditions (polling
 * thresholds) are a consumer-side concern.
 */
export function isPegoutTerminalStatus(
  claimerStatus: string | undefined,
): boolean {
  return !!claimerStatus && PEGOUT_TERMINAL_STATUSES.has(claimerStatus);
}
