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

/**
 * Whether a polling result represents a withdrawal that is still actively
 * progressing — drives the "Pending Withdrawals" header spinner.
 *
 * False once the vault is protocol-terminal (`PAYOUT_BROADCAST` /
 * `PAYOUT_BLOCKED`) **or** polling has given up at `TIMED_OUT_STATE` (≥failure /
 * unknown-poll thresholds). The timed-out case is detected by reference to the
 * `TIMED_OUT_STATE` singleton because its claimer status is `undefined` or an
 * unrecognized string, not a terminal protocol status.
 */
export function isPegoutInProgress(
  claimerStatus: string | undefined,
  displayState: PegoutDisplayState | undefined,
): boolean {
  if (displayState === TIMED_OUT_STATE) return false;
  return (
    claimerStatus !== ClaimerPegoutStatusValue.PAYOUT_BROADCAST &&
    claimerStatus !== ClaimerPegoutStatusValue.PAYOUT_BLOCKED
  );
}

// ---------------------------------------------------------------------------
// Stage progress — drives the progress-bar fill on the pending-withdraw card.
// Every stage is a fixed fraction except the challenge period, which grows from
// its base toward its ceiling as the assert tx accrues confirmations.
// ---------------------------------------------------------------------------

const STAGE_PROGRESS = {
  submitted: 0.12,
  inProgress: 0.25,
  challengeBase: 0.35,
  challengeCeiling: 0.85,
  payoutSent: 0.95,
} as const;

/**
 * Progress-bar fill fraction (0–1) for a withdrawal's current stage.
 *
 * During the challenge period the fraction interpolates between
 * `challengeBase` and `challengeCeiling` by `confirmations / timelockAssert`;
 * when confirmations or the timelock are not yet known it stays at the base so
 * the bar doesn't jump. Blocked is treated as a late stage (keeps the bar near
 * full); the card recolors it via the status variant.
 */
export function getPegoutStageProgress(
  claimerStatus: string | undefined,
  found: boolean,
  confirmations?: number,
  timelockAssertBlocks?: number,
): number {
  if (!found || !claimerStatus) return STAGE_PROGRESS.submitted;

  switch (claimerStatus) {
    case ClaimerPegoutStatusValue.CLAIM_EVENT_RECEIVED:
      return STAGE_PROGRESS.submitted;
    case ClaimerPegoutStatusValue.CLAIM_BROADCAST:
      return STAGE_PROGRESS.inProgress;
    case ClaimerPegoutStatusValue.ASSERT_BROADCAST: {
      if (
        confirmations === undefined ||
        timelockAssertBlocks === undefined ||
        timelockAssertBlocks <= 0
      ) {
        return STAGE_PROGRESS.challengeBase;
      }
      const fraction = Math.max(
        0,
        Math.min(1, confirmations / timelockAssertBlocks),
      );
      return (
        STAGE_PROGRESS.challengeBase +
        fraction *
          (STAGE_PROGRESS.challengeCeiling - STAGE_PROGRESS.challengeBase)
      );
    }
    case ClaimerPegoutStatusValue.PAYOUT_BROADCAST:
    case ClaimerPegoutStatusValue.PAYOUT_BLOCKED:
      return STAGE_PROGRESS.payoutSent;
    default:
      return STAGE_PROGRESS.submitted;
  }
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
