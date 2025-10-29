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
  const btcAmountNum = Number(collateral) / 1e18;
  const collateralValueUSD = btcAmountNum * btcPriceUSD;

  // USDC has 6 decimals
  const borrowedValueUSD = Number(borrowAssets) / Math.pow(10, 6);

  // Current LTV = (borrowed / collateral) * 100
  const currentLTV =
    collateralValueUSD > 0
      ? Math.round((borrowedValueUSD / collateralValueUSD) * 100)
      : 0;

  // Morpho stores LLTV with 18 decimals (1e18 = 100%)
  const liquidationLTV = Math.round(Number(marketData.lltv) / 1e16);

  // Health = (liquidationLTV / currentLTV) * 100
  const healthFactor =
    currentLTV > 0 ? Math.round((liquidationLTV / currentLTV) * 100) : 100;

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
    health: `${healthFactor}%`,
  };
}
