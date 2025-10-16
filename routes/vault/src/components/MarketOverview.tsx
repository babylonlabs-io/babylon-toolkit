import {
  useIsMobile,
  VaultDetailCard,
  Avatar,
  AvatarGroup,
  Table,
  type ColumnProps,
} from "@babylonlabs-io/core-ui";
import { useNavigate } from "react-router";
import type { Market } from "../types/market";

// Hardcoded market data
const HARDCODED_MARKETS: Market[] = [
  {
    id: "1",
    curator: "Lombard",
    loan: "BTC/USDC",
    lltv: "70%",
    marketSize: "500M USDC ($500m)",
    totalLiquidity: "180M USDC ($180m)",
    rate: "4.2%",
  },
];

export function MarketOverview() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const markets: Market[] = HARDCODED_MARKETS;

  const columns: ColumnProps<Market>[] = [
    {
      key: "curator",
      header: "Curator",
      render: (_value: unknown, row: Market) => (
        <span className="text-sm text-accent-primary">{row.curator}</span>
      ),
    },
    {
      key: "loan",
      header: "Loan",
      render: (_value: unknown, row: Market) => (
        <div className="flex items-center gap-2">
          <AvatarGroup size="small">
            <Avatar url="/btc.png" alt="BTC" size="small" variant="circular" />
            <Avatar url="/usdc.png" alt="USDC" size="small" variant="circular" />
          </AvatarGroup>
          <span className="text-sm text-accent-primary">{row.loan}</span>
        </div>
      ),
    },
    {
      key: "lltv",
      header: "LLTV",
      render: (_value: unknown, row: Market) => (
        <span className="text-sm text-accent-primary">{row.lltv}</span>
      ),
    },
    {
      key: "marketSize",
      header: "Total Market Size",
      render: (_value: unknown, row: Market) => {
        const parts = row.marketSize.split(" ");
        const mainText = parts.slice(0, 2).join(" ");
        const subText = parts.slice(2).join(" ");
        return (
          <div className="flex items-center gap-1">
            <span className="text-sm text-accent-primary">{mainText}</span>
            {subText && (
              <span className="text-sm text-accent-secondary">{subText}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "totalLiquidity",
      header: "Total Liquidity",
      render: (_value: unknown, row: Market) => {
        const parts = row.totalLiquidity.split(" ");
        const mainText = parts.slice(0, 2).join(" ");
        const subText = parts.slice(2).join(" ");
        return (
          <div className="flex items-center gap-1">
            <span className="text-sm text-accent-primary">{mainText}</span>
            {subText && (
              <span className="text-sm text-accent-secondary">{subText}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "rate",
      header: "Borrow Rate",
      render: (_value: unknown, row: Market) => (
        <span className="text-sm text-accent-primary">{row.rate}</span>
      ),
    },
  ];

  return (
    <>
      {isMobile ? (
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {markets.length === 0 ? (
            <div className="py-8 text-center text-sm text-accent-secondary">
              No markets available
            </div>
          ) : (
            markets.map((market) => {
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
                    icons: ["/btc.png", "/usdc.png"],
                    text: market.loan,
                  }}
                  details={[
                    { label: "Curator", value: market.curator },
                    { label: "LLTV", value: market.lltv },
                    {
                      label: "Total Market Size",
                      value: (
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-accent-primary">{marketSizeMain}</span>
                          {marketSizeSub && (
                            <span className="text-sm text-accent-secondary">{marketSizeSub}</span>
                          )}
                        </div>
                      ),
                    },
                    {
                      label: "Total Liquidity",
                      value: (
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-accent-primary">{liquidityMain}</span>
                          {liquiditySub && (
                            <span className="text-sm text-accent-secondary">{liquiditySub}</span>
                          )}
                        </div>
                      ),
                    },
                  { label: "Borrow Rate", value: market.rate },
                ]}
                actions={[]}
              />
              );
            })
          )}
        </div>
      ) : (
        <div className="overflow-x-auto bg-primary-contrast max-h-[500px] overflow-y-auto">
          <Table 
            data={markets} 
            columns={columns} 
            fluid 
            onRowClick={(market: Market) => navigate(`/vault/market/${market.id}`)}
          />
        </div>
      )}
    </>
  );
}
