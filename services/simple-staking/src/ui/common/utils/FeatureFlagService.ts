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
 * 3. Default value for all feature flags is false
 * 4. Feature flags are only configurable by DevOps in mainnet environments
 */

export default {
  /**
   * ENABLE_LEDGER feature flag
   *
   * Purpose: Enables ledger support
   * Why needed: To gradually roll out ledger support
   * ETA for removal: TBD - Will be removed once ledger support is fully released
   */
  get IsLedgerEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER === "true";
  },

  /**
   * PHASE_3 feature flag
   *
   * Purpose: Enables phase 3 functionality
   * Why needed: To gradually roll out phase 3
   * ETA for removal: TBD - Will be removed once phase 3 is fully released
   */
  get IsPhase3Enabled() {
    return process.env.NEXT_PUBLIC_FF_PHASE_3 === "true";
  },

  /**
   * TESTNET_SUNSET feature flag
   *
   * Purpose: Shows a testnet sunsetting notice and disables staking/expansion on testnet
   * Why needed: To guide users to unbond and withdraw ahead of testnet sunset
   * ETA for removal: When testnet is fully sunset
   */
  get IsTestnetSunsetEnabled() {
    return process.env.NEXT_PUBLIC_FF_TESTNET_SUNSET === "true";
  },

  /**
   * Co-staking feature flag
   *
   * Purpose: Enables co-staking functionality for users to stake both BTC and BABY tokens for additional rewards
   * Why needed: To gradually roll out co-staking feature with enhanced rewards system
   * ETA for removal: TBD - Will be removed once co-staking is fully released
   */
  get IsCoStakingEnabled() {
    return process.env.NEXT_PUBLIC_FF_CO_STAKING === "true";
  },

  /**
   * Timelock Renewal feature flag
   *
   * Purpose: Enables timelock renewal functionality in the UI
   * Why needed: To gradually roll out timelock renewal feature
   * ETA for removal: TBD - Will be removed once timelock renewal is fully stable
   */
  get IsTimelockRenewalEnabled() {
    return process.env.NEXT_PUBLIC_FF_TIMELOCK_RENEWAL === "true";
  },

  /**
   * Vault feature flag
   *
   * Purpose: Enables Vault Page with BTC + ETH dual wallet support
   * Why needed: To gradually roll out vault functionality with ETH integration
   * ETA for removal: TBD - Will be removed once vault is fully released
   */
  get IsVaultEnabled() {
    return process.env.NEXT_PUBLIC_FF_VAULT === "true";
  },
};
