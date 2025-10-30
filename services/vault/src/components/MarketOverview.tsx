import {
  Avatar,
  AvatarGroup,
  Table,
  useIsMobile,
  VaultDetailCard,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";

import type { MorphoMarket } from "../clients/vault-api/types";
import { useMarkets } from "../hooks/useMarkets";
import { formatLLTV } from "../utils/formatting";

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

  return (
    <>
      {isMobile ? (
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {markets.length === 0 ? (
            <div className="py-8 text-center text-sm text-accent-secondary">
              No markets available
            </div>
          ) : (
            markets.map((market) => (
              <div
                key={market.id}
                onClick={() => handleMarketClick(market)}
                className="cursor-pointer"
              >
                <VaultDetailCard
                  id={market.id}
                  title={{
                    icons: [
                      market.loan_token.icon ?? `/images/${market.loan_token.symbol.toLowerCase()}.png`,
                      market.collateral_token.icon ?? `/images/${market.collateral_token.symbol.toLowerCase()}.png`,
                    ],
                    text: `${market.loan_token.symbol}/${market.collateral_token.symbol}`,
                  }}
                  details={[
                    { label: "Market ID", value: truncateAddress(market.id) },
                    { label: "LLTV", value: formatLLTV(market.lltv) },
                    {
                      label: "Created Block",
                      value: market.created_block.toLocaleString(),
                    },
                    { label: "Oracle", value: truncateAddress(market.oracle) },
                    { label: "IRM", value: truncateAddress(market.irm) },
                  ]}
                  actions={[]}
                />
              </div>
            ))
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
