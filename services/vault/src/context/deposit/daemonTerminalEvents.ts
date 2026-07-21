/**
 * Pure transition detector for `activation.daemon.terminal` — a VP daemon
 * terminal drop (Expired / AmlRejected / IngestionRejected / ...) observed by
 * the pegin polling loop. These states stop polling and previously transmitted
 * nothing, so a rejected deposit was invisible to monitoring.
 *
 * Same emission discipline as `terminalMilestones`:
 *  - A vault is SEEDED on the first poll observation that includes it: if it is
 *    already terminal then (a prior-session drop rediscovered on reload), it is
 *    marked emitted WITHOUT emitting, so a dashboard load never emits a burst.
 *  - Thereafter, each distinct terminal daemonStatus emits once per vault —
 *    keyed per status, so a real Expired → ExpiredCleanedUp progression yields
 *    both signals.
 *
 * Seeding is keyed to the POLLED set, not the errors map: a vault only enters
 * the errors map once it errors, so its first appearance there would always
 * look pre-existing and nothing would ever emit.
 */

import { TerminalPeginPollingError } from "../../utils/peginPolling";

export interface DaemonTerminalTracking {
  /** Vaults observed in at least one poll result (drives seeding). */
  seen: Set<string>;
  /** Emitted `${vaultId}:${daemonStatus}` pairs. */
  emitted: Set<string>;
}

export interface DaemonTerminalEvent {
  /** Raw vaultId; the caller shortens it before it enters event context. */
  vaultId: string;
  /** VP daemon status name (e.g. "Expired", "AmlRejected") — safe to emit. */
  daemonStatus: string;
}

export function createDaemonTerminalTracking(): DaemonTerminalTracking {
  return { seen: new Set(), emitted: new Set() };
}

/**
 * App-scoped tracking shared by every mounted `PeginPollingProvider`, for the
 * same reason `terminalMilestones` shares its store: several providers can
 * observe the same vault at once, and the once-per-transition guarantee must
 * key to the vault, not to a provider instance. In-memory by design — a reload
 * resets it so the seeding rule re-suppresses prior-session terminals.
 */
const sharedTracking = createDaemonTerminalTracking();

export function getSharedDaemonTerminalTracking(): DaemonTerminalTracking {
  return sharedTracking;
}

/**
 * Test-only reset: the shared store outlives any single provider, so cases
 * asserting emissions must start from a clean slate.
 */
export function resetSharedDaemonTerminalTracking(): void {
  sharedTracking.seen.clear();
  sharedTracking.emitted.clear();
}

/**
 * Return the daemon-terminal events to emit for this poll, mutating `tracking`
 * so each (vault, status) pair fires at most once. `polledIds` is the set of
 * deposits the poll observed; `errors` is the per-deposit error map from the
 * same poll (non-terminal entries are ignored).
 */
export function collectDaemonTerminalEvents(
  polledIds: readonly string[],
  errors: ReadonlyMap<string, Error>,
  tracking: DaemonTerminalTracking,
): DaemonTerminalEvent[] {
  const out: DaemonTerminalEvent[] = [];

  for (const vaultId of polledIds) {
    const error = errors.get(vaultId);
    const daemonStatus =
      error instanceof TerminalPeginPollingError ? error.daemonStatus : null;

    if (!tracking.seen.has(vaultId)) {
      tracking.seen.add(vaultId);
      // First observation: seed a pre-existing terminal without emitting.
      if (daemonStatus !== null) {
        tracking.emitted.add(`${vaultId}:${daemonStatus}`);
      }
      continue;
    }

    if (daemonStatus === null) continue;
    const key = `${vaultId}:${daemonStatus}`;
    if (tracking.emitted.has(key)) continue;
    tracking.emitted.add(key);
    out.push({ vaultId, daemonStatus });
  }

  return out;
}
