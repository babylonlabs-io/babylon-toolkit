import { useETHWallet } from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import type { Address } from "viem";

import { CONTRACTS } from "../../../../config/contracts";
import { useBTCPrice } from "../../../../hooks/useBTCPrice";
import { useMarkets } from "../../../../hooks/useMarkets";
import type { MorphoMarketSummary } from "../../../../services/market/marketService";
import { getMarketData } from "../../../../services/market/marketService";
import { getUserVaultPosition } from "../../../../services/position";
import { getAvailableCollaterals } from "../../../../services/vault/vaultQueryService";
import {
  blockToDateString,
  estimateDateFromBlock,
} from "../../../../utils/blockUtils";

export interface AvailableVault {
  txHash: string;
  amountSatoshis: bigint;
}

export function useMarketDetail() {
  const { marketId } = useParams<{ marketId: string }>();
  const { address } = useETHWallet();

  // Fetch BTC price from oracle
  const {
    btcPriceUSD,
    loading: isBTCPriceLoading,
    error: btcPriceError,
  } = useBTCPrice();

  // Fetch markets from API
  const {
    markets,
    loading: isMarketsLoading,
    error: marketsError,
  } = useMarkets();

  // Fetch user's position for this specific market
  const {
    data: marketPosition,
    isLoading: isPositionLoading,
    error: positionError,
    refetch: refetchPosition,
  } = useQuery({
    queryKey: ["userPosition", address, marketId, CONTRACTS.VAULT_CONTROLLER],
    queryFn: () =>
      getUserVaultPosition(
        address as Address,
        marketId!,
        CONTRACTS.VAULT_CONTROLLER,
      ),
    enabled: !!address && !!marketId,
    retry: 2,
    staleTime: 30000,
  });

  // Fetch market data from Morpho contracts
  const {
    data: marketData,
    isLoading: isMarketLoading,
    error: marketError,
    refetch: refetchMarketData,
  } = useQuery<MorphoMarketSummary>({
    queryKey: ["marketData", marketId],
    queryFn: () => getMarketData(marketId!),
    enabled: !!marketId,
    retry: 2,
    staleTime: 30000,
  });

  // Find the specific market configuration
  const marketConfig = useMemo(() => {
    if (!markets || !marketId) return null;
    return markets.find((market) => market.id === marketId) || null;
  }, [markets, marketId]);

  // Fetch available collaterals (vaults with status AVAILABLE)
  const {
    data: availableCollaterals,
    isLoading: isCollateralsLoading,
    error: collateralsError,
    refetch: refetchCollaterals,
  } = useQuery({
    queryKey: ["availableCollaterals", address],
    queryFn: () =>
      getAvailableCollaterals(address as Address, CONTRACTS.BTC_VAULTS_MANAGER),
    enabled: !!address,
    retry: 2,
    staleTime: 30000,
  });

  // Convert available collaterals to AvailableVault format
  const availableVaults: AvailableVault[] = useMemo(() => {
    if (!availableCollaterals) return [];
    return availableCollaterals.map((collateral) => ({
      txHash: collateral.txHash,
      amountSatoshis: collateral.amountSatoshis,
    }));
  }, [availableCollaterals]);

  // Combine loading states
  const loading =
    isMarketLoading ||
    isMarketsLoading ||
    isPositionLoading ||
    isBTCPriceLoading ||
    isCollateralsLoading;

  // Combine errors
  const error =
    marketError ||
    marketsError ||
    positionError ||
    btcPriceError ||
    collateralsError;

  const [creationDate, setCreationDate] = useState<string>("Loading...");

  useEffect(() => {
    const fetchCreationDate = async () => {
      if (!marketConfig?.created_block) {
        setCreationDate("Unknown");
        return;
      }
      try {
        const actualDate = await blockToDateString(marketConfig.created_block);
        if (actualDate !== "Unknown") {
          setCreationDate(actualDate);
          return;
        }
      } catch {
        // noop - will fall back to estimation
      }
      const estimatedDate = estimateDateFromBlock(marketConfig.created_block);
      setCreationDate(estimatedDate);
    };
    fetchCreationDate();
  }, [marketConfig?.created_block]);

  const formatUSDC = (value: bigint) => Number(value) / 1e6;
  const formatBTC = (value: bigint) => Number(value) / 1e8;

  const maxBorrow = marketData ? formatUSDC(marketData.totalSupplyAssets) : 0;
  const btcPrice = btcPriceUSD;

  const liquidationLtv = useMemo(() => {
    if (marketData) return marketData.lltvPercent;
    if (marketConfig) return Number(marketConfig.lltv) / 1e16;
    return 70;
  }, [marketData, marketConfig]);

  const currentLoanAmount = marketPosition
    ? formatUSDC(marketPosition.position.totalBorrowed)
    : 0;
  const currentCollateralAmount = marketPosition
    ? formatBTC(marketPosition.position.totalCollateral)
    : 0;

  // Extract only what's needed for transactions (positionId + marketId)
  const userPosition = useMemo(() => {
    if (!marketPosition) return null;
    return {
      positionId: marketPosition.positionId,
      marketId: marketPosition.position.marketId,
    };
  }, [marketPosition]);

  const formatLLTV = (lltvString: string) => {
    const lltvNumber = Number(lltvString);
    return (lltvNumber / 1e16).toFixed(1);
  };

  const marketAttributes = useMemo<
    Array<{ label: string; value: string }>
  >(() => {
    return [
      { label: "Market ID", value: marketId || "Unknown" },
      { label: "Collateral", value: "BTC" },
      { label: "Loan", value: "USDC" },
      {
        label: "Liquidation LTV",
        value: marketConfig
          ? `${formatLLTV(marketConfig.lltv)}%`
          : `${liquidationLtv.toFixed(1)}%`,
      },
      {
        label: "Oracle price",
        value: `BTC / USDC = ${btcPrice.toLocaleString()}`,
      },
      { label: "Created on", value: creationDate },
      {
        label: "Utilization",
        value: marketData
          ? `${marketData.utilizationPercent.toFixed(2)}%`
          : "Unknown",
      },
      ...(marketConfig
        ? [
            { label: "Oracle Address", value: String(marketConfig.oracle) },
            { label: "IRM Address", value: String(marketConfig.irm) },
          ]
        : []),
    ];
  }, [
    marketId,
    marketConfig,
    liquidationLtv,
    btcPrice,
    creationDate,
    marketData,
  ]);

  const positionData = useMemo<
    Array<{ label: string; value: string }> | undefined
  >(() => {
    if (!marketPosition) {
      return undefined;
    }
    const currentLtv =
      currentCollateralAmount > 0
        ? `${((currentLoanAmount / (currentCollateralAmount * btcPrice)) * 100).toFixed(1)}%`
        : "0%";
    return [
      {
        label: "Current Loan",
        value: `${currentLoanAmount.toLocaleString()} USDC`,
      },
      {
        label: "Current Collateral",
        value: `${currentCollateralAmount.toFixed(8)} BTC`,
      },
      { label: "Market", value: "BTC/USDC" },
      { label: "Current LTV", value: currentLtv },
      {
        label: "Liquidation LTV",
        value: marketConfig
          ? `${formatLLTV(marketConfig.lltv)}%`
          : `${liquidationLtv.toFixed(1)}%`,
      },
    ];
  }, [
    marketPosition,
    currentCollateralAmount,
    currentLoanAmount,
    btcPrice,
    marketConfig,
    liquidationLtv,
  ]);

  // Format market display values
  const marketDisplayValues = useMemo(() => {
    if (!marketData) {
      return {
        totalMarketSize: "?",
        totalMarketSizeSubtitle: "?",
        totalLiquidity: "?",
        totalLiquiditySubtitle: "?",
        borrowRate: "?",
      };
    }

    const totalSupplyM = (Number(marketData.totalSupplyAssets) / 1e12).toFixed(
      2,
    );
    const totalBorrowM = (Number(marketData.totalBorrowAssets) / 1e12).toFixed(
      2,
    );

    return {
      totalMarketSize: `$${totalSupplyM}M`,
      totalMarketSizeSubtitle: `${totalSupplyM}M USDC`,
      totalLiquidity: `$${totalBorrowM}M`,
      totalLiquiditySubtitle: `${totalBorrowM}M USDC`,
      borrowRate: "?",
    };
  }, [marketData]);

  // Refetch data that changes after user transactions (borrow/repay)
  const refetch = async () => {
    await Promise.all([
      refetchPosition(), // User's position changes
      refetchCollaterals(), // Available vaults change
      refetchMarketData(), // Market totals change slightly
    ]);
  };

  return {
    // loading / error
    isMarketLoading: loading,
    marketError: error as Error | null,

    // data
    marketData,
    marketConfig,
    userPosition,
    btcPrice,
    maxBorrow,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    availableVaults,

    // derived view
    marketAttributes,
    positionData,
    marketDisplayValues,

    // actions
    refetch,
  } as const;
}
