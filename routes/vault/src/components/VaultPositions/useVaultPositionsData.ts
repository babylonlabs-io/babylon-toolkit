/**
 * Hook to manage vault positions data and transformations
 * Separates data logic from UI rendering
 */

import { useMemo } from 'react';
import type { Address } from 'viem';
import { useUserPositions } from '../../hooks/useUserPositions';
import { formatUSDCAmount } from '../../utils/peginTransformers';
import { bitcoinIcon } from '../../assets';
import type { PositionData } from './PositionCard';
import type { PositionWithMorpho } from '../../services/position';

export interface UseVaultPositionsDataResult {
  /** Transformed position data ready for UI */
  positions: PositionData[];
  /** Raw positions with full data (for passing to modals) */
  rawPositions: PositionWithMorpho[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch positions */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and transform user positions data
 *
 * @param connectedAddress - Connected wallet address
 * @returns Transformed positions data and loading/error states
 */
export function useVaultPositionsData(
  connectedAddress: Address | undefined
): UseVaultPositionsDataResult {
  // Fetch user positions with Morpho data
  const {
    positions: userPositions,
    loading,
    error,
    refetch
  } = useUserPositions(connectedAddress);

  // Transform user positions into PositionData for display
  const positions: PositionData[] = useMemo(() => {
    return userPositions.map(({ morphoPosition, btcPriceUSD, marketData }) => {
      const borrowAssets = morphoPosition.borrowAssets;
      const collateral = morphoPosition.collateral;

      // Format BTC collateral amount (vBTC has 18 decimals, not 8)
      // Convert from 18 decimals to BTC by dividing by 1e18
      const btcAmountNum = Number(collateral) / 1e18; // BTC amount in human-readable units
      const btcAmount = btcAmountNum.toFixed(8).replace(/\.?0+$/, '') || '0';

      // Calculate collateral value in USD (for both display and LTV calculation)
      const collateralValueUSD = btcAmountNum * btcPriceUSD;
      const collateralValueUSDFormatted = collateralValueUSD.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      // Format loan token amount
      // Note: Currently assumes USDC (6 decimals) - the loan token for all active markets
      // TODO: Fetch ERC20 symbol and decimals from marketData.loanToken for full flexibility
      const loanTokenDecimals = 6; // USDC decimals
      const loanTokenSymbol = 'USDC';

      // Current debt from Morpho (this is the actual amount owed right now)
      const currentDebt = formatUSDCAmount(borrowAssets);

      // Total to repay is the same as current debt (kept for backwards compatibility)
      const totalRepayAmount = currentDebt;

      // Calculate current LTV
      // LTV = (borrowed USD value / collateral USD value) * 100
      const borrowedValueUSD = Number(borrowAssets) / Math.pow(10, loanTokenDecimals);
      const currentLTV = collateralValueUSD > 0
        ? Math.round((borrowedValueUSD / collateralValueUSD) * 100)
        : 0;

      // Get liquidation LTV from market params (LLTV - Liquidation Loan-to-Value)
      // Morpho LLTV is stored with 18 decimals where 1e18 = 100%
      const liquidationLTV = Math.round(Number(marketData.lltv) / 1e16);

      return {
        collateral: {
          amount: btcAmount,
          symbol: 'BTC',
          icon: bitcoinIcon,
          valueUSD: collateralValueUSDFormatted,
          raw: collateral,
        },
        borrowedAmount: currentDebt,
        borrowedSymbol: loanTokenSymbol,
        totalToRepay: totalRepayAmount,
        currentLTV,
        liquidationLTV,
        rawDebt: borrowAssets,
      };
    });
  }, [userPositions]);

  return {
    positions,
    rawPositions: userPositions,
    loading,
    error,
    refetch,
  };
}
