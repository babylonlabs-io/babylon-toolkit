/**
 * Pegout status lifecycle and display state mapping.
 *
 * Protocol-level logic (enum, terminal check) lives in @babylonlabs-io/ts-sdk.
 * This file re-exports SDK symbols and keeps vault-only display mapping.
 */

export {
  ClaimerPegoutStatusValue,
  isPegoutTerminalStatus,
  isRecognizedPegoutStatus,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

import {
  ClaimerPegoutStatusValue,
  isPegoutTerminalStatus,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

// ---------------------------------------------------------------------------
// Polling thresholds — vault-specific polling policy, not protocol logic.
// ---------------------------------------------------------------------------

export const PEGOUT_MAX_CONSECUTIVE_FAILURES = 10;
export const PEGOUT_MAX_UNKNOWN_STATUS_POLLS = 20;

/**
 * Whether a vault's pegout should be treated as terminal for polling purposes.
 *
 * Combines hard terminal statuses (PayoutBroadcast, Failed) with soft
 * terminal conditions (too many consecutive failures or unknown-status polls).
 */
export function isPegoutEffectivelyTerminal(
  claimerStatus: string | undefined,
  consecutiveFailures: number,
  consecutiveUnknownPolls: number,
): boolean {
  if (isPegoutTerminalStatus(claimerStatus)) return true;
  if (consecutiveFailures >= PEGOUT_MAX_CONSECUTIVE_FAILURES) return true;
  if (consecutiveUnknownPolls >= PEGOUT_MAX_UNKNOWN_STATUS_POLLS) return true;
  return false;
}

// ============================================================================
// Vault-only display mapping (UI-specific, stays here)
// ============================================================================

export type PegoutDisplayVariant = "pending" | "active" | "warning";

export interface PegoutDisplayState {
  label: string;
  variant: PegoutDisplayVariant;
  message: string;
}

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

export const TIMED_OUT_STATE: PegoutDisplayState = {
  label: "Status Unavailable",
  variant: "warning",
  message:
    "Unable to determine withdrawal status. The vault provider may be unreachable. Please try again later or contact support.",
};

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
