/**
 * Feature flags service module
 *
 * This module provides methods for checking feature flags
 * defined in the environment variables. All feature flag environment
 * variables should be prefixed with NEXT_PUBLIC_FF_
 *
 * Rules:
 * 1. All feature flags must be defined in this file for easy maintenance
 * 2. Boolean flags must start with NEXT_PUBLIC_FF_ prefix
 * 3. Boolean flags use opt-in semantics (=== "true") and default to false
 * 4. Feature flags are only configurable by DevOps in mainnet environments
 * 5. Non-boolean gating config (e.g. wallet opt-in lists) may use other prefixes
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
   * PROTOCOL_SOFT_PAUSED feature flag
   *
   * Purpose: Surfaces the teal "Protocol is soft-paused" status banner and
   * disables new deposits and borrows (repay stays allowed, liquidations
   * active). Withdrawal blocking is not enforced yet.
   * Why needed: We intentionally drive the banner from an operator flag rather
   * than reading the on-chain pause state (TBVPausableUpg.pauseState is public);
   * DevOps flips this during an incident, the same way they flip the
   * DISABLE_DEPOSIT/DISABLE_BORROW kill-switches.
   * Default: false (banner hidden unless explicitly set to "true")
   */
  get isProtocolSoftPaused() {
    return process.env.NEXT_PUBLIC_FF_PROTOCOL_SOFT_PAUSED === "true";
  },

  /**
   * PROTOCOL_FULLY_PAUSED feature flag
   *
   * Purpose: Surfaces the red "Protocol is fully paused" status banner; shares
   * the deposit + borrow enforcement with the soft flag (gating the remaining
   * Aave actions is the Pause follow-up). Takes precedence over the soft-paused
   * banner when both are set.
   * Why needed: Same operator-controlled model as PROTOCOL_SOFT_PAUSED; DevOps
   * escalates to this when the whole market is halted. We intentionally drive
   * the banner from the operator flag rather than reading the on-chain
   * TBVPausableUpg.pauseState.
   * Default: false (banner hidden unless explicitly set to "true")
   */
  get isProtocolFullyPaused() {
    return process.env.NEXT_PUBLIC_FF_PROTOCOL_FULLY_PAUSED === "true";
  },

  /**
   * PAUSE_BANNER_MESSAGE override
   *
   * Purpose: Lets DevOps override the pause banner's body text per incident
   * without a code change. When set, it replaces the active banner's body; when
   * empty/unset, the default per-level copy from `copy.ts` is shown.
   * Why needed: Incident messaging often needs wording the default copy can't
   * anticipate. Non-boolean config, so it uses a plain NEXT_PUBLIC_ env (per
   * rule 5) rather than the boolean FF prefix.
   * Default: undefined (default copy is used).
   */
  get pauseBannerMessage(): string | undefined {
    const raw = process.env.NEXT_PUBLIC_PAUSE_BANNER_MESSAGE?.trim();
    return raw ? raw : undefined;
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

  /**
   * NOTICE_BANNER_MESSAGE config
   *
   * Purpose: Operator-controlled freeform banner shown at the top of the app
   * for situations like intermittent peg-in errors or service degradation.
   * Why needed: Lets DevOps surface an ad-hoc notice via env var without a
   * code change. Intentionally decoupled from DISABLE_DEPOSIT so a notice can
   * be shown while deposits remain enabled.
   * Default: empty (banner hidden unless a non-empty message is set).
   *
   * Non-boolean gating config, so it uses the NEXT_PUBLIC_ prefix without _FF_.
   */
  get noticeBannerMessage() {
    return (process.env.NEXT_PUBLIC_NOTICE_BANNER_MESSAGE ?? "").trim();
  },

  get extraBtcWallets() {
    return new Set(
      (process.env.NEXT_PUBLIC_TBV_EXTRA_BTC_WALLETS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  },
};
