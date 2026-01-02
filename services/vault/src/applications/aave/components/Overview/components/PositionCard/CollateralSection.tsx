/**
 * CollateralSection Component
 * Displays collateral information with Add/Withdraw buttons
 */

import { Avatar, Button, SubSection } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { useConnection } from "@/context/wallet";

const btcConfig = getNetworkConfigBTC();

export interface CollateralSectionProps {
  amount?: string;
  usdValue?: string;
  hasCollateral?: boolean;
  hasAvailableVaults?: boolean;
  onAdd: () => void;
  onWithdraw: () => void;
}

export function CollateralSection({
  amount,
  usdValue,
  hasCollateral = false,
  hasAvailableVaults = false,
  onAdd,
  onWithdraw,
}: CollateralSectionProps) {
  const { isConnected } = useConnection();
  return (
    <div className="w-full space-y-6">
      {/* Header with buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Collateral
        </h2>
        {hasCollateral ? (
          <div className="flex gap-3">
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              onClick={onAdd}
              disabled={!isConnected || !hasAvailableVaults}
              className="rounded-full"
            >
              Add
            </Button>
            <Button
              variant="outlined"
              color="primary"
              size="medium"
              onClick={onWithdraw}
              className="rounded-full"
            >
              Withdraw
            </Button>
          </div>
        ) : (
          <Button
            variant="outlined"
            color="primary"
            size="medium"
            onClick={onAdd}
            disabled={!isConnected || !hasAvailableVaults}
            className="rounded-full"
          >
            Add
          </Button>
        )}
      </div>

      {/* Content - either collateral info or empty state */}
      {hasCollateral ? (
        <SubSection className="w-full">
          <div className="space-y-4">
            {/* Asset Row */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-accent-secondary">Asset</span>
              <div className="flex items-center gap-2">
                <Avatar
                  url={btcConfig.icon}
                  alt={btcConfig.coinSymbol}
                  size="small"
                />
                <span className="text-base text-accent-primary">
                  {btcConfig.coinSymbol}
                </span>
              </div>
            </div>

            {/* Deposited Row */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-accent-secondary">Deposited</span>
              <span className="text-base text-accent-primary">
                {amount}{" "}
                <span className="text-accent-secondary">{usdValue}</span>
              </span>
            </div>
          </div>
        </SubSection>
      ) : (
        <SubSection className="w-full py-10">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-base text-accent-primary">
              No collateral available.
            </p>
            <p className="text-sm text-accent-secondary">
              Add {btcConfig.coinSymbol} to enable collateral.
            </p>
          </div>
        </SubSection>
      )}
    </div>
  );
}
