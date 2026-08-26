/**
 * Pegout state definitions and protocol-level terminal checks.
 *
 * Maps VP-reported pegout statuses from `vaultProvider_batchGetPegoutStatus`
 * to protocol lifecycle states.
 *
 * Lifecycle (pegin-level, see btc-vault mod.rs PegoutStatus):
 *   ClaimEventReceived -> ClaimBroadcast -> AssertBroadcast ->
 *     PayoutBroadcast (success) | PayoutBlocked (NoPayout / CouncilNoPayout)
 */

/** Claimer-side pegout statuses reported by the VP. */
export enum ClaimerPegoutStatusValue {
  CLAIM_EVENT_RECEIVED = "ClaimEventReceived",
  CLAIM_BROADCAST = "ClaimBroadcast",
  ASSERT_BROADCAST = "AssertBroadcast",
  PAYOUT_BROADCAST = "PayoutBroadcast",
  PAYOUT_BLOCKED = "PayoutBlocked",
}

const PEGOUT_TERMINAL_STATUSES = new Set<string>([
  ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
  ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
]);

/** Whether a claimer status string maps to a known pegout state. */
export function isRecognizedPegoutStatus(status: string): boolean {
  return Object.values(ClaimerPegoutStatusValue).includes(
    status as ClaimerPegoutStatusValue,
  );
}

/**
 * Whether a claimer status is a hard-terminal pegout status
 * (PayoutBroadcast or PayoutBlocked). Soft-terminal conditions (polling
 * thresholds) are a consumer-side concern.
 */
export function isPegoutTerminalStatus(
  claimerStatus: string | undefined,
): boolean {
  return !!claimerStatus && PEGOUT_TERMINAL_STATUSES.has(claimerStatus);
}
