import featureFlags from "@/config/featureFlags";

export type ProtocolPauseLevel = "soft" | "hard";

/**
 * Resolves the active protocol-pause level from the operator feature flags.
 *
 * Operator-controlled and flag-driven: there is no protocol-wide pause signal
 * on-chain or in the indexer, so this reflects the feature flags only. Hard
 * wins over soft when both are set. Shared by the pause banner and by
 * RootLayout (which suppresses the deposit-disabled banner while a pause banner
 * is showing).
 */
export function resolveProtocolPauseLevel(): ProtocolPauseLevel | null {
  if (featureFlags.isProtocolFullyPaused) {
    return "hard";
  }
  if (featureFlags.isProtocolSoftPaused) {
    return "soft";
  }
  return null;
}

/**
 * Whether new deposits are blocked right now — either by the DISABLE_DEPOSIT
 * kill-switch or because the protocol is paused (soft or hard both block new
 * deposits). Routing the deposit CTAs through this makes the pause state
 * actually enforce, so the pause banner reflects reality instead of just
 * describing it.
 */
export function isDepositBlocked(): boolean {
  return featureFlags.isDepositDisabled || resolveProtocolPauseLevel() !== null;
}

/**
 * Whether new borrows are blocked right now — either by the DISABLE_BORROW
 * kill-switch or because the protocol is paused (soft or hard both block new
 * borrows).
 */
export function isBorrowBlocked(): boolean {
  return featureFlags.isBorrowDisabled || resolveProtocolPauseLevel() !== null;
}
