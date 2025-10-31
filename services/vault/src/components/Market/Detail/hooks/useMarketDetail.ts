import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";

import { useMarketDetailData } from "../../../../hooks/useMarketDetailData";
import {
  blockToDateString,
  estimateDateFromBlock,
} from "../../../../utils/blockUtils";

export function useMarketDetail() {
  const { marketId } = useParams<{ marketId: string }>();

  const {
    marketData,
    marketConfig,
    userPosition,
    btcBalance,
    btcPriceUSD,
    loading: isMarketLoading,
    error: marketError,
    refetch,
  } = useMarketDetailData(marketId);

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

  const maxCollateral = formatBTC(btcBalance);
  const maxBorrow = marketData ? formatUSDC(marketData.totalSupplyAssets) : 0;
  const btcPrice = btcPriceUSD;

  const liquidationLtv = useMemo(() => {
    if (marketData) return marketData.lltvPercent;
    if (marketConfig) return Number(marketConfig.lltv) / 1e16;
    return 70;
  }, [marketData, marketConfig]);

  const currentLoanAmount = userPosition
    ? formatUSDC(userPosition.borrowAssets)
    : 0;
  const currentCollateralAmount = userPosition
    ? formatBTC(userPosition.collateral)
    : 0;

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
    if (!userPosition) {
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
    userPosition,
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

  return {
    // loading / error
    isMarketLoading,
    marketError,

    // data
    marketData,
    marketConfig,
    userPosition,
    btcPrice,
    maxCollateral,
    maxBorrow,
    liquidationLtv,
    currentLoanAmount,
    currentCollateralAmount,

    // derived view
    marketAttributes,
    positionData,
    marketDisplayValues,

    // actions
    refetch,
  } as const;
}
