/**
 * Proof of Possession Service
 *
 * Handles signature creation for proving BTC key ownership.
 * This is required by the smart contract to verify the depositor
 * controls the BTC public key.
 */

import type { Address } from "viem";

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
   * Chain ID for the message
   */
  chainId: number;

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
 * @returns Signature
 * @throws Error if validation fails or wallet doesn't support signing
 */
export async function createProofOfPossession(
  params: ProofOfPossessionParams,
): Promise<string> {
  // Validate inputs
  if (!params.ethAddress) {
    throw new Error("[PoP] Ethereum address is required");
  }
  if (!params.btcAddress) {
    throw new Error("[PoP] BTC address is required");
  }

  // Check if wallet supports message signing
  if (!params.signMessage) {
    throw new Error(
      "BTC wallet does not support message signing. Please use a wallet that supports message signing (e.g., Unisat, OKX, Xverse)",
    );
  }

  // Message format: "0x<lowercase-address>:<chainId>"
  // This matches BTCProofOfPossession.sol buildMessage() format
  const message = `${params.ethAddress.toLowerCase()}:${params.chainId}`;

  // Request signature from BTC wallet
  const signature = await params.signMessage(message);

  // Validate signature is not empty
  if (!signature || signature.length === 0) {
    throw new Error("BTC wallet returned empty signature");
  }

  return signature;
}
