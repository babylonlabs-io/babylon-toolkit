/**
 * Pure transition detector for the redemption (pegout) terminals observed by
 * `usePegoutPolling`: `exit.redeem.payout_broadcast` (BTC returned to the
 * depositor — the redemption success terminal), `exit.redeem.payout_blocked`
 * (claim/assert on-chain but the payout is blocked), and
 * `exit.redeem.pegout_timeout` (polling gave up). All three previously
 * surfaced only as breadcrumbs, which transmit nothing on their own — a stuck
 * or blocked redemption was invisible to monitoring.
 *
 * Same emission discipline as `terminalMilestones`:
 *  - A vault is SEEDED on its first appearance in the results map: if it is
 *    already terminal then (a prior-session terminal re-observed on reload), it
 *    is marked emitted WITHOUT emitting.
 *  - Thereafter each terminal kind emits once per vault. Kinds are keyed
 *    independently, so a vault that times out and later (after a manual
 *    refetch) reaches payout_broadcast still emits the success terminal.
 *    Timeouts are additionally keyed per give-up reason — mirroring the
 *    per-status keying in `daemonTerminalEvents` — so a vault that times out,
 *    recovers, and later times out down a different give-up path emits the
 *    new reason instead of being swallowed by the first.
 *  - A failure-shaped result (no response, no give-up reason — the shape
 *    `applyPegoutFailure` and the provider-not-found path record before the
 *    give-up threshold) is a FAILED observation: the poll learned nothing
 *    about the vault, so it neither seeds nor emits. Otherwise a provider
 *    blip on the first poll after reload would mis-seed the vault as
 *    non-terminal and its prior-session terminal would emit as fresh.
 */

import {
  TELEMETRY_EVENT,
  type TelemetryEvent,
} from "../infrastructure/telemetryEvents";
import { ClaimerPegoutStatusValue } from "../models/pegoutStateMachine";

import type { PegoutPollingResult } from "./usePegoutPolling";

export interface PegoutTerminalTracking {
  /** Vaults observed in at least one results map (drives seeding). */
  seen: Set<string>;
  /** Emitted `${vaultId}:${kind}` pairs. */
  emitted: Set<string>;
}

export interface PegoutTerminalEvent {
  event: TelemetryEvent;
  level: "info" | "warning";
  /** Raw vaultId; the caller shortens it before it enters event context. */
  vaultId: string;
  /** Only set for pegout_timeout — which give-up path fired. */
  timeoutReason?: PegoutPollingResult["timeoutReason"];
}

export function createPegoutTerminalTracking(): PegoutTerminalTracking {
  return { seen: new Set(), emitted: new Set() };
}

/**
 * Module-scoped tracking. `usePegoutPolling` mounts once (DashboardPage), but
 * the once-per-transition guarantee is keyed to the vault id rather than a hook
 * instance so a remount (route change, StrictMode) cannot re-emit. In-memory by
 * design — a reload resets it so seeding re-suppresses prior-session terminals.
 */
const sharedTracking = createPegoutTerminalTracking();

export function getSharedPegoutTerminalTracking(): PegoutTerminalTracking {
  return sharedTracking;
}

/**
 * Test-only reset: the shared store outlives the hook, so cases asserting
 * emissions must start from a clean slate.
 */
export function resetSharedPegoutTerminalTracking(): void {
  sharedTracking.seen.clear();
  sharedTracking.emitted.clear();
}

interface ClassifiedTerminal {
  kind: string;
  event: TelemetryEvent;
  level: "info" | "warning";
  timeoutReason?: PegoutPollingResult["timeoutReason"];
}

function classifyTerminal(
  result: PegoutPollingResult,
): ClassifiedTerminal | null {
  if (result.timeoutReason !== undefined) {
    return {
      // Reason-suffixed so each distinct give-up path dedups independently.
      kind: `timeout:${result.timeoutReason}`,
      event: TELEMETRY_EVENT.EXIT_REDEEM_PEGOUT_TIMEOUT,
      level: "warning",
      timeoutReason: result.timeoutReason,
    };
  }
  const claimerStatus = result.response?.claimer?.status;
  if (claimerStatus === ClaimerPegoutStatusValue.PAYOUT_BROADCAST) {
    return {
      kind: "payout_broadcast",
      event: TELEMETRY_EVENT.EXIT_REDEEM_PAYOUT_BROADCAST,
      level: "info",
    };
  }
  if (claimerStatus === ClaimerPegoutStatusValue.PAYOUT_BLOCKED) {
    return {
      kind: "payout_blocked",
      event: TELEMETRY_EVENT.EXIT_REDEEM_PAYOUT_BLOCKED,
      level: "warning",
    };
  }
  return null;
}

/**
 * Return the pegout-terminal events to emit for this poll, mutating `tracking`
 * so each (vault, kind) pair fires at most once.
 */
export function collectPegoutTerminalEvents(
  results: ReadonlyMap<string, PegoutPollingResult>,
  tracking: PegoutTerminalTracking,
): PegoutTerminalEvent[] {
  const out: PegoutTerminalEvent[] = [];

  for (const [vaultId, result] of results) {
    // Failure shape = failed observation: the poll learned nothing about this
    // vault, so skip it entirely — in particular it must not seed. Every
    // genuinely observed status carries `response`; every give-up carries
    // `timeoutReason`.
    if (result.response === undefined && result.timeoutReason === undefined) {
      continue;
    }

    const terminal = classifyTerminal(result);

    if (!tracking.seen.has(vaultId)) {
      tracking.seen.add(vaultId);
      // First observation: seed a pre-existing terminal without emitting.
      if (terminal) tracking.emitted.add(`${vaultId}:${terminal.kind}`);
      continue;
    }

    if (!terminal) continue;
    const key = `${vaultId}:${terminal.kind}`;
    if (tracking.emitted.has(key)) continue;
    tracking.emitted.add(key);
    out.push({
      event: terminal.event,
      level: terminal.level,
      vaultId,
      ...(terminal.timeoutReason !== undefined
        ? { timeoutReason: terminal.timeoutReason }
        : {}),
    });
  }

  return out;
}
