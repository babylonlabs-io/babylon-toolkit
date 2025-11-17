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
   * MorphoIntegrationController contract - Morpho-specific application controller
   * Controls collateral, borrowing, and lending operations for Morpho protocol
   */
  MORPHO_CONTROLLER: ENV.MORPHO_CONTROLLER as Address,

  /**
   * VaultBTC token contract - ERC20 representation of BTC vaults
   */
  BTC_VAULT: ENV.BTC_VAULT as Address,

  /**
   * Morpho Blue contract - Lending protocol for borrowing against BTC vault collateral
   */
  MORPHO: ENV.MORPHO as Address,
} as const;
