/**
 * Whether a recorded timestamp is still inside its suppression window. A
 * missing timestamp is never inside one, so legacy entries always re-offer.
 */
export function isWithinTtl(
  at: number | undefined,
  now: number | undefined,
  ttlMs: number,
): boolean {
  if (at === undefined) return false;
  const elapsedMs = (now ?? Date.now()) - at;
  // A timestamp ahead of the clock means the wall clock jumped backwards after
  // it was recorded (NTP step, manual change). Elapsed then reads negative —
  // inside the window under a bare `< TTL` for as long as the clock stays
  // behind — so the suppression would outlast the TTL by the size of the jump.
  // Expired is the safe reading: a stale window hides an action the user still
  // owes, while an early re-offer costs at most a redundant no-op.
  return elapsedMs >= 0 && elapsedMs < ttlMs;
}
