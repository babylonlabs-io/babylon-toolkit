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
 */
export async function createProofOfPossession(
  params: ProofOfPossessionParams,
): Promise<string | undefined> {
  if (!params.signMessage) {
    console.warn(
      '[PoP] BTC wallet does not support message signing, skipping PoP',
    );
    console.warn(
      '[PoP] If smart contract requires PoP, the transaction will fail',
    );
    return undefined;
  }

  try {
    // BIP-322 message format: sign ETH address with BTC key
    const message = `Babylon BTC Vault - Ethereum Address: ${params.ethAddress}`;

    // Request signature from BTC wallet
    const signature = await params.signMessage(message);

    return signature;
  } catch (error) {
    console.error('[PoP] Failed to create proof of possession:', error);
    console.warn(
      '[PoP] Continuing without PoP - transaction may fail if contract requires it',
    );
    return undefined;
  }
}
