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
   * ENABLE_TIMELOCK_SELECTOR feature flag
   *
   * Purpose: Enables the timelock selector slider in the staking form
   * Why needed: Allows users to select custom timelock values when min !== max staking time.
   *             Useful for devnet testing where faster timelock expiry is needed.
   * ETA for removal: TBD - May become permanent if needed for all environments
   */
  get IsTimelockSelectorEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_TIMELOCK_SELECTOR === "true";
  },
};
