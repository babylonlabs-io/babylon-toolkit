/**
 * LoansSection Component
 * Displays loan information with borrow/repay buttons and empty/active states.
 * Each borrowed asset renders as its own expandable summary card, matching
 * the visual pattern used by PendingDeposits / Collateral.
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { ExpandMenuButton } from "@/components/shared";
import {
  CARD_DARK_BG_CLASS,
  SUMMARY_CARD_CLASS,
} from "@/components/shared/layoutClasses";
import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";

const btcConfig = getNetworkConfigBTC();

interface LoanAsset {
  symbol: string;
  amount: string;
  icon: string;
  /** Optional APR string (e.g. "5.861%"). When omitted, the row is hidden. */
  borrowRate?: string;
}

interface LoansSectionProps {
  hasLoans: boolean;
  hasCollateral: boolean;
  isConnected: boolean;
  borrowedAssets: LoanAsset[];
  onBorrow: () => void;
  onRepay: () => void;
}

export function LoansSection({
  hasLoans,
  hasCollateral,
  isConnected,
  borrowedAssets,
  onBorrow,
  onRepay,
}: LoansSectionProps) {
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleExpanded = (symbol: string) => {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          {COPY.loans.heading}
        </h2>
        <div className="flex gap-3">
          <Button
            variant="outlined"
            color="primary"
            size="large"
            onClick={onBorrow}
            className="rounded-full"
            disabled={!isConnected || !hasCollateral}
          >
            {COPY.loans.borrowButton}
          </Button>
          {hasLoans && (
            <Button
              variant="outlined"
              color="primary"
              size="large"
              onClick={onRepay}
              className="rounded-full"
              disabled={!isConnected}
            >
              {COPY.loans.repayButton}
            </Button>
          )}
        </div>
      </div>

      {hasLoans ? (
        <div className="space-y-4">
          {borrowedAssets.map((asset) => {
            const isExpanded = expandedSymbols.has(asset.symbol);
            return (
              <Card
                key={asset.symbol}
                variant="filled"
                className={`${SUMMARY_CARD_CLASS} ${CARD_DARK_BG_CLASS}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Avatar url={asset.icon} alt={asset.symbol} size="medium" />
                    <span className="text-xl text-accent-primary">
                      {asset.amount} {asset.symbol}
                    </span>
                  </div>
                  {asset.borrowRate && (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <ExpandMenuButton
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpanded(asset.symbol)}
                        aria-label={COPY.loans.detailsAriaLabel(asset.symbol)}
                      />
                    </div>
                  )}
                </div>

                {isExpanded && asset.borrowRate && (
                  <div className="mt-4 border-t border-secondary-strokeLight pt-4 dark:border-secondary-strokeDark">
                    <div className="flex items-center justify-between">
                      <span className="text-base text-accent-secondary">
                        {COPY.loans.borrowRateLabel}
                      </span>
                      <span className="text-base text-accent-primary">
                        {asset.borrowRate}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card variant="filled" className="w-full border-0">
          <div className="flex flex-col items-center justify-center gap-2 py-4">
            {/* Overlapping token icons */}
            <div className="mb-4 flex items-center">
              <Avatar
                url="/images/btc.png"
                alt="BTC"
                size="xlarge"
                className="h-14 w-14"
              />
              <Avatar
                url="/images/usdc.svg"
                alt="USDC"
                size="xlarge"
                className="-ml-4 h-14 w-14"
              />
              <Avatar
                url="/images/usdt.svg"
                alt="USDT"
                size="xlarge"
                className="-ml-4 h-14 w-14"
              />
            </div>

            <p className="text-[20px] text-accent-primary">
              {COPY.loans.empty.title(btcConfig.coinSymbol)}
            </p>
            <p className="text-[16px] text-accent-secondary">
              {COPY.loans.empty.body(btcConfig.coinSymbol)}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
