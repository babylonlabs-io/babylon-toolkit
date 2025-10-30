import { formatUnits } from "viem";

import type { PositionWithMorpho } from "../../../services/position";
import type { Position } from "../../../types/position";

/**
 * Transform PositionWithMorpho to UI Position format
 */
export function transformPosition(positionData: PositionWithMorpho): Position {
  const { positionId, morphoPosition, marketData, btcPriceUSD } = positionData;

  const borrowAssets = morphoPosition.borrowAssets;
  const collateral = morphoPosition.collateral;

  // vBTC uses 18 decimals (not 8!)
  const btcAmountNum = Number(formatUnits(collateral, 18));
  const collateralValueUSD = btcAmountNum * btcPriceUSD;

  // USDC has 6 decimals
  const borrowedValueUSD = Number(formatUnits(borrowAssets, 6));

  // Current LTV = (borrowed / collateral) * 100
  const currentLTV =
    collateralValueUSD > 0
      ? Math.round((borrowedValueUSD / collateralValueUSD) * 100)
      : 0;

  // Morpho stores LLTV with 18 decimals (1e18 = 100%)
  const liquidationLTV = Math.round(Number(formatUnits(marketData.lltv, 16)));

  // Health Factor (Aave-style): liquidationLTV / currentLTV
  // Health Factor < 1.0 means position can be liquidated
  // Health Factor > 1.0 means position is safe (higher is safer)
  // Example: HF = 1.69 means position is 1.69x above minimum safe level
  const healthFactor =
    currentLTV > 0 ? (liquidationLTV / currentLTV).toFixed(2) : "∞";

  const borrowRate = `${marketData.utilizationPercent.toFixed(2)}%`;

  // Format borrowed amount (USDC with 6 decimals)
  const borrowedAmount = `${borrowedValueUSD.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;

  return {
    id: positionId,
    borrowedAmount,
    market: "BTC/USDC",
    lltv: `${currentLTV}%`,
    liquidationLtv: `${liquidationLTV}%`,
    borrowRate,
    health: healthFactor,
  };
}
