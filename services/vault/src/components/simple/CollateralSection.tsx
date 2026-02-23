/**
 * CollateralSection Component
 * Displays collateral with an expandable view showing individual peg-in vaults.
 * Users can select vaults and trigger withdrawal.
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";
import { useCallback, useState } from "react";

import { MenuButton } from "@/components/shared";
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
  onDeposit: () => void;
  onWithdraw: () => void;
}

export function CollateralSection({
  totalAmountBtc,
  collateralVaults,
  hasCollateral,
  isConnected,
  hasDebt,
  onDeposit,
  onWithdraw,
}: CollateralSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedVaultIds, setSelectedVaultIds] = useState<Set<string>>(
    new Set(),
  );

  const handleToggleVault = useCallback((vaultId: string) => {
    setSelectedVaultIds((prev) => {
      const next = new Set(prev);
      if (next.has(vaultId)) {
        next.delete(vaultId);
      } else {
        next.add(vaultId);
      }
      return next;
    });
  }, []);

  const handleWithdraw = useCallback(() => {
    onWithdraw();
  }, [onWithdraw]);

  const canWithdraw = !hasDebt && selectedVaultIds.size > 0;

  return (
    <div className="w-full space-y-6">
      {/* Header row */}
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

      {hasCollateral ? (
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
              selectedVaultIds={selectedVaultIds}
              onToggleVault={handleToggleVault}
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
        </Card>
      )}
    </div>
  );
}
