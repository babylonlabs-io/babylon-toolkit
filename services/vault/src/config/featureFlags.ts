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
 * 3. Default value for all feature flags is true (feature is enabled)
 * 4. Feature flags are only configurable by DevOps in mainnet environments
 */

export default {
  /**
   * ENABLE_DEPOSIT feature flag
   *
   * Purpose: Controls whether deposit functionality is available
   * Why needed: Allows disabling deposits during maintenance or incidents
   * Default: true (deposits are enabled unless explicitly set to "false")
   */
  get IsDepositEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_DEPOSIT !== "false";
  },

  /**
   * ENABLE_BORROW feature flag
   *
   * Purpose: Controls whether borrowing functionality is available
   * Why needed: Allows disabling borrowing during maintenance or incidents
   * Default: true (borrowing is enabled unless explicitly set to "false")
   */
  get IsBorrowEnabled() {
    return process.env.NEXT_PUBLIC_FF_ENABLE_BORROW !== "false";
  },
};
