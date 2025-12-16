/**
 * Withdrawal Address Validation
 *
 * This module provides utilities to validate that withdrawal transaction outputs
 * belong to addresses derived from the user's public key. This is a security measure
 * to prevent supply chain attacks where malicious code could swap withdrawal addresses
 * to redirect funds to attacker-controlled wallets.
 *
 * Only P2TR (Taproot) and P2WPKH (Native SegWit) address types are supported,
 * as these are the only address types allowed for staking withdrawals.
 */

import { address as btcAddress, networks, payments } from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";

import { ClientError, ERROR_CODES } from "@/ui/common/errors";

export interface AddressValidationResult {
  isValid: boolean;
  invalidAddresses: string[];
}

/**
 * Derives the allowed withdrawal addresses from a public key.
 *
 * Generates both P2TR (Taproot) and P2WPKH (Native SegWit) addresses from
 * the provided public key. These are the only address types that withdrawals
 * can be sent to.
 *
 * @param publicKeyHex - The compressed public key in hex format (33 bytes / 66 chars)
 * @param network - The Bitcoin network (mainnet, testnet, etc.)
 * @returns Array of valid withdrawal addresses derived from the public key
 */
export function deriveAllowedWithdrawalAddresses(
  publicKeyHex: string,
  network: networks.Network,
): string[] {
  const addresses: string[] = [];
  const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");

  // Derive P2TR (Taproot) address using the x-only public key
  const p2trResult = payments.p2tr({
    internalPubkey: toXOnly(publicKeyBuffer),
    network,
  });
  if (p2trResult.address) {
    addresses.push(p2trResult.address);
  }

  // Derive P2WPKH (Native SegWit) address - requires full compressed public key (33 bytes)
  if (publicKeyBuffer.length === 33) {
    const p2wpkhResult = payments.p2wpkh({
      pubkey: publicKeyBuffer,
      network,
    });
    if (p2wpkhResult.address) {
      addresses.push(p2wpkhResult.address);
    }
  }

  return addresses;
}

/**
 * Validates that all transaction outputs go to addresses derived from the user's public key.
 *
 * Extracts addresses from the output scripts and checks each one against the
 * list of allowed addresses derived from the public key. Outputs that cannot
 * be decoded to addresses (e.g., OP_RETURN) are skipped.
 *
 * @param outputScripts - Array of output script buffers from the transaction
 * @param publicKeyHex - The user's compressed public key in hex format
 * @param network - The Bitcoin network
 * @returns Validation result with isValid flag and list of any invalid addresses
 */
export function validateWithdrawalOutputs(
  outputScripts: Buffer[],
  publicKeyHex: string,
  network: networks.Network,
): AddressValidationResult {
  const allowedAddresses = deriveAllowedWithdrawalAddresses(
    publicKeyHex,
    network,
  );

  const invalidAddresses: string[] = [];

  for (const script of outputScripts) {
    let outputAddress: string;
    try {
      outputAddress = btcAddress.fromOutputScript(script, network);
    } catch {
      // Skip outputs that don't decode to addresses (e.g., OP_RETURN)
      continue;
    }

    if (!allowedAddresses.includes(outputAddress)) {
      invalidAddresses.push(outputAddress);
    }
  }

  return {
    isValid: invalidAddresses.length === 0,
    invalidAddresses,
  };
}

/**
 * Asserts that all withdrawal transaction outputs belong to the user's public key.
 *
 * This is the main validation function that should be called before broadcasting
 * any withdrawal transaction. It throws an error if any output address doesn't
 * match an address derived from the user's public key.
 *
 * @param outputScripts - Array of output script buffers from the withdrawal transaction
 * @param publicKeyHex - The user's compressed public key in hex format
 * @param network - The Bitcoin network
 * @throws ClientError if any output address doesn't belong to the user's public key
 */
export function assertWithdrawalAddressesValid(
  outputScripts: Buffer[],
  publicKeyHex: string,
  network: networks.Network,
): void {
  const result = validateWithdrawalOutputs(
    outputScripts,
    publicKeyHex,
    network,
  );

  if (!result.isValid) {
    throw new ClientError(
      ERROR_CODES.VALIDATION_ERROR,
      `Withdrawal address validation failed: output addresses [${result.invalidAddresses.join(", ")}] do not belong to the connected wallet's public key`,
    );
  }
}
