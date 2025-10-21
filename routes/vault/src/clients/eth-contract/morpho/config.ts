/**
 * Morpho SDK Configuration for Custom Networks
 *
 * The Morpho Blue SDK doesn't support Sepolia out of the box.
 * We need to register custom addresses for Sepolia (chainId: 11155111).
 *
 * This configuration should be imported and executed before any Morpho SDK calls.
 */

import { registerCustomAddresses } from '@morpho-org/blue-sdk';
import { getETHChain } from '@babylonlabs-io/config';
import type { Address } from 'viem';

/**
 * Morpho Blue protocol contract addresses on Sepolia
 *
 * Custom Morpho deployment for Babylon vault system on Sepolia.
 * TODO: TO BE UPDATED
 */
const MORPHO_BLUE_ADDRESS_SEPOLIA = '0x1b832639E0b87bEf28755F5086831deE9671313f' as Address;
const ADAPTIVE_CURVE_IRM_SEPOLIA = '0xB419D4009bfA6E41CE40b237f2861e83643D7Bae' as Address;

const MORPHO_SEPOLIA_ADDRESSES = {
  morpho: MORPHO_BLUE_ADDRESS_SEPOLIA,
  adaptiveCurveIrm: ADAPTIVE_CURVE_IRM_SEPOLIA,
  // Optional bundler addresses (not required for basic operations)
  // These are placeholder addresses - update with actual Sepolia addresses if bundler operations are needed
  bundler3: {
    bundler3: '0x0000000000000000000000000000000000000000' as Address,
    generalAdapter1: '0x0000000000000000000000000000000000000000' as Address,
  },
};

/**
 * Networks that are NOT supported by Morpho SDK out of the box
 * These need custom address registration
 */
const UNSUPPORTED_NETWORKS = [
  11155111, // Sepolia
];

/**
 * Check if the current network needs custom Morpho SDK configuration
 */
function needsCustomConfiguration(chainId: number): boolean {
  return UNSUPPORTED_NETWORKS.includes(chainId);
}

/**
 * Initialize Morpho SDK with custom network support
 *
 * This function should be called once at application startup,
 * before any Morpho SDK functions are used.
 *
 * It automatically detects the current network using getETHChain()
 * and only registers custom addresses for unsupported networks.
 */
export function initializeMorphoSDK() {
  try {
    // Get current chain from network configuration
    const chain = getETHChain();
    const chainId = chain.id;

    // Check if this network needs custom configuration
    if (!needsCustomConfiguration(chainId)) {
      console.log(`Morpho SDK: Chain ${chainId} (${chain.name}) is supported natively, skipping custom registration`);
      return;
    }

    // Only Sepolia (11155111) needs custom configuration currently
    if (chainId !== 11155111) {
      console.warn(`Morpho SDK: Chain ${chainId} is marked as unsupported but no configuration available`);
      return;
    }

    // Register Sepolia addresses with known Morpho Blue deployment
    registerCustomAddresses({
      addresses: {
        [chainId]: MORPHO_SEPOLIA_ADDRESSES,
      },
    });
  } catch (error) {
    console.error('Morpho SDK: Failed to initialize custom configuration', error);
    throw new Error(`Failed to initialize Morpho SDK: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get the Morpho contract address for the current network
 */
export function getMorphoAddress(): Address {
  return MORPHO_BLUE_ADDRESS_SEPOLIA;
}
