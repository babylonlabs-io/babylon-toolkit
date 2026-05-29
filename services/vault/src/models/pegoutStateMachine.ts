/**
 * Pegout status lifecycle and display state mapping.
 *
 * Protocol-level logic (enum, terminal check) lives in @babylonlabs-io/ts-sdk.
 * This file re-exports SDK symbols and keeps vault-only display mapping.
 */

export {
  ClaimerPegoutStatusValue,
  isRecognizedPegoutStatus,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

import {
  ClaimerPegoutStatusValue,
  isPegoutTerminalStatus,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { COPY } from "@/copy";

const STATUS_COPY = COPY.pegout.status;

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
    label: STATUS_COPY.claimEventReceived.label,
    variant: "pending",
    message: STATUS_COPY.claimEventReceived.message,
  },
  [ClaimerPegoutStatusValue.CLAIM_BROADCAST]: {
    label: STATUS_COPY.claimBroadcast.label,
    variant: "pending",
    message: STATUS_COPY.claimBroadcast.message,
  },
  [ClaimerPegoutStatusValue.ASSERT_BROADCAST]: {
    label: STATUS_COPY.assertBroadcast.label,
    variant: "pending",
    message: STATUS_COPY.assertBroadcast.message,
  },
  [ClaimerPegoutStatusValue.PAYOUT_BROADCAST]: {
    label: STATUS_COPY.payoutBroadcast.label,
    variant: "active",
    message: STATUS_COPY.payoutBroadcast.message,
  },
  [ClaimerPegoutStatusValue.PAYOUT_BLOCKED]: {
    label: STATUS_COPY.payoutBlocked.label,
    variant: "warning",
    message: STATUS_COPY.payoutBlocked.message,
  },
};

const INITIATING_STATE: PegoutDisplayState = {
  label: STATUS_COPY.initiating.label,
  variant: "pending",
  message: STATUS_COPY.initiating.message,
};

export const TIMED_OUT_STATE: PegoutDisplayState = {
  label: STATUS_COPY.unavailable.label,
  variant: "warning",
  message: STATUS_COPY.unavailable.message,
};

// Gate explorer links on status: the txids are pre-computed at pegin time, so
// they exist before the txs are actually on-chain.
const CLAIM_ON_CHAIN_STATUSES = new Set<string>([
  ClaimerPegoutStatusValue.CLAIM_BROADCAST,
  ClaimerPegoutStatusValue.ASSERT_BROADCAST,
  ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
  ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
]);
const ASSERT_ON_CHAIN_STATUSES = new Set<string>([
  ClaimerPegoutStatusValue.ASSERT_BROADCAST,
  ClaimerPegoutStatusValue.PAYOUT_BROADCAST,
  ClaimerPegoutStatusValue.PAYOUT_BLOCKED,
]);

/**
 * Whether the claim/assert txids should link to the BTC explorer for a given
 * claimer status. False until the corresponding tx has actually been broadcast.
 */
export function getPegoutTxLinkFlags(claimerStatus: string | undefined): {
  linkClaim: boolean;
  linkAssert: boolean;
} {
  return {
    linkClaim:
      claimerStatus !== undefined && CLAIM_ON_CHAIN_STATUSES.has(claimerStatus),
    linkAssert:
      claimerStatus !== undefined &&
      ASSERT_ON_CHAIN_STATUSES.has(claimerStatus),
  };
}

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
    label: STATUS_COPY.unknownLabel,
    variant: "warning",
    message: STATUS_COPY.unknownMessage(claimerStatus),
  };
}
