import featureFlags from "@/config/featureFlags";

/**
 * Protocol governance status, using the Aave-aligned naming (Freeze / Pause):
 * - "frozen": blocks new entry (deposits, borrows, …) but preserves exits.
 * - "paused": full stop.
 *
 * See the governance spec for the per-operation matrix:
 * https://babylonlabs.atlassian.net/wiki/spaces/BABYLON/pages/398655537
 */
export type ProtocolStatus = "frozen" | "paused";

/**
 * Resolves the active protocol status from the operator feature flags.
 *
 * Operator-controlled and flag-driven for now: each contract does expose its
 * Frozen/Paused state (and Frozen/Paused events) on-chain, but we intentionally
 * drive the banner from an operator flag rather than reading them — wiring the
 * on-chain detection is the follow-up. Pause wins over freeze when both are set.
 * Shared by the status banner and by RootLayout (which suppresses the
 * deposit-disabled banner while a status banner is showing).
 */
export function resolveProtocolStatus(): ProtocolStatus | null {
  if (featureFlags.isProtocolPaused) {
    return "paused";
  }
  if (featureFlags.isProtocolFrozen) {
    return "frozen";
  }
  return null;
}

/**
 * Whether new deposits are blocked right now — either by the DISABLE_DEPOSIT
 * kill-switch or because the protocol is frozen or paused (both block new
 * entry). Routing the deposit CTAs through this makes the status actually
 * enforce, so the banner reflects reality instead of just describing it.
 */
export function isDepositBlocked(): boolean {
  return featureFlags.isDepositDisabled || resolveProtocolStatus() !== null;
}

/**
 * Whether new borrows are blocked right now — either by the DISABLE_BORROW
 * kill-switch or because the protocol is frozen or paused (both block new
 * borrows).
 */
export function isBorrowBlocked(): boolean {
  return featureFlags.isBorrowDisabled || resolveProtocolStatus() !== null;
}

/**
 * Whether vault reordering is blocked right now. Reorder (`reorderVaults`) is an
 * Aave-scope new-entry action, so Freeze and Pause both block it — gated exactly
 * like deposit/borrow. Unlike those it has no standalone kill-switch; reorder is
 * governance-gated only. Freeze preserves the exits (withdraw, repay,
 * activation, redemption), which is why no helper gates them here.
 */
export function isReorderBlocked(): boolean {
  return resolveProtocolStatus() !== null;
}
