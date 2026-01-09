/**
 * Smart Contract Addresses Configuration
 *
 * Uses centralized environment variable validation from config/env.ts
 */

import type { Address } from "viem";

import { ENV } from "./env";

export const CONTRACTS = {
  /**
   * BTCVaultsManager contract - Manages vault lifecycle (submit, ACK, activate, redeem)
   */
  BTC_VAULTS_MANAGER: ENV.BTC_VAULTS_MANAGER as Address,

  /**
   * AaveIntegrationController contract - Aave-specific application controller
   * Controls collateral, borrowing, and lending operations for Aave protocol
   */
  AAVE_CONTROLLER: ENV.AAVE_CONTROLLER as Address,

  /**
   * VaultBTC token contract - ERC20 representation of BTC vaults
   */
  BTC_VAULT: ENV.BTC_VAULT as Address,
} as const;
