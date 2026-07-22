/**
 * Pure transition detector for the on-chain deposit-funnel terminals emitted
 * from the polling context: `activation.verified` (VP verified the presigned
 * payouts) and `deposit.completed` (vault ACTIVE — funnel terminal).
 *
 * Emission must be per-vault and once-per-transition. Two rules make that hold
 * against a poll loop that re-runs every cycle:
 *  - A vault is SEEDED on its first indexer-sourced observation: if it is
 *    already at/past a milestone then (a prior-session completion, or a resumed
 *    deposit), it is marked emitted WITHOUT emitting, so a page load never emits
 *    a burst. localStorage-only rows are skipped outright — their status is
 *    fabricated, not observed.
 *  - Thereafter a milestone emits once, the first cycle a seen vault is observed
 *    to have reached that state, and never again.
 */

import {
  TELEMETRY_EVENT,
  type TelemetryEvent,
} from "../../infrastructure/telemetryEvents";
import { ContractStatus } from "../../models/peginStateMachine";

export interface TerminalMilestoneTracking {
  /** Vaults observed at least once (drives first-observation seeding). */
  seen: Set<string>;
  emittedVerified: Set<string>;
  emittedCompleted: Set<string>;
}

export interface TerminalMilestone {
  event: TelemetryEvent;
  category: "activation" | "deposit";
  /** Raw vaultId; the caller shortens it before it enters event context. */
  vaultId: string;
}

export function createTerminalMilestoneTracking(): TerminalMilestoneTracking {
  return {
    seen: new Set(),
    emittedVerified: new Set(),
    emittedCompleted: new Set(),
  };
}

/**
 * App-scoped tracking shared by every mounted `PeginPollingProvider`.
 *
 * Several providers observe the same vault at once: the dashboard section polls
 * every activity, while the continuation modal mounts its own provider scoped to
 * the viewed batch — nested inside that section, or as a sibling under the root
 * layout. Per-provider tracking emits each terminal once per provider, so the
 * once-per-vault guarantee is keyed to the vault id here rather than to a
 * provider instance, and holds however many providers are mounted.
 *
 * In-memory by design: a reload must reset it, so that the seeding rule above
 * re-suppresses prior-session completions rather than replaying them.
 */
const sharedTracking = createTerminalMilestoneTracking();

export function getSharedTerminalMilestoneTracking(): TerminalMilestoneTracking {
  return sharedTracking;
}

/**
 * Test-only reset: the shared store outlives any single provider, so cases
 * asserting emissions must start from a clean slate.
 */
export function resetSharedTerminalMilestoneTracking(): void {
  sharedTracking.seen.clear();
  sharedTracking.emittedVerified.clear();
  sharedTracking.emittedCompleted.clear();
}

interface StatusBearingActivity {
  id: string;
  contractStatus?: number;
  /** True on localStorage-only rows the indexer has not returned yet. */
  isPending?: boolean;
}

/**
 * Terminal statuses only reachable from ACTIVE: a vault must have activated to
 * be redeemed, liquidated (collateral seized against a debt) or withdrawn. A
 * liquidated vault still converted — it activated first — so it counts. EXPIRED
 * and INVALID are pre-activation aborts and never do. Mirrors the contract
 * statuses of `isVaultPastActivation`, minus its optimistic localStorage branch:
 * an on-chain milestone must be decided from chain truth alone.
 */
function hasReachedActive(status: ContractStatus): boolean {
  return (
    status === ContractStatus.ACTIVE ||
    status === ContractStatus.REDEEMED ||
    status === ContractStatus.LIQUIDATED ||
    status === ContractStatus.DEPOSITOR_WITHDRAWN
  );
}

/**
 * Return the milestones to emit for this poll, mutating `tracking` so each fires
 * at most once per vault. Any status implying the vault reached ACTIVE counts as
 * both "reached verified" and "reached completed", and VERIFIED counts as
 * reached-verified — so a vault that jumps straight past VERIFIED between polls
 * still yields both milestones once.
 */
export function collectTerminalMilestones(
  activities: readonly StatusBearingActivity[],
  tracking: TerminalMilestoneTracking,
): TerminalMilestone[] {
  const out: TerminalMilestone[] = [];

  for (const activity of activities) {
    // Classify a vault only from an indexer-sourced status. A localStorage-only
    // row carries a fabricated PENDING (`isPending: true` — see the merge in
    // usePeginStorage) and exists only until the indexer returns the vault.
    // Seeding from it would mark an already-terminal vault as first seen at
    // PENDING, then emit a spurious milestone one poll later for a transition
    // that happened in a previous session. The `contractStatus` half is
    // defensive: no caller reaches it today, but the field is optional and the
    // cast below would otherwise read `undefined` as PENDING (0).
    if (activity.isPending || activity.contractStatus === undefined) continue;
    const status = activity.contractStatus as ContractStatus;
    const reachedCompleted = hasReachedActive(status);
    const reachedVerified =
      status === ContractStatus.VERIFIED || reachedCompleted;

    if (!tracking.seen.has(activity.id)) {
      tracking.seen.add(activity.id);
      // First observation: seed pre-existing terminal state without emitting.
      if (reachedVerified) tracking.emittedVerified.add(activity.id);
      if (reachedCompleted) tracking.emittedCompleted.add(activity.id);
      continue;
    }

    if (reachedVerified && !tracking.emittedVerified.has(activity.id)) {
      tracking.emittedVerified.add(activity.id);
      out.push({
        event: TELEMETRY_EVENT.ACTIVATION_VERIFIED,
        category: "activation",
        vaultId: activity.id,
      });
    }
    if (reachedCompleted && !tracking.emittedCompleted.has(activity.id)) {
      tracking.emittedCompleted.add(activity.id);
      out.push({
        event: TELEMETRY_EVENT.DEPOSIT_COMPLETED,
        category: "deposit",
        vaultId: activity.id,
      });
    }
  }

  return out;
}
