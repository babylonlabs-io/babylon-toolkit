/**
 * LoansSection Component
 * Displays loan information with borrow/repay buttons and empty/active states
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";

import {
  formatHealthFactor,
  getHealthFactorColor,
  type HealthFactorStatus,
} from "@/applications/aave/utils";
import { HeartIcon } from "@/components/shared";
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
  healthFactor: number | null;
  healthFactorStatus: HealthFactorStatus;
  onBorrow: () => void;
  onRepay: () => void;
}

export function LoansSection({
  hasLoans,
  hasCollateral,
  isConnected,
  borrowedAssets,
  healthFactor,
  healthFactorStatus,
  onBorrow,
  onRepay,
}: LoansSectionProps) {
  const healthFactorFormatted = formatHealthFactor(healthFactor);
  const healthFactorColor = getHealthFactorColor(healthFactorStatus);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">Loans</h2>
        <div className="flex gap-3">
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
          {hasLoans && (
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              onClick={onRepay}
              className="rounded-full"
              disabled={!isConnected}
            >
              Repay
            </Button>
          )}
        </div>
      </div>

      <Card variant="filled" className="w-full">
        {hasLoans ? (
          <div className="space-y-4">
            {borrowedAssets.map((asset) => (
              <div
                key={asset.symbol}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-accent-secondary">Borrowed</span>
                <div className="flex items-center gap-2">
                  <Avatar url={asset.icon} alt={asset.symbol} size="small" />
                  <span className="text-base text-accent-primary">
                    {asset.amount} {asset.symbol}
                  </span>
                </div>
              </div>
            ))}

            {/* Health Factor Row */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-accent-secondary">
                Health Factor
              </span>
              <span className="flex items-center gap-2 text-base text-accent-primary">
                <HeartIcon color={healthFactorColor} />
                {healthFactorFormatted}
              </span>
            </div>
          </div>
        ) : (
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
              Deposit {btcConfig.coinSymbol} as collateral to start borrowing.
            </p>

            <div className="mt-8">{!isConnected ? <Connect /> : null}</div>
          </div>
        )}
      </Card>
    </div>
  );
}
