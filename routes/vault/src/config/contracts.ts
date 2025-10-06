/**
 * Smart Contract Addresses Configuration
 * 
 * These addresses are for the local Anvil testnet.
 * TODO: Add environment-based configuration for mainnet/testnet
 */

import type { Address } from 'viem';

export const CONTRACTS = {
  /**
   * BTCVaultsManager contract - Manages vault providers and pegin requests
   */
  BTC_VAULTS_MANAGER: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
  
  /**
   * VaultController contract - Controls vault operations and borrowing
   */
  VAULT_CONTROLLER: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6' as Address,
  
  /**
   * Morpho lending protocol contract
   */
  MORPHO: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
  
  /**
   * BTCVault base contract
   */
  BTC_VAULT: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address,
} as const;

/**
 * Morpho Market ID for USDC lending market
 */
export const MORPHO_MARKET_ID = '74452254177513794647796445278347016294878377877693199253750000625994101441252' as const;
