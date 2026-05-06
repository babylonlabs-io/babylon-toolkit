/**
 * LoansSection Component
 * Displays loan information with borrow/repay buttons and empty/active states
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
  /** Block borrow/repay and show a banner; the borrowed-assets list is incomplete. */
  debtDiscoveryFailed: boolean;
  onBorrow: () => void;
  onRepay: () => void;
}

export function LoansSection({
  hasLoans,
  hasCollateral,
  isConnected,
  borrowedAssets,
  debtDiscoveryFailed,
  onBorrow,
  onRepay,
}: LoansSectionProps) {
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
            disabled={!isConnected || !hasCollateral || debtDiscoveryFailed}
          >
            Borrow
          </Button>
          {(hasLoans || debtDiscoveryFailed) && (
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              onClick={onRepay}
              className="rounded-full"
              disabled={!isConnected || debtDiscoveryFailed}
            >
              Repay
            </Button>
          )}
        </div>
      </div>

      <Card variant="filled" className="w-full">
        {debtDiscoveryFailed ? (
          <div className="rounded-md border border-error-main/40 bg-error-main/10 p-4 text-error-main">
            Cannot determine your full debt right now. Borrowing and repayment
            are temporarily unavailable. Please try again.
          </div>
        ) : hasLoans ? (
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
