import {
  Avatar,
  AvatarGroup,
  Table,
  Text,
  useIsMobile,
  VaultDetailCard,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";

import { useMarkets } from "../../../hooks/useMarkets";
import type { MarketTokenPair } from "../../../services/token";
import { getMarketTokenPairAsync } from "../../../services/token";
import type { MorphoMarket } from "../../../types";
import { formatLLTV } from "../../../utils/formatting";

export function Market() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Fetch real market data from API
  const { markets, loading, error } = useMarkets();

  // Fetch token metadata for all markets
  const { data: tokenPairs } = useQuery({
    queryKey: [
      "marketTokenPairs",
      markets?.map((m) => `${m.collateral_token}-${m.loan_token}`).join(","),
    ],
    queryFn: async () => {
      if (!markets || markets.length === 0)
        return new Map<string, MarketTokenPair>();

      const pairs = await Promise.all(
        markets.map(async (market) => {
          const pair = await getMarketTokenPairAsync(
            market.collateral_token,
            market.loan_token,
          );
          return { marketId: market.id, pair };
        }),
      );

      // Create a map for easy lookup
      return new Map(pairs.map(({ marketId, pair }) => [marketId, pair]));
    },
    enabled: !!markets && markets.length > 0,
    staleTime: Infinity, // Token metadata doesn't change
  });

  // Get token pair for a market with fallback
  const getTokenPairForMarket = useCallback(
    (market: MorphoMarket): MarketTokenPair => {
      if (tokenPairs?.has(market.id)) {
        return tokenPairs.get(market.id)!;
      }

      // Fallback to showing addresses while loading
      const truncateAddr = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      return {
        collateral: {
          address: market.collateral_token as any,
          symbol: truncateAddr(market.collateral_token),
          name: "Loading...",
          decimals: 18,
        },
        loan: {
          address: market.loan_token as any,
          symbol: truncateAddr(market.loan_token),
          name: "Loading...",
          decimals: 18,
        },
        pairName: `${truncateAddr(market.collateral_token)} / ${truncateAddr(market.loan_token)}`,
      };
    },
    [tokenPairs],
  );

  const handleMarketClick = (market: MorphoMarket | null) => {
    if (market) {
      navigate(`/market/${market.id}`);
    }
  };

  // Helper function to truncate address
  const truncateAddress = useCallback((address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  const columns: ColumnProps<MorphoMarket>[] = useMemo(
    () => [
      {
        key: "market",
        header: "Market",
        render: (_value: unknown, row: MorphoMarket | null) => {
          if (!row) return <span>-</span>;

          const tokenPair = getTokenPairForMarket(row);
          return (
            <div className="flex items-center gap-2">
              <AvatarGroup max={2}>
                <Avatar
                  {...(tokenPair.collateral.icon
                    ? { url: tokenPair.collateral.icon }
                    : {})}
                  alt={tokenPair.collateral.symbol}
                  size="tiny"
                  variant="circular"
                >
                  {!tokenPair.collateral.icon && (
                    <Text
                      as="span"
                      className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-[8px] font-medium text-accent-contrast"
                    >
                      {tokenPair.collateral.symbol?.charAt(0).toUpperCase() ||
                        "?"}
                    </Text>
                  )}
                </Avatar>
                <Avatar
                  {...(tokenPair.loan.icon ? { url: tokenPair.loan.icon } : {})}
                  alt={tokenPair.loan.symbol}
                  size="tiny"
                  variant="circular"
                >
                  {!tokenPair.loan.icon && (
                    <Text
                      as="span"
                      className="inline-flex h-full w-full items-center justify-center bg-secondary-main text-[8px] font-medium text-accent-contrast"
                    >
                      {tokenPair.loan.symbol?.charAt(0).toUpperCase() || "?"}
                    </Text>
                  )}
                </Avatar>
              </AvatarGroup>
              <span>{tokenPair.pairName}</span>
            </div>
          );
        },
      },
      {
        key: "id",
        header: "Market ID",
        render: (_value: unknown, row: MorphoMarket) => (
          <span className="font-mono text-sm text-accent-primary">
            {truncateAddress(row.id)}
          </span>
        ),
      },
      {
        key: "lltv",
        header: "LLTV",
        render: (_value: unknown, row: MorphoMarket) => (
          <span className="text-sm text-accent-primary">
            {formatLLTV(row.lltv)}
          </span>
        ),
      },
      {
        key: "created_block",
        header: "Created Block",
        render: (_value: unknown, row: MorphoMarket) => (
          <span className="text-sm text-accent-primary">
            {row.created_block.toLocaleString()}
          </span>
        ),
      },
      {
        key: "oracle",
        header: "Oracle",
        render: (_value: unknown, row: MorphoMarket) => (
          <span className="font-mono text-sm text-accent-primary">
            {truncateAddress(row.oracle)}
          </span>
        ),
      },
      {
        key: "irm",
        header: "IRM",
        render: (_value: unknown, row: MorphoMarket) => (
          <span className="font-mono text-sm text-accent-primary">
            {truncateAddress(row.irm)}
          </span>
        ),
      },
    ],
    [getTokenPairForMarket, truncateAddress],
  );

  // Loading state
  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-accent-secondary">
        Loading markets...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-500">
        Error loading markets: {error.message}
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {markets.length === 0 ? (
            <div className="py-8 text-center text-sm text-accent-secondary">
              No markets available
            </div>
          ) : (
            markets.map((market) => {
              const tokenPair = getTokenPairForMarket(market);
              return (
                <div
                  key={market.id}
                  onClick={() => handleMarketClick(market)}
                  className="cursor-pointer"
                >
                  <VaultDetailCard
                    id={market.id}
                    title={{
                      icons: [],
                      text: tokenPair.pairName,
                    }}
                    details={[
                      { label: "Market ID", value: truncateAddress(market.id) },
                      { label: "LLTV", value: formatLLTV(market.lltv) },
                      {
                        label: "Created Block",
                        value: market.created_block.toLocaleString(),
                      },
                      {
                        label: "Oracle",
                        value: truncateAddress(market.oracle),
                      },
                      { label: "IRM", value: truncateAddress(market.irm) },
                    ]}
                    actions={[]}
                  />
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
          <Table
            data={markets}
            columns={columns}
            fluid
            onRowSelect={handleMarketClick}
          />
        </div>
      )}
    </>
  );
}
