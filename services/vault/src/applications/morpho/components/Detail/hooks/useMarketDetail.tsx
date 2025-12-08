import { Avatar, Text } from "@babylonlabs-io/core-ui";
import { useETHWallet } from "@babylonlabs-io/wallet-connector";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import type { Address } from "viem";

import { CONTRACTS } from "../../../../../config/contracts";
import { useBTCPrice } from "../../../../../hooks/useBTCPrice";
import { useTokenPair } from "../../../../../hooks/useTokenPair";
import { getMarketBorrowAPR } from "../../../../../services/irm";
import {
  blockToDateString,
  estimateDateFromBlock,
} from "../../../../../utils/blockUtils";
import { useMarkets } from "../../../hooks";
import {
  getMarketData,
  getUserPositionForMarket,
  type MorphoMarketSummary,
} from "../../../services";

import { useVaultsForBorrowing } from "./useVaultsForBorrowing";

export type { BorrowableVault } from "./useVaultsForBorrowing";

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

  const {
    data: position,
    isLoading: isPositionLoading,
    error: positionError,
    refetch: refetchPosition,
  } = useQuery({
    queryKey: [
      "userPositionForMarket",
      address,
      marketId,
      CONTRACTS.MORPHO_CONTROLLER,
    ],
    queryFn: () =>
      getUserPositionForMarket(
        address as Address,
        marketId!,
        CONTRACTS.MORPHO_CONTROLLER,
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

  // Fetch vaults available for borrowing
  const {
    vaults: borrowableVaults,
    isLoading: isCollateralsLoading,
    error: collateralsError,
    refetch: refetchCollaterals,
  } = useVaultsForBorrowing(address as Address | undefined);

  // Fetch token metadata for the market
  const {
    data: tokenPair,
    isLoading: isTokenPairLoading,
    error: tokenPairError,
  } = useTokenPair(
    marketConfig?.collateralTokenAddress,
    marketConfig?.loanTokenAddress,
  );

  // Combine loading states
  const loading =
    isMarketLoading ||
    isMarketsLoading ||
    isPositionLoading ||
    isBTCPriceLoading ||
    isCollateralsLoading ||
    isTokenPairLoading;

  // Combine errors
  const error =
    marketError ||
    marketsError ||
    positionError ||
    btcPriceError ||
    collateralsError ||
    tokenPairError;

  const [creationDate, setCreationDate] = useState<string>("Loading...");

  useEffect(() => {
    const fetchCreationDate = async () => {
      if (!marketConfig?.blockNumber) {
        setCreationDate("Unknown");
        return;
      }
      const blockNum = Number(marketConfig.blockNumber);
      try {
        const actualDate = await blockToDateString(blockNum);
        if (actualDate !== "Unknown") {
          setCreationDate(actualDate);
          return;
        }
      } catch {
        // noop - will fall back to estimation
      }
      const estimatedDate = estimateDateFromBlock(blockNum);
      setCreationDate(estimatedDate);
    };
    fetchCreationDate();
  }, [marketConfig?.blockNumber]);

  const formatUSDC = (value: bigint) => Number(value) / 1e6;
  // Collateral in Morpho is stored in satoshis (8 decimals)
  const formatVaultBTC = (value: bigint) => Number(value) / 1e8;

  const btcPrice = btcPriceUSD;

  const liquidationLtv = useMemo(() => {
    if (marketData) return marketData.lltvPercent;
    if (marketConfig) return Number(marketConfig.lltv) / 1e16;
    return 70;
  }, [marketData, marketConfig]);

  const currentLoanAmount = position ? formatUSDC(position.currentLoan) : 0;
  const currentCollateralAmount = position
    ? formatVaultBTC(position.currentCollateral)
    : 0;

  // Calculate available liquidity for borrowing (in USDC)
  const availableLiquidity = useMemo(() => {
    if (!marketData) return 0;
    return formatUSDC(
      marketData.totalSupplyAssets - marketData.totalBorrowAssets,
    );
  }, [marketData]);

  // Extract only what's needed for transactions (positionId + marketId)
  const userPosition = position
    ? {
        positionId: position.positionId,
        marketId: position.marketId,
      }
    : null;

  const formatLLTV = (lltvString: string) => {
    const lltvNumber = Number(lltvString);
    return (lltvNumber / 1e16).toFixed(1);
  };

  const marketAttributes = useMemo<
    Array<{ label: string; value: string | ReactNode }>
  >(() => {
    return [
      { label: "Market ID", value: marketId || "Unknown" },
      {
        label: "Collateral",
        value: (
          <div className="flex items-center gap-[4px]">
            <Avatar
              {...(tokenPair?.collateral.icon
                ? { url: tokenPair.collateral.icon }
                : {})}
              alt={tokenPair?.collateral.symbol || "???"}
              size="tiny"
              variant="circular"
            >
              {!tokenPair?.collateral.icon && (
                <Text
                  as="span"
                  className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-[8px] font-medium text-accent-contrast"
                >
                  {tokenPair?.collateral.symbol?.charAt(0).toUpperCase() || "?"}
                </Text>
              )}
            </Avatar>
            <span>{tokenPair?.collateral.symbol || "Unknown"}</span>
          </div>
        ),
      },
      {
        label: "Loan",
        value: (
          <div className="flex items-center gap-[4px]">
            <Avatar
              {...(tokenPair?.loan.icon ? { url: tokenPair.loan.icon } : {})}
              alt={tokenPair?.loan.symbol || "???"}
              size="tiny"
              variant="circular"
            >
              {!tokenPair?.loan.icon && (
                <Text
                  as="span"
                  className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-[8px] font-medium text-accent-contrast"
                >
                  {tokenPair?.loan.symbol?.charAt(0).toUpperCase() || "?"}
                </Text>
              )}
            </Avatar>
            <span>{tokenPair?.loan.symbol || "Unknown"}</span>
          </div>
        ),
      },
      {
        label: "Liquidation LTV",
        value: marketConfig
          ? `${formatLLTV(marketConfig.lltv)}%`
          : `${liquidationLtv.toFixed(1)}%`,
      },
      {
        label: "Oracle price",
        value: tokenPair
          ? `${tokenPair.collateral.symbol} / ${tokenPair.loan.symbol} = ${btcPrice.toLocaleString()}`
          : `Price = ${btcPrice.toLocaleString()}`,
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
            {
              label: "Oracle Address",
              value: String(marketConfig.oracleAddress),
            },
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
    tokenPair,
  ]);

  const positionData = useMemo<
    Array<{ label: string; value: string }> | undefined
  >(() => {
    if (!position) {
      return undefined;
    }
    const currentLtv =
      currentCollateralAmount > 0
        ? `${((currentLoanAmount / (currentCollateralAmount * btcPrice)) * 100).toFixed(1)}%`
        : "0%";
    return [
      {
        label: "Current Loan",
        value: `${currentLoanAmount.toLocaleString()} ${tokenPair?.loan.symbol || "???"}`,
      },
      {
        label: "Current Collateral",
        value: `${currentCollateralAmount.toFixed(8)} ${tokenPair?.collateral.symbol || "???"}`,
      },
      { label: "Market", value: tokenPair?.pairName || "Unknown Market" },
      { label: "Current LTV", value: currentLtv },
      {
        label: "Liquidation LTV",
        value: marketConfig
          ? `${formatLLTV(marketConfig.lltv)}%`
          : `${liquidationLtv.toFixed(1)}%`,
      },
    ];
  }, [
    position,
    currentCollateralAmount,
    currentLoanAmount,
    btcPrice,
    marketConfig,
    liquidationLtv,
    tokenPair,
  ]);

  // Fetch actual borrow rate from IRM contract
  const { data: actualBorrowAPR } = useQuery({
    queryKey: [
      "borrowAPR",
      marketConfig?.irm,
      // Convert BigInt to string for React Query serialization
      marketData?.totalSupplyAssets.toString(),
      marketData?.totalBorrowAssets.toString(),
    ],
    queryFn: async () => {
      if (!marketConfig || !marketData) return null;

      const marketParams = {
        loanToken: marketConfig.loanTokenAddress as Address,
        collateralToken: marketConfig.collateralTokenAddress as Address,
        oracle: marketConfig.oracleAddress as Address,
        irm: marketConfig.irm as Address,
        lltv: BigInt(marketConfig.lltv),
      };

      const marketState = {
        totalSupplyAssets: marketData.totalSupplyAssets,
        totalSupplyShares: marketData.totalSupplyShares,
        totalBorrowAssets: marketData.totalBorrowAssets,
        totalBorrowShares: marketData.totalBorrowShares,
        lastUpdate: marketData.lastUpdate,
        fee: marketData.fee,
      };

      return getMarketBorrowAPR(
        marketConfig.irm as Address,
        marketParams,
        marketState,
      );
    },
    enabled: !!marketConfig && !!marketData,
    staleTime: 30000, // Refresh every 30 seconds
  });

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

    // Convert from USDC raw units (6 decimals) to actual USDC
    const totalSupplyUSDC = Number(marketData.totalSupplyAssets) / 1e6;
    const totalBorrowUSDC = Number(marketData.totalBorrowAssets) / 1e6;
    const availableLiquidityUSDC = totalSupplyUSDC - totalBorrowUSDC;

    // Format based on size - show actual USDC if less than $10k, otherwise show in millions
    const formatCurrency = (valueUSDC: number) => {
      if (valueUSDC < 10000) {
        // Less than $10k - show actual USDC amount
        return {
          display: `$${valueUSDC.toFixed(2)}`,
          subtitle: tokenPair
            ? `${valueUSDC.toFixed(2)} ${tokenPair.loan.symbol}`
            : `${valueUSDC.toFixed(2)}`,
        };
      } else {
        // $10k or more - show in millions
        const valueM = (valueUSDC / 1e6).toFixed(2);
        return {
          display: `$${valueM}M`,
          subtitle: tokenPair
            ? `${valueM}M ${tokenPair.loan.symbol}`
            : `${valueM}M`,
        };
      }
    };

    const totalSupplyFormatted = formatCurrency(totalSupplyUSDC);
    const availableLiquidityFormatted = formatCurrency(availableLiquidityUSDC);

    // Use actual borrow APR from IRM if available, otherwise show loading or N/A
    const borrowRateDisplay =
      typeof actualBorrowAPR === "number"
        ? `${actualBorrowAPR.toFixed(2)}%`
        : actualBorrowAPR === null
          ? "N/A"
          : "Loading...";

    return {
      totalMarketSize: totalSupplyFormatted.display,
      totalMarketSizeSubtitle: totalSupplyFormatted.subtitle,
      totalLiquidity: availableLiquidityFormatted.display,
      totalLiquiditySubtitle: availableLiquidityFormatted.subtitle,
      borrowRate: borrowRateDisplay,
    };
  }, [marketData, actualBorrowAPR, tokenPair]);

  // Refetch data that changes after user transactions (borrow/repay)
  const refetch = async () => {
    await Promise.all([
      refetchPosition(), // Refetches both Vault Controller AND Morpho data
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
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,
    borrowableVaults,
    availableLiquidity,

    // derived view
    marketAttributes,
    positionData,
    marketDisplayValues,
    tokenPair,

    // actions
    refetch,
  } as const;
}
