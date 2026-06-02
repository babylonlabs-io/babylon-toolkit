/**
 * Feature flags service module
 *
 * This module provides methods for checking feature flags
 * defined in the environment variables. All feature flag environment
 * variables should be prefixed with NEXT_PUBLIC_FF_
 *
 * Rules:
 * 1. All feature flags must be defined in this file for easy maintenance
 * 2. All feature flags must start with NEXT_PUBLIC_FF_ prefix
 * 3. All flags use opt-in semantics (=== "true") and default to false
 * 4. Feature flags are only configurable by DevOps in mainnet environments
 */

export default {
  /**
   * DISABLE_DEPOSIT feature flag
   *
   * Purpose: Kill-switch to disable deposit functionality during maintenance or incidents
   * Default: false (deposits are enabled unless explicitly set to "true")
   */
  get isDepositDisabled() {
    return process.env.NEXT_PUBLIC_FF_DISABLE_DEPOSIT === "true";
  },

  /**
   * DISABLE_BORROW feature flag
   *
   * Purpose: Kill-switch to disable borrowing functionality during maintenance or incidents
   * Default: false (borrowing is enabled unless explicitly set to "true")
   */
  get isBorrowDisabled() {
    return process.env.NEXT_PUBLIC_FF_DISABLE_BORROW === "true";
  },

  /**
   * SIMPLIFIED_TERMS feature flag
   *
   * Purpose: Controls whether the wallet connection dialog shows simplified terms
   * Why needed: When enabled, only the T&C checkbox is shown instead of all three
   * Default: false (all three checkboxes are shown unless explicitly set to "true")
   */
  get isSimplifiedTermsEnabled() {
    return process.env.NEXT_PUBLIC_FF_SIMPLIFIED_TERMS === "true";
  },

  /**
   * FORCE_PARTIAL_LIQUIDATION feature flag
   *
   * Purpose: Forces partial liquidation split to always be suggested,
   * even when the user has active vaults
   * Why needed: Simplifies dev/QA testing of the split deposit flow
   * Default: false (disabled unless explicitly set to "true")
   */
  get isForcePartialLiquidationSplit() {
    return (
      process.env.NEXT_PUBLIC_FF_FORCE_PARTIAL_LIQUIDATION_SPLIT === "true"
    );
  },

  /**
   * POSITION_DEBUG_PANEL feature flag
   *
   * Purpose: Shows the position notifications debug panel on the dashboard,
   * allowing manual parameter overrides and simulation of notification states.
   * Why needed: Dev/QA tool for testing position notification scenarios
   * Default: false (disabled unless explicitly set to "true")
   */
  get isPositionDebugPanelEnabled() {
    return process.env.NEXT_PUBLIC_FF_POSITION_DEBUG_PANEL === "true";
  },

  /**
   * ENABLE_LIQUIDATION_NOTIFICATIONS feature flag
   *
   * Purpose: Controls whether the dashboard liquidation-notification surface
   * (the PositionNotificationBanner and its debug panel) is shown.
   * Why needed: Lets DevOps enable/disable the notification feature per
   * environment without a code change while the calculator/copy is validated.
   * Default: false (notifications are hidden unless explicitly set to "true")
   */
  get isLiquidationNotificationsEnabled() {
    return (
      process.env.NEXT_PUBLIC_FF_ENABLE_LIQUIDATION_NOTIFICATIONS === "true"
    );
  },

  /**
   * DISABLE_VAULT_CAP feature flag
   *
   * Purpose: Kill-switch to hide the vault supply-cap UI (dashboard section
   * and deposit-form remaining-capacity check). When enabled, the hook
   * short-circuits without any on-chain CapPolicy reads.
   * Why needed: Feature is on by default; this flag lets DevOps quickly
   * disable it per environment without a code change.
   * Default: false (vault cap is enabled unless explicitly set to "true")
   */
  get isVaultCapDisabled() {
    return process.env.NEXT_PUBLIC_FF_DISABLE_VAULT_CAP === "true";
  },

  /**
   * DISABLE_SPLIT_PEGIN feature flag
   *
   * Purpose: Kill-switch to suppress the split-pegin (partial-liquidation
   * split) suggestion entirely. When enabled, the UtxoSplitSelector never
   * renders and every deposit is single-vault — regardless of vault state or
   * NEXT_PUBLIC_FF_FORCE_PARTIAL_LIQUIDATION_SPLIT.
   * Why needed: Feature is on by default; this lets DevOps disable it per
   * environment without a code change.
   * Default: false (split is offered unless explicitly set to "true")
   */
  get isSplitPeginDisabled() {
    return process.env.NEXT_PUBLIC_FF_DISABLE_SPLIT_PEGIN === "true";
  },

  /**
   * ENABLE_GRPC_ARTIFACTS feature flag
   *
   * Purpose: Routes the artifact-stream method
   * (`vaultProvider_requestDepositorClaimerArtifacts`) through a
   * gRPC-subject bearer minted via `auth_createDepositorTokenGrpc`
   * instead of the JSON-RPC bearer.
   * Why needed: Must stay in lockstep with the VP proxy's own
   * `ENABLE_GRPC_ARTIFACTS` flag — when the proxy serves artifacts over
   * gRPC it rejects the JSON-RPC-subject token, and vice versa. Keeping
   * it opt-in lets the frontend default to the JSON-RPC path against a
   * proxy that hasn't enabled gRPC artifacts.
   * Default: false (artifacts authenticate with the JSON-RPC bearer
   * unless explicitly set to "true")
   */
  get isGrpcArtifactsEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_GRPC_ARTIFACTS === "true";
  },
};
