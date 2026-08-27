import { Avatar } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";

export interface BorrowMarketRow {
  /** reserveId.toString() — React key. */
  reserveId: string;
  symbol: string;
  name: string;
  icon: string;
  /** Pre-formatted display strings; the page owns all formatting. */
  aprLabel: string;
  availableLabel: string;
  utilizationLabel: string;
  /** 0–1. `null` when utilization is unavailable — hides the meter bar. */
  utilizationRatio: number | null;
  borrowedUsdLabel: string;
  borrowedTokenLabel: string;
  suppliedUsdLabel: string;
  suppliedTokenLabel: string;
}

const MARKET_COLUMN_CLASS = "w-[180px] shrink-0";
const DATA_COLUMN_CLASS = "min-w-0 flex-1";
const HEADER_TEXT_CLASS =
  "text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary";
const PRIMARY_VALUE_CLASS =
  "text-base leading-[1.5] tracking-[0.15px] text-accent-primary";
const SECONDARY_VALUE_CLASS =
  "text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary";

const MIN_UTILIZATION_RATIO = 0;
const MAX_UTILIZATION_RATIO = 1;
const UTILIZATION_PERCENT_MULTIPLIER = 100;

function clampUtilizationRatio(ratio: number): number {
  return Math.min(
    MAX_UTILIZATION_RATIO,
    Math.max(MIN_UTILIZATION_RATIO, ratio),
  );
}

export function BorrowMarketsTable({ rows }: { rows: BorrowMarketRow[] }) {
  const columns = COPY.marketData.borrowMarkets.columns;

  return (
    <div
      className="flex w-full flex-col gap-4 rounded-2xl border border-secondary-strokeLight bg-background-contrast p-6"
      data-testid="borrow-markets-table"
    >
      <div className="w-full overflow-x-auto">
        <div className="flex min-w-[900px] flex-col gap-4">
          <div className="flex items-center px-4">
            <div className={`${MARKET_COLUMN_CLASS} ${HEADER_TEXT_CLASS}`}>
              {columns.market}
            </div>
            <div className={`${DATA_COLUMN_CLASS} ${HEADER_TEXT_CLASS}`}>
              {columns.borrowApr}
            </div>
            <div className={`${DATA_COLUMN_CLASS} ${HEADER_TEXT_CLASS}`}>
              {columns.available}
            </div>
            <div className={`${DATA_COLUMN_CLASS} ${HEADER_TEXT_CLASS}`}>
              {columns.utilization}
            </div>
            <div className={`${DATA_COLUMN_CLASS} ${HEADER_TEXT_CLASS}`}>
              {columns.borrowed}
            </div>
            <div className={`${DATA_COLUMN_CLASS} ${HEADER_TEXT_CLASS}`}>
              {columns.supplied}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className={SECONDARY_VALUE_CLASS}>
              {COPY.marketData.borrowMarkets.empty}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <div
                  key={row.reserveId}
                  className="flex h-20 w-full items-center rounded-xl bg-background-secondary p-4"
                  data-testid={`borrow-market-row-${row.symbol}`}
                >
                  <div
                    className={`${MARKET_COLUMN_CLASS} flex items-center gap-2`}
                  >
                    <Avatar
                      url={row.icon}
                      alt={row.name}
                      size="medium"
                      variant="circular"
                      className="h-8 w-8 shrink-0 rounded-full bg-white"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className={PRIMARY_VALUE_CLASS}>{row.name}</span>
                      <span className={SECONDARY_VALUE_CLASS}>
                        {row.symbol}
                      </span>
                    </div>
                  </div>

                  <div className={DATA_COLUMN_CLASS}>
                    <span className={PRIMARY_VALUE_CLASS}>{row.aprLabel}</span>
                  </div>

                  <div className={DATA_COLUMN_CLASS}>
                    <span className={PRIMARY_VALUE_CLASS}>
                      {row.availableLabel}
                    </span>
                  </div>

                  <div className={`${DATA_COLUMN_CLASS} flex flex-col gap-3`}>
                    <span className={PRIMARY_VALUE_CLASS}>
                      {row.utilizationLabel}
                    </span>
                    {row.utilizationRatio === null ? null : (
                      <div
                        role="presentation"
                        className="h-1 w-20 overflow-hidden rounded-full bg-secondary-strokeLight dark:bg-secondary-strokeDark"
                      >
                        <div
                          className="h-full rounded-full bg-secondary-main"
                          style={{
                            width: `${clampUtilizationRatio(row.utilizationRatio) * UTILIZATION_PERCENT_MULTIPLIER}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className={`${DATA_COLUMN_CLASS} flex min-w-0 flex-col`}>
                    <span className={PRIMARY_VALUE_CLASS}>
                      {row.borrowedUsdLabel}
                    </span>
                    <span className={SECONDARY_VALUE_CLASS}>
                      {row.borrowedTokenLabel}
                    </span>
                  </div>

                  <div className={`${DATA_COLUMN_CLASS} flex min-w-0 flex-col`}>
                    <span className={PRIMARY_VALUE_CLASS}>
                      {row.suppliedUsdLabel}
                    </span>
                    <span className={SECONDARY_VALUE_CLASS}>
                      {row.suppliedTokenLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
