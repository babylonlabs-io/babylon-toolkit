/**
 * Pegout state definitions and protocol-level terminal checks.
 *
 * Maps VP-reported pegout statuses from `vaultProvider_getPegoutStatus`
 * to protocol lifecycle states.
 *
 * Lifecycle:
 *   ClaimEventReceived -> ClaimBroadcast -> AssertBroadcast -> PayoutBroadcast (success)
 *                                                             > ChallengeAssertObserved -> WronglyChallengedBroadcast -> PayoutBroadcast
 *                                                             > ChallengeAssertObserved -> Failed (challenger won)
 */

/** Claimer-side pegout statuses reported by the VP. */
export enum ClaimerPegoutStatusValue {
  CLAIM_EVENT_RECEIVED = "ClaimEventReceived",
  CLAIM_BROADCAST = "ClaimBroadcast",
  ASSERT_BROADCAST = "AssertBroadcast",
  CHALLENGE_ASSERT_OBSERVED = "ChallengeAssertObserved",
  WRONGLY_CHALLENGED_BROADCAST = "WronglyChallengedBroadcast",
  PAYOUT_BROADCAST = "PayoutBroadcast",
  FAILED = "Failed",
}

const PEGOUT_TERMINAL_STATUSES = new Set<string>([
  ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
  ClaimerPegoutStatusValue.FAILED,
]);

/** Whether a claimer status string maps to a known pegout state. */
export function isRecognizedPegoutStatus(status: string): boolean {
  return Object.values(ClaimerPegoutStatusValue).includes(
    status as ClaimerPegoutStatusValue,
  );
}

/**
 * Whether a claimer status is a hard-terminal pegout status
 * (PayoutBroadcast or Failed). Soft-terminal conditions (polling
 * thresholds) are a consumer-side concern.
 */
export function isPegoutTerminalStatus(
  claimerStatus: string | undefined,
): boolean {
  return !!claimerStatus && PEGOUT_TERMINAL_STATUSES.has(claimerStatus);
}
