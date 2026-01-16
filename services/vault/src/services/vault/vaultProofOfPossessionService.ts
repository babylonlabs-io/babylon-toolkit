/**
 * Proof of Possession Service
 *
 * Handles signature creation for proving BTC key ownership.
 * This is required by the smart contract to verify the depositor
 * controls the BTC public key.
 */

import type { Address } from "viem";

/**
 * Action types for PoP signatures
 * Must match BTCProofOfPossession.sol ACTION_* constants
 */
export type PopAction = "register" | "pegin";

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
   * Action context for the signature (e.g., "register", "pegin")
   */
  action: PopAction;

  /**
   * Verifying contract address (BTCVaultsManager)
   * Required to prevent cross-contract replay attacks
   */
  verifyingContract: Address;

  /**
   * BTC wallet signing function
   */
  signMessage?: (message: string) => Promise<string>;
}

/**
 * Create proof of possession signature
 *
 * The depositor signs a message containing their Ethereum address, chain ID,
 * action, and verifying contract with their BTC private key to prove they
 * control the BTC public key.
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
  if (!params.action) {
    throw new Error("[PoP] Action is required");
  }
  if (!params.verifyingContract) {
    throw new Error("[PoP] Verifying contract address is required");
  }

  // Check if wallet supports message signing
  if (!params.signMessage) {
    throw new Error(
      "BTC wallet does not support message signing. Please use a wallet that supports message signing (e.g., Unisat, OKX, Xverse)",
    );
  }

  // Message format: "0x<address>:<chainId>:<action>:0x<verifying_contract>"
  // This matches BTCProofOfPossession.sol buildMessage() format
  // Both addresses must be lowercase with 0x prefix
  const message = `${params.ethAddress.toLowerCase()}:${params.chainId}:${params.action}:${params.verifyingContract.toLowerCase()}`;

  // Request signature from BTC wallet
  const signature = await params.signMessage(message);

  // Validate signature is not empty
  if (!signature || signature.length === 0) {
    throw new Error("BTC wallet returned empty signature");
  }

  return signature;
}
