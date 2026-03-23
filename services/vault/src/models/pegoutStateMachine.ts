/**
 * Pegout status lifecycle and display state mapping.
 *
 * Maps VP-reported pegout statuses (from `vaultProvider_getPegoutStatus`)
 * to UI display labels, styling variants, and tooltip messages.
 *
 * Lifecycle:
 *   ClaimEventReceived → ClaimBroadcast → AssertBroadcast → PayoutBroadcast (success)
 *                                                          ↘ ChallengeAssertObserved → WronglyChallengedBroadcast → PayoutBroadcast
 *                                                          ↘ ChallengeAssertObserved → Failed (challenger won)
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

export type PegoutDisplayVariant = "pending" | "active" | "warning";

export interface PegoutDisplayState {
  label: string;
  variant: PegoutDisplayVariant;
  message: string;
}

/** Terminal statuses — polling should stop when reached. */
export const PEGOUT_TERMINAL_STATUSES = new Set<string>([
  ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
  ClaimerPegoutStatusValue.FAILED,
]);

const PEGOUT_STATUS_MAP: Record<string, PegoutDisplayState> = {
  [ClaimerPegoutStatusValue.CLAIM_EVENT_RECEIVED]: {
    label: "Processing",
    variant: "pending",
    message:
      "Your withdrawal request has been received and is being processed.",
  },
  [ClaimerPegoutStatusValue.CLAIM_BROADCAST]: {
    label: "Processing",
    variant: "pending",
    message:
      "Your withdrawal is in progress. A transaction has been submitted to Bitcoin.",
  },
  [ClaimerPegoutStatusValue.ASSERT_BROADCAST]: {
    label: "Confirming",
    variant: "pending",
    message:
      "Waiting for Bitcoin network confirmations. This may take a few hours.",
  },
  [ClaimerPegoutStatusValue.CHALLENGE_ASSERT_OBSERVED]: {
    label: "Under Review",
    variant: "warning",
    message:
      "Your withdrawal is being reviewed for security. This may take additional time.",
  },
  [ClaimerPegoutStatusValue.WRONGLY_CHALLENGED_BROADCAST]: {
    label: "Resuming",
    variant: "pending",
    message: "Security review passed. Your withdrawal is being finalized.",
  },
  [ClaimerPegoutStatusValue.PAYOUT_BROADCAST]: {
    label: "BTC Sent",
    variant: "active",
    message: "Your BTC has been sent to your nominated address.",
  },
  [ClaimerPegoutStatusValue.FAILED]: {
    label: "Failed",
    variant: "warning",
    message: "Withdrawal failed. Please contact support.",
  },
};

const INITIATING_STATE: PegoutDisplayState = {
  label: "Initiating",
  variant: "pending",
  message: "Your withdrawal is being prepared by the vault provider.",
};

/**
 * Map VP pegout response to a UI display state.
 *
 * @param claimerStatus - The claimer status string from the VP (undefined if not found)
 * @param found - Whether the VP has a record for this pegout
 */
export function getPegoutDisplayState(
  claimerStatus: string | undefined,
  found: boolean,
): PegoutDisplayState {
  if (!found || !claimerStatus) {
    return INITIATING_STATE;
  }

  const knownState = PEGOUT_STATUS_MAP[claimerStatus];
  if (knownState) {
    return knownState;
  }

  return {
    label: "Unknown",
    variant: "warning",
    message: `Unknown status: ${claimerStatus}. Please contact support.`,
  };
}
