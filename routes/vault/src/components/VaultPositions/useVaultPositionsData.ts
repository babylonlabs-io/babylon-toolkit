/**
 * Hook to manage vault positions data and transformations
 * Separates data logic from UI rendering
 */

import { useMemo } from 'react';
import type { Address } from 'viem';
import { useVaultPositionsMorpho } from '../../hooks/useVaultPositionsMorpho';
import { formatUSDCAmount } from '../../utils/peginTransformers';
import { bitcoinIcon } from '../../assets';
import type { PositionData } from './PositionCard';
import type { VaultPositionWithMorpho } from '../../services/vault/vaultService';

export interface UseVaultPositionsDataResult {
  /** Transformed position data ready for UI */
  positions: PositionData[];
  /** Raw vault positions with full data (for passing to modals) */
  rawPositions: VaultPositionWithMorpho[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch positions */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and transform vault positions data
 *
 * @param connectedAddress - Connected wallet address
 * @returns Transformed positions data and loading/error states
 */
export function useVaultPositionsData(
  connectedAddress: Address | undefined
): UseVaultPositionsDataResult {
  // Fetch vault positions with Morpho data
  const {
    positions: vaultPositions,
    loading,
    error,
    refetch
  } = useVaultPositionsMorpho(connectedAddress);

  // Transform vault positions into PositionData for display
  const positions: PositionData[] = useMemo(() => {
    return vaultPositions.map(({ morphoPosition, metadata, btcPriceUSD, marketData }) => {
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

      // Format borrowed amount (from vault metadata - the original borrowed amount)
      // and total to repay (from Morpho - includes accrued interest)
      const borrowedAmount = formatUSDCAmount(metadata.borrowAmount);
      const totalRepayAmount = formatUSDCAmount(borrowAssets);

      // Calculate interest accrued (difference between current debt and original borrow)
      const interestAccrued = formatUSDCAmount(borrowAssets - metadata.borrowAmount);

      // Calculate current LTV
      // LTV = (borrowed USD value / collateral USD value) * 100
      const borrowedValueUSD = Number(borrowAssets) / 1e6; // USDC has 6 decimals
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
        },
        borrowedAmount,
        borrowedSymbol: 'USDC',
        totalToRepay: totalRepayAmount,
        interestAccrued,
        currentLTV,
        liquidationLTV,
      };
    });
  }, [vaultPositions]);

  return {
    positions,
    rawPositions: vaultPositions,
    loading,
    error,
    refetch,
  };
}
