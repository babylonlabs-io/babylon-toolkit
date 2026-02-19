/**
 * CollateralSection Component
 * Displays collateral information with deposit button and empty/active states
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";

import { Connect } from "@/components/Wallet";
import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface CollateralAsset {
  symbol: string;
  icon: string;
  amount: string;
  usdValue: string;
}

interface CollateralSectionProps {
  hasCollateral: boolean;
  isConnected: boolean;
  collateralAsset?: CollateralAsset;
  onDeposit: () => void;
}

export function CollateralSection({
  hasCollateral,
  isConnected,
  collateralAsset,
  onDeposit,
}: CollateralSectionProps) {
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Collateral
        </h2>
        <Button
          variant="outlined"
          color="primary"
          size="medium"
          onClick={onDeposit}
          disabled={!isConnected}
          className="rounded-full"
        >
          Deposit
        </Button>
      </div>

      <Card variant="filled" className="w-full">
        {hasCollateral && collateralAsset ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-accent-secondary">Asset</span>
              <div className="flex items-center gap-2">
                <Avatar
                  url={collateralAsset.icon}
                  alt={collateralAsset.symbol}
                  size="small"
                />
                <span className="text-base text-accent-primary">
                  {collateralAsset.symbol}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-accent-secondary">Deposited</span>
              <span className="text-base text-accent-primary">
                {collateralAsset.amount}{" "}
                <span className="text-accent-secondary">
                  {collateralAsset.usdValue}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="xlarge"
              className="mb-2 h-[100px] w-[100px]"
            />
            <p className="text-[20px] text-accent-primary">
              Deposit {btcConfig.coinSymbol} to get started
            </p>
            <p className="text-[14px] text-accent-secondary">
              Add {btcConfig.coinSymbol} as collateral so you can begin
              borrowing assets.
            </p>
            <div className="mt-8">
              {isConnected ? (
                <Button
                  variant="contained"
                  color="primary"
                  size="medium"
                  onClick={onDeposit}
                  className="rounded-full !bg-white !text-black hover:!bg-gray-100"
                >
                  Deposit {btcConfig.coinSymbol}
                </Button>
              ) : (
                <Connect />
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
