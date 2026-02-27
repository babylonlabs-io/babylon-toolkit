/**
 * LoansSection Component
 * Displays loan cards with repay buttons, and empty state
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";

import { Connect } from "@/components/Wallet";
import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface LoanAsset {
  symbol: string;
  amount: string;
  icon: string;
}

interface LoansSectionProps {
  hasLoans: boolean;
  hasCollateral: boolean;
  isConnected: boolean;
  borrowedAssets: LoanAsset[];
  onBorrow: () => void;
  onRepay: (symbol: string) => void;
  canAdd: boolean;
  onAdd: () => void;
}

export function LoansSection({
  hasLoans,
  hasCollateral,
  isConnected,
  borrowedAssets,
  onBorrow,
  onRepay,
  canAdd,
  onAdd,
}: LoansSectionProps) {
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">Loans</h2>
        <Button
          variant="outlined"
          color="primary"
          size="medium"
          onClick={onBorrow}
          className="rounded-full"
          disabled={!isConnected || !hasCollateral}
        >
          Borrow
        </Button>
      </div>

      {hasLoans ? (
        <div className="flex flex-col gap-4">
          {borrowedAssets.map((asset) => (
            <Card key={asset.symbol} variant="filled" className="w-full">
              <div className="space-y-4">
                {/* Token + Amount + Repay button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar url={asset.icon} alt={asset.symbol} size="small" />
                    <span className="text-base text-accent-primary">
                      {asset.amount} {asset.symbol}
                    </span>
                  </div>
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    onClick={() => onRepay(asset.symbol)}
                    className="rounded-full"
                  >
                    Repay Loan
                  </Button>
                </div>

                {/* Divider */}
                <div className="border-t border-primary-contrast/10 dark:border-[#333]" />

                {/* Borrow rate row */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-accent-secondary">
                    Borrow rate
                  </span>
                  <span className="text-sm text-accent-primary">&mdash;</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="filled" className="w-full">
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            {/* Overlapping token icons */}
            <div className="mb-2 flex items-center">
              <Avatar
                url="/images/btc.png"
                alt="BTC"
                size="xlarge"
                className="h-14 w-14"
              />
              <Avatar
                url="/images/usdc.png"
                alt="USDC"
                size="xlarge"
                className="-ml-4 h-14 w-14"
              />
              <Avatar
                url="/images/usdt.png"
                alt="USDT"
                size="xlarge"
                className="-ml-4 h-14 w-14"
              />
            </div>

            <p className="text-[20px] text-accent-primary">
              Borrow assets using your {btcConfig.coinSymbol}
            </p>
            <p className="text-[14px] text-accent-secondary">
              Add {btcConfig.coinSymbol} as collateral to start borrowing.
            </p>

            <div className="mt-8">
              {!isConnected ? (
                <Connect />
              ) : canAdd ? (
                <Button
                  variant="contained"
                  color="primary"
                  size="medium"
                  onClick={onAdd}
                  className="rounded-full !bg-white !text-black hover:!bg-gray-100"
                >
                  Add {btcConfig.coinSymbol}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
