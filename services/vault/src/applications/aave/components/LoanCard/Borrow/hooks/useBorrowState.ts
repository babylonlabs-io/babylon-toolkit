/**
 * Borrow state management hook
 */

import { useMemo, useState } from "react";

// TODO: Move to a asset selection modal
export interface Asset {
  name: string;
  symbol: string;
  icon: string;
}

export interface UseBorrowStateProps {
  btcPrice: number;
  liquidationLtv: number;
  availableLiquidity: number;
  currentCollateralAmount?: number;
  currentLoanAmount?: number;
}

export interface UseBorrowStateResult {
  borrowAmount: number;
  setBorrowAmount: (amount: number) => void;
  resetAmounts: () => void;
  maxBorrowAmount: number;
  borrowRate: number;
  selectedAsset: Asset;
  setSelectedAsset: (asset: Asset) => void;
}

// Default asset (USDC)
const DEFAULT_ASSET: Asset = {
  name: "USD Coin",
  symbol: "USDC",
  icon: "/images/usdc.png",
};

export function useBorrowState({
  btcPrice,
  liquidationLtv,
  availableLiquidity,
  currentCollateralAmount = 0,
  currentLoanAmount = 0,
}: UseBorrowStateProps): UseBorrowStateResult {
  const [borrowAmount, setBorrowAmount] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState<Asset>(DEFAULT_ASSET);

  const resetAmounts = () => {
    setBorrowAmount(0);
  };

  // Static borrow rate for UI-only implementation
  const borrowRate = 5.861;

  const maxBorrowAmount = useMemo(() => {
    // Max borrow based on existing collateral
    const maxFromCollateral =
      currentCollateralAmount * btcPrice * (liquidationLtv / 100);
    const maxAdditionalBorrow = maxFromCollateral - currentLoanAmount;

    // Also constrained by available liquidity
    const maxAllowed = Math.min(
      Math.max(0, maxAdditionalBorrow),
      availableLiquidity,
    );

    return Math.floor(maxAllowed * 100) / 100;
  }, [
    currentCollateralAmount,
    currentLoanAmount,
    btcPrice,
    liquidationLtv,
    availableLiquidity,
  ]);

  return {
    borrowAmount,
    setBorrowAmount,
    resetAmounts,
    maxBorrowAmount,
    borrowRate,
    selectedAsset,
    setSelectedAsset,
  };
}
