/**
 * Morpho Market Utilities
 *
 * Helper functions for working with Morpho markets
 */

import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toHex,
  type Address,
  type Hex,
} from "viem";

import type { MarketParams } from "../morpho-controller/transaction";

/**
 * Calculate Morpho market ID from market parameters
 *
 * Market ID = keccak256(abi.encode(loanToken, collateralToken, oracle, irm, lltv))
 *
 * @param params - Market parameters (loanToken, collateralToken, oracle, irm, lltv)
 * @returns Market ID as hex string (32 bytes)
 */
export function calculateMarketId(params: MarketParams): Hex {
  const encoded = encodeAbiParameters(
    parseAbiParameters("address, address, address, address, uint256"),
    [
      params.loanToken,
      params.collateralToken,
      params.oracle,
      params.irm,
      BigInt(params.lltv),
    ],
  );

  return keccak256(encoded);
}

/**
 * Calculate Morpho market ID from individual parameters
 *
 * @param loanToken - Loan token address
 * @param collateralToken - Collateral token address
 * @param oracle - Oracle address
 * @param irm - IRM (Interest Rate Model) address
 * @param lltv - LLTV (Liquidation Loan-to-Value) ratio
 * @returns Market ID as hex string (32 bytes)
 */
export function calculateMarketIdFromParams(
  loanToken: Address,
  collateralToken: Address,
  oracle: Address,
  irm: Address,
  lltv: bigint | string | number,
): Hex {
  return calculateMarketId({
    loanToken,
    collateralToken,
    oracle,
    irm,
    lltv: BigInt(lltv),
  });
}

/**
 * Normalize market ID to Hex format (bytes32)
 *
 * Morpho uses bytes32 (32 bytes = 256 bits) for market IDs.
 * This function accepts market IDs in multiple formats and normalizes them to Hex:
 * - Hex string (with or without 0x prefix): "0xabc..." or "abc..."
 * - Decimal string: "95338056561604563240296890767983094707278911420954326117896296471197220531768"
 * - BigInt: 95338056561604563240296890767983094707278911420954326117896296471197220531768n
 *
 * @param id - Market ID in any supported format
 * @returns Market ID as Hex string with 0x prefix (32 bytes)
 */
export function normalizeMarketId(id: string | bigint): Hex {
  // If input is already a hex string (64 hex characters with or without 0x prefix)
  if (typeof id === "string" && /^(0x)?[0-9a-fA-F]{64}$/.test(id)) {
    // Add 0x prefix if missing
    return (id.startsWith("0x") ? id : `0x${id}`) as Hex;
  }

  // Convert from bigint or decimal string to hex (32 bytes)
  return toHex(typeof id === "bigint" ? id : BigInt(id), { size: 32 });
}
