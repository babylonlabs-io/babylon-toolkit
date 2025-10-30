import {
  Avatar,
  AvatarGroup,
  Table,
  useIsMobile,
  VaultDetailCard,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import type { Market } from "../types/market";

// Hardcoded market data
const HARDCODED_MARKETS: Market[] = [];

export function MarketOverview() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Fetch real market data from API
  const { markets, loading, error } = useMarkets();

  const handleMarketClick = (market: MorphoMarket | null) => {
    if (market) {
      navigate(`/market/${market.id}`);
    }
  };

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

  // Helper function to truncate address
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const columns: ColumnProps<MorphoMarket>[] = [
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
      key: "loan",
      header: "Market",
      render: () => (
        <div className="flex items-center gap-2">
          <AvatarGroup size="small">
            <Avatar
              url="/images/btc.png"
              alt="BTC"
              size="small"
              variant="circular"
            />
            <Avatar
              url="/images/usdc.png"
              alt="USDC"
              size="small"
              variant="circular"
            />
          </AvatarGroup>
          <span className="text-sm text-accent-primary">BTC/USDC</span>
        </div>
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
  ];

  // Show empty state when no data
  if (markets.length === 0) {
    return (
      <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
        <div className="flex min-h-[200px] items-center justify-center px-8 py-16 text-center text-sm text-accent-secondary">
          Markets will appear here.
        </div>
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {markets.map((market) => {
            const marketSizeParts = market.marketSize.split(" ");
            const marketSizeMain = marketSizeParts.slice(0, 2).join(" ");
            const marketSizeSub = marketSizeParts.slice(2).join(" ");

            const liquidityParts = market.totalLiquidity.split(" ");
            const liquidityMain = liquidityParts.slice(0, 2).join(" ");
            const liquiditySub = liquidityParts.slice(2).join(" ");

            return (
              <VaultDetailCard
                key={market.id}
                id={market.id}
                title={{
                  icons: ["/images/btc.png", "/images/usdc.png"],
                  text: market.loan,
                }}
                details={[
                  { label: "Curator", value: market.curator },
                  { label: "LLTV", value: market.lltv },
                  {
                    label: "Total Market Size",
                    value: (
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-accent-primary">
                          {marketSizeMain}
                        </span>
                        {marketSizeSub && (
                          <span className="text-sm text-accent-secondary">
                            {marketSizeSub}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    label: "Total Liquidity",
                    value: (
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-accent-primary">
                          {liquidityMain}
                        </span>
                        {liquiditySub && (
                          <span className="text-sm text-accent-secondary">
                            {liquiditySub}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  { label: "Borrow Rate", value: market.rate },
                  {
                    label: "Trusted by",
                    value: (
                      <AvatarGroup size="small" max={3}>
                        {market.trustedBy.map((url, idx) => (
                          <Avatar
                            key={idx}
                            url={url}
                            alt=""
                            size="small"
                            variant="circular"
                          />
                        ))}
                      </AvatarGroup>
                    ),
                  },
                ]}
                actions={[]}
              />
            );
          })}
        </div>
      ) : (
        <div className="max-h-[500px] overflow-x-auto overflow-y-auto bg-primary-contrast">
          <Table
            data={markets}
            columns={columns}
            fluid
            onRowClick={(market: Market) => navigate(`/market/${market.id}`)}
          />
        </div>
      )}
    </>
  );
}
