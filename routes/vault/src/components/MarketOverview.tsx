import type { Market } from "../types/market";

const columns = [
  { field: "loan" as const, headerName: "Loan", align: "left" as const, width: "1fr" },
  { field: "ltv" as const, headerName: "LTV", align: "left" as const, width: "1fr" },
  { field: "marketSize" as const, headerName: "Market Size", align: "left" as const, width: "1fr" },
  { field: "totalLiquidity" as const, headerName: "Total Liquidity", align: "left" as const, width: "1fr" },
  { field: "rate" as const, headerName: "Rate", align: "right" as const, width: "1fr" },
];

export function MarketOverview() {
  const markets: Market[] = [];

  return (
    <div className="overflow-x-auto">
        <div
          className="grid min-w-[600px]"
          style={{
            gridTemplateColumns: columns.map((col) => col.width).join(" "),
          }}
        >
          <div className="contents">
            {columns.map((col) => (
              <div
                key={col.field}
                className={`p-4 text-xs text-accent-secondary ${
                  col.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {col.headerName}
              </div>
            ))}
          </div>

          {markets.length === 0 && (
            <div
              className="col-span-full py-8 text-center text-sm text-accent-secondary"
              style={{ gridColumn: "1 / -1" }}
            >
              No markets available
            </div>
          )}

          {markets.map((market) => (
            <div key={market.id} className="contents">
              {columns.map((col) => (
                <div
                  key={`${market.id}-${col.field}`}
                  className={`p-4 text-sm text-accent-primary ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {market[col.field]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
  );
}
