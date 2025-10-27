/**
 * Smart Contract Addresses Configuration
 *
 * Uses centralized environment variable validation from config/env.ts
 */

import type { Address } from "viem";

import { ENV } from "./env";

export const CONTRACTS = {
  /**
   * BTCVaultsManager contract - Manages vault providers and pegin requests
   */
  BTC_VAULTS_MANAGER: ENV.BTC_VAULTS_MANAGER as Address,

  /**
   * VaultController contract - Controls vault operations and borrowing
   */
  VAULT_CONTROLLER: ENV.VAULT_CONTROLLER as Address,

  /**
   * BTCVault base contract
   */
  BTC_VAULT: ENV.BTC_VAULT as Address,

  /**
   * Morpho Blue contract - Lending protocol for borrowing against BTC vault collateral
   */
  MORPHO: ENV.MORPHO as Address,
} as const;
