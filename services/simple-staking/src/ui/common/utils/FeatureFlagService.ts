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
   * USE_V2_LEDGER_APP feature flag
   *
   * Purpose: Switches from v1 to v2 Ledger BTC provider
   * Why needed: To gradually roll out v2 Ledger app support on devnet/testnet
   *             before enabling on mainnet
   * Default: false (uses v1 Ledger provider for backwards compatibility)
   * ETA for removal: TBD - Will be removed once v2 is fully tested and stable
   */
  get IsV2LedgerEnabled() {
    return process.env.NEXT_PUBLIC_FF_USE_V2_LEDGER_APP === "true";
  },
};
