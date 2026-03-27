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
   * AaveIntegrationController contract - Aave-specific application controller
   * Controls collateral, borrowing, and lending operations for Aave protocol
   */
  AAVE_CONTROLLER: ENV.AAVE_CONTROLLER as Address,
} as const;
