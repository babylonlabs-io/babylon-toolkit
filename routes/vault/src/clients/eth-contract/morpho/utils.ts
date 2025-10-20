/**
 * Morpho Market Utilities
 *
 * Helper functions for working with Morpho markets
 */

import { keccak256, encodeAbiParameters, parseAbiParameters, type Hex, type Address } from 'viem';
import type { MarketParams } from '../vault-controller/transaction';

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
    parseAbiParameters('address, address, address, address, uint256'),
    [
      params.loanToken,
      params.collateralToken,
      params.oracle,
      params.irm,
      BigInt(params.lltv)
    ]
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
  lltv: bigint | string | number
): Hex {
  return calculateMarketId({
    loanToken,
    collateralToken,
    oracle,
    irm,
    lltv: BigInt(lltv),
  });
}
