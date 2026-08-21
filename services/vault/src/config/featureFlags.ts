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
   * Purpose: Shows the position-notifications debug controls as a section
   * inside the god-mode panel, allowing manual parameter overrides and
   * simulation of notification states.
   * Why needed: Dev/QA tool for testing position notification scenarios.
   * Only surfaces when GOD_MODE_PANEL (dev builds only) and
   * ENABLE_LIQUIDATION_NOTIFICATIONS are also enabled.
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
   * ENABLE_LEDGER_VAULT_WALLET feature flag
   *
   * Purpose: Reveals the Ledger vault wallet (`ledger_btc_vault`) in the
   * connect UI. It drives Ledger's dedicated vault app over the DMK — a
   * different device app and a different transport stack from the legacy
   * `ledger_btc` / `ledger_btc_v2` staking adapters.
   * Why needed: the provider is built ahead of Ledger's firmware being final,
   * AND signing is not implemented yet (signPsbt/signPsbts/signMessage throw),
   * so no deposit can complete with this wallet — it must stay invisible
   * everywhere by default while Ledger can switch it on in a test environment
   * without a code change or a release.
   * Default: false (hidden unless explicitly set to "true")
   */
  get isLedgerVaultWalletEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET === "true";
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
   * LIQUIDATION_ANALYSIS_CHART feature flag
   *
   * Purpose: Gates the liquidation-analysis feature — the seizure-map chart
   * inside the overview's Liquidation Analysis card, plus the sidebar's
   * Liquidations section and the /liquidations Liquidation Dashboard. The
   * overview card's empty states read the live position and are not gated by
   * this.
   * Why needed: the /liquidations page charts the live
   * `usePositionNotifications` cascade, but the overview card's cascade is
   * still god-mode-only, and rendering that beside a real position would
   * present fabricated liquidation prices as the user's own.
   * Default: false (no chart unless explicitly set to "true")
   */
  get isLiquidationAnalysisChartEnabled() {
    return process.env.NEXT_PUBLIC_FF_LIQUIDATION_ANALYSIS_CHART === "true";
  },

  /**
   * ENABLE_EXPLORE feature flag
   *
   * Purpose: Gates the Explore section — the /explore route and its sidebar
   * entry. With the flag off the route redirects to the overview and the nav
   * item is hidden, so the section is unreachable by deep link.
   * Why needed: the page lists a hand-authored set of partner apps
   * (config/exploreApps.ts) rather than data from a source we can point at, so
   * until it is backed by the contributor registry it would advertise a curated
   * directory we don't have yet.
   * Default: false (the section is hidden unless explicitly set to "true")
   */
  get isExploreEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_EXPLORE === "true";
  },

  /**
   * ENABLE_ACTIVATION_DELAY feature flag
   *
   * Purpose: Gates the peg-in activation floor — reading
   * `ProtocolParams.peginActivationDelay()` and holding Activate closed until
   * `verifiedAt + delay` blocks have passed, as `activateVaultWithSecret`
   * enforces on-chain.
   * Why needed: the parameter does not exist on every deployment yet (devnet
   * has it, testnet and staging do not). The gate fails CLOSED — an unreadable
   * delay must not let the HTLC secret reach `simulateContract` calldata — so
   * enabling it where the getter is absent would disable Activate for
   * everyone. DevOps flips it per environment once the contract exposes the
   * getter; verify with
   * `cast call <protocolParams> "peginActivationDelay()(uint256)"`.
   * Default: false (no floor gate, and no contract read is issued at all)
   */
  get isActivationDelayEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_ACTIVATION_DELAY === "true";
  },

  /**
   * NOTICE_BANNER_MESSAGE config
   *
   * Purpose: The single operator-controlled message shown to depositors. Its
   * placement is context-aware, so one env var covers every incident case:
   * - frozen/paused active  → replaces the status-card body (frozen/paused).
   * - deposit-disabled active (no pause/freeze) → replaces the deposit-disabled
   *   banner text.
   * - nothing active → renders as a standalone notice at the top of the app
   *   (e.g. intermittent peg-in errors while deposits remain enabled).
   * Why needed: Lets DevOps surface an ad-hoc message via env var without a
   * code change, and avoids the earlier two-flag confusion (a separate
   * status-only override that silently did nothing with DISABLE_DEPOSIT).
   * Default: undefined (default per-context copy is shown; standalone hidden).
   *
   * Non-boolean gating config, so it uses the NEXT_PUBLIC_ prefix without _FF_.
   */
  get noticeBannerMessage(): string | undefined {
    const raw = process.env.NEXT_PUBLIC_NOTICE_BANNER_MESSAGE?.trim();
    return raw ? raw : undefined;
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

  /**
   * DISABLED_BTC_WALLETS config
   *
   * Purpose: The single per-environment lever for which BTC wallets are hidden
   * from the connect UI. Comma-separated wallet ids, matched case-insensitively
   * against each wallet's connector `id` (e.g. "onekey" or "onekey,utila").
   * Valid ids: unisat, onekey, okx, keystone, utila
   * (see packages/babylon-wallet-connector btc wallets).
   * Why needed: Lets DevOps hide a wallet per environment without a code change —
   * both to keep experimental/not-yet-ready wallets (onekey, utila) out of an
   * environment and to pull a wallet fast if its signing behavior regresses.
   * Default: empty (nothing hidden). Experimental wallets must be listed in
   * every environment where they should stay hidden.
   *
   * Non-boolean gating config, so it uses the NEXT_PUBLIC_ prefix without _FF_
   * (per rule 5).
   */
  get disabledBtcWallets() {
    return new Set(
      (process.env.NEXT_PUBLIC_TBV_DISABLED_BTC_WALLETS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  },
};
