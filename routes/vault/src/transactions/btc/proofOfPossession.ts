/**
 * Proof of Possession Service
 *
 * Handles BIP-322 signature creation for proving BTC key ownership.
 * This is required by the smart contract to verify the depositor
 * controls the BTC public key.
 */

import type { Address } from 'viem';

export interface ProofOfPossessionParams {
  /**
   * Depositor's Ethereum address
   */
  ethAddress: Address;

  /**
   * Depositor's BTC address
   */
  btcAddress: string;

  /**
   * BTC wallet signing function
   */
  signMessage?: (message: string) => Promise<string>;
}

/**
 * Create proof of possession signature
 *
 * The depositor signs their Ethereum address with their BTC private key
 * to prove they control the BTC public key.
 *
 * @param params - PoP parameters
 * @returns BIP-322 signature
 * @throws Error if validation fails or wallet doesn't support signing
 */
export async function createProofOfPossession(
  params: ProofOfPossessionParams,
): Promise<string> {
  // Validate inputs
  if (!params.ethAddress) {
    throw new Error('[PoP] Ethereum address is required');
  }
  if (!params.btcAddress) {
    throw new Error('[PoP] BTC address is required');
  }

  // Check if wallet supports message signing
  if (!params.signMessage) {
    throw new Error(
      'BTC wallet does not support message signing. Please use a wallet that supports BIP-322 message signing (e.g., Unisat, Xverse)',
    );
  }

  try {
    // BIP-322 message format: sign ETH address with BTC key
    // Per spec: "Proof-of-possession signed by the depositor's BTC private key over its ETH address following BIP322"
    const message = params.ethAddress;

    // Request signature from BTC wallet
    const signature = await params.signMessage(message);

    // Validate signature is not empty
    if (!signature || signature.length === 0) {
      throw new Error('BTC wallet returned empty signature');
    }

    return signature;
  } catch (error) {
    // Re-throw all errors - PoP is required
    throw error;
  }
}
