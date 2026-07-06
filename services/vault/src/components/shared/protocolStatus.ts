import featureFlags from "@/config/featureFlags";

/**
 * Governance status of a single scope, using the Aave-aligned naming:
 * - "frozen": blocks new ENTRY (deposit/borrow/reorder) but preserves EXITS.
 * - "paused": full stop — also blocks exits (withdraw/repay/activation).
 * - null:    normal operation.
 *
 * The protocol has two independent scopes, each with its own status:
 * - protocol scope: `BTCVaultRegistry` — governs pegin/deposit + activation.
 * - aave scope:     `AaveIntegrationAdapter` — governs borrow/reorder/repay.
 *
 * See the governance spec for the per-operation matrix:
 * https://babylonlabs.atlassian.net/wiki/spaces/BABYLON/pages/398655537
 */
export type ScopeStatus = "frozen" | "paused" | null;

/** Non-null scope status — the two states the status banner renders. */
export type ProtocolStatus = Exclude<ScopeStatus, null>;

/** Per-scope governance status snapshot. */
export interface ProtocolGateState {
  protocol: ScopeStatus;
  aave: ScopeStatus;
}

/** The more severe of two scope statuses (paused > frozen > null). */
export function maxSeverity(a: ScopeStatus, b: ScopeStatus): ScopeStatus {
  if (a === "paused" || b === "paused") return "paused";
  if (a === "frozen" || b === "frozen") return "frozen";
  return null;
}

/**
 * The operator-flag status. Operator flags are a global manual override (a
 * DevOps "big red button") applied to BOTH scopes — the interim control that
 * predates on-chain detection. Pause wins over freeze.
 */
function operatorScopeStatus(): ScopeStatus {
  if (featureFlags.isProtocolPaused) return "paused";
  if (featureFlags.isProtocolFrozen) return "frozen";
  return null;
}

/**
 * Compose the effective per-scope gate state from the on-chain reads and the
 * operator-flag override, taking the more severe of the two per scope.
 *
 * On-chain `null` means either "scope is healthy" or "read unavailable" — both
 * collapse to the operator-flag value here. This gives the safe default for
 * EXITS: a failed RPC read never blocks an exit on its own (it would only be
 * blocked if the operator explicitly set the pause flag). Over-blocking an exit
 * traps users, so exits fail open; entries can still be operator-blocked.
 */
export function composeGateState(
  onChain: ProtocolGateState | null,
): ProtocolGateState {
  const operator = operatorScopeStatus();
  return {
    protocol: maxSeverity(onChain?.protocol ?? null, operator),
    aave: maxSeverity(onChain?.aave ?? null, operator),
  };
}

/** The status the banner summarizes — the most severe across both scopes. */
export function resolveBannerStatus(gate: ProtocolGateState): ScopeStatus {
  return maxSeverity(gate.protocol, gate.aave);
}

// ── Per-action gating predicates ───────────────────────────────────────────
// Pure functions of the gate state (plus the standalone kill-switches). Each
// implements one row of the governance matrix. ENTRY actions block on any
// non-null status for their scope; EXIT actions block only on "paused" (Freeze
// preserves exits). Scope accuracy matters: e.g. repay must stay available
// under a protocol-only pause, so it checks the aave scope only.

/** Deposit (pegin) is a protocol-scope ENTRY action. */
export function isDepositBlocked(gate: ProtocolGateState): boolean {
  return featureFlags.isDepositDisabled || gate.protocol !== null;
}

/** Borrow is an aave-scope ENTRY action. */
export function isBorrowBlocked(gate: ProtocolGateState): boolean {
  return featureFlags.isBorrowDisabled || gate.aave !== null;
}

/** Reorder is an aave-scope ENTRY action. */
export function isReorderBlocked(gate: ProtocolGateState): boolean {
  return gate.aave !== null;
}

/** Withdraw (+redeem) is an EXIT blocked if EITHER scope is paused. */
export function isWithdrawBlocked(gate: ProtocolGateState): boolean {
  return gate.protocol === "paused" || gate.aave === "paused";
}

/** Activation is an EXIT blocked if EITHER scope is paused (preserved under freeze). */
export function isActivationBlocked(gate: ProtocolGateState): boolean {
  return gate.protocol === "paused" || gate.aave === "paused";
}

/** Repay is an aave-scope EXIT blocked ONLY by an aave pause (not protocol). */
export function isRepayBlocked(gate: ProtocolGateState): boolean {
  return gate.aave === "paused";
}
