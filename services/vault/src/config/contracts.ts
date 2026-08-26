/**
 * Smart Contract Addresses Configuration
 *
 * Uses centralized environment variable validation from config/env.ts
 */

import type { Address } from "viem";

import { ENV } from "./env";

export const CONTRACTS = {
  /**
   * BTCVaultRegistry contract - Manages vault lifecycle (submit, ACK, activate, redeem)
   */
  BTC_VAULT_REGISTRY: ENV.BTC_VAULT_REGISTRY as Address,

  /**
   * AaveIntegrationAdapter contract - Aave-specific application adapter
   * Controls collateral, borrowing, and lending operations for Aave protocol
   */
  AAVE_ADAPTER: ENV.AAVE_ADAPTER as Address,

  /**
   * AaveAdapterConfig contract - holds the per-position size params
   * (maxPositionBTC, maxVaultsPerPosition). Separate deployment from the
   * adapter, which only calls it internally and does not expose the getter.
   */
  AAVE_ADAPTER_CONFIG: ENV.AAVE_ADAPTER_CONFIG as Address,
} as const;
