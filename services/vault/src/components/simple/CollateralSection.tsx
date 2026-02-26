/**
 * CollateralSection Component
 * Displays collateral with an expandable view showing individual peg-in vaults.
 */

import { Avatar, Card, Loader } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

import { DepositButton, MenuButton } from "@/components/shared";
import { Connect } from "@/components/Wallet";
import { getNetworkConfigBTC } from "@/config";
import type { CollateralVaultEntry } from "@/types/collateral";

import { CollateralExpandedContent } from "./CollateralExpandedContent";

const btcConfig = getNetworkConfigBTC();

interface CollateralSectionProps {
  totalAmountBtc: string;
  collateralVaults: CollateralVaultEntry[];
  hasCollateral: boolean;
  isConnected: boolean;
  hasDebt: boolean;
  isPendingWithdraw: boolean;
  onWithdraw: () => void;
  onDeposit: () => void;
}

export function CollateralSection({
  totalAmountBtc,
  collateralVaults,
  hasCollateral,
  isConnected,
  hasDebt,
  isPendingWithdraw,
  onWithdraw,
  onDeposit,
}: CollateralSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleWithdraw = useCallback(() => {
    onWithdraw();
  }, [onWithdraw]);

  const canWithdraw = !hasDebt;

  return (
    <div className="w-full space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Collateral
        </h2>
        <div className="flex items-center gap-2">
          <DepositButton
            variant="outlined"
            size="medium"
            onClick={onDeposit}
            disabled={!isConnected || isPendingWithdraw}
            className="rounded-full"
          >
            Deposit
          </DepositButton>
        </div>
      </div>

      {isPendingWithdraw ? (
        <Card variant="filled" className="w-full">
          <div className="flex items-center gap-3 py-4">
            <Loader size={20} />
            <span className="text-base text-accent-primary">
              Pending Withdrawal
            </span>
          </div>
        </Card>
      ) : hasCollateral ? (
        <Card variant="filled" className="w-full">
          {/* Summary row: BTC icon + total amount + three-dots toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar
                url={btcConfig.icon}
                alt={btcConfig.coinSymbol}
                size="small"
              />
              <span className="text-base text-accent-primary">
                {totalAmountBtc}
              </span>
            </div>
            <MenuButton
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-label="Toggle vault details"
            />
          </div>

          {/* Expanded vault list */}
          {isExpanded && (
            <CollateralExpandedContent
              vaults={collateralVaults}
              onWithdraw={handleWithdraw}
              canWithdraw={canWithdraw}
            />
          )}
        </Card>
      ) : (
        <Card variant="filled" className="w-full">
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="xlarge"
              className="mb-2 h-[100px] w-[100px]"
            />
            <p className="text-[20px] text-accent-primary">
              Deposit Bitcoin to get started
            </p>
            <p className="text-[16px] text-accent-secondary">
              Add {btcConfig.coinSymbol} as collateral so you can begin
              borrowing assets.
            </p>
            <div className="mt-8">
              {!isConnected ? (
                <Connect />
              ) : (
                <DepositButton
                  variant="outlined"
                  size="medium"
                  onClick={onDeposit}
                  disabled={isPendingWithdraw}
                  className="rounded-full"
                >
                  Deposit {btcConfig.coinSymbol}
                </DepositButton>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
