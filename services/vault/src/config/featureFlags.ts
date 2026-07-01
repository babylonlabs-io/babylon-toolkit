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
   * PROTOCOL_FROZEN feature flag (governance "Freeze")
   *
   * Purpose: Surfaces the teal "Protocol is frozen" status banner and disables
   * new deposits and borrows. Freeze blocks new entry but preserves all exits
   * (repay, withdraw, liquidation, activation stay available); gating the
   * remaining new-entry action (reorder) is the Freeze follow-up.
   * Why needed: The on-chain Frozen/Paused state is public (each contract
   * exposes it and emits Frozen/Paused events), but we intentionally drive the
   * banner from an operator flag for now — reading it on-chain is the follow-up.
   * DevOps flips this during an incident, like the DISABLE_DEPOSIT/DISABLE_BORROW
   * kill-switches.
   * Default: false (banner hidden unless explicitly set to "true")
   */
  get isProtocolFrozen() {
    return process.env.NEXT_PUBLIC_FF_PROTOCOL_FROZEN === "true";
  },

  /**
   * PROTOCOL_PAUSED feature flag (governance "Pause")
   *
   * Purpose: Surfaces the red "Protocol is paused" status banner; shares the
   * deposit + borrow enforcement with the freeze flag (gating the remaining Aave
   * actions is the Pause follow-up). Takes precedence over the frozen banner
   * when both are set. Pause is the full stop (a last-resort emergency).
   * Why needed: Same operator-controlled model as PROTOCOL_FROZEN; DevOps
   * escalates to this when the whole market is halted.
   * Default: false (banner hidden unless explicitly set to "true")
   */
  get isProtocolPaused() {
    return process.env.NEXT_PUBLIC_FF_PROTOCOL_PAUSED === "true";
  },

  /**
   * PROTOCOL_STATUS_MESSAGE override
   *
   * Purpose: Lets DevOps override the frozen/paused banner's body text per
   * incident without a code change. When set, it replaces the active banner's
   * body; when empty/unset, the default per-status copy from `copy.ts` is shown.
   * Why needed: Incident messaging often needs wording the default copy can't
   * anticipate. Non-boolean config, so it uses a plain NEXT_PUBLIC_ env (per
   * rule 5) rather than the boolean FF prefix.
   * Default: undefined (default copy is used).
   */
  get protocolStatusMessage(): string | undefined {
    const raw = process.env.NEXT_PUBLIC_PROTOCOL_STATUS_MESSAGE?.trim();
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
   * ENABLE_SIGNING_NOTIFICATIONS feature flag
   *
   * Purpose: Controls whether the dApp shows a browser (desktop) notification
   * when a deposit needs the depositor to sign/act - both during an active
   * deposit flow and for pending deposits that reach a signing-required state
   * while the user is on another tab.
   * Why needed: Browser notifications request OS-level permission; gating lets
   * DevOps enable it per environment without a code change.
   * Default: false (no browser notifications unless explicitly set to "true")
   */
  get isSigningNotificationsEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_SIGNING_NOTIFICATIONS === "true";
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

  /**
   * GOD_MODE_PANEL feature flag (dev / QA only)
   *
   * Purpose: Shows a floating, draggable "god mode" admin panel for exercising
   * UI states during development. Its first capability injects a controllable
   * demo deposit into the real Pending/Expired Deposits section so every card
   * state (CTA shown / hidden, badges, steps) can be reviewed without
   * reproducing the on-chain conditions.
   * Why needed: Dev/QA tool; kept fully out of users' view.
   * Hard-gated on `import.meta.env.DEV`, so it can ONLY be enabled in a dev
   * build — a production build forces it false at compile time (and lets the
   * bundler drop the god-mode code; see demoDeposit.ts / DashboardPage.tsx).
   * Default: false (panel hidden and nothing injected unless set to "true").
   */
  get isGodModePanelEnabled() {
    return (
      import.meta.env.DEV &&
      process.env.NEXT_PUBLIC_FF_GOD_MODE_PANEL === "true"
    );
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
