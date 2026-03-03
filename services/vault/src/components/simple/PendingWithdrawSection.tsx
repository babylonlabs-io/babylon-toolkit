/**
 * PendingWithdrawSection Component
 *
 * Displays the "Pending Withdraw" dashboard section with a summary card
 * that expands to show individual vault amounts. Follows the same
 * summary + expand pattern as CollateralSection.
 */

import { Avatar, Card, Menu, MenuItem } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { MenuButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { formatBtcAmount } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

export interface PendingWithdrawVault {
  id: string;
  amountBtc: number;
}

interface PendingWithdrawSectionProps {
  pendingWithdrawVaults: PendingWithdrawVault[];
}

export function PendingWithdrawSection({
  pendingWithdrawVaults,
}: PendingWithdrawSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (pendingWithdrawVaults.length === 0) return null;

  const totalBtc = pendingWithdrawVaults.reduce(
    (sum, v) => sum + v.amountBtc,
    0,
  );

  return (
    <div className="w-full space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Pending Withdraw
        </h2>
        <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
      </div>

      {/* Summary card with expand */}
      <Card variant="filled" className="w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="small"
            />
            <span className="text-base text-accent-primary">
              {formatBtcAmount(totalBtc)}
            </span>
          </div>
          <Menu
            trigger={<MenuButton aria-label="Pending withdraw options" />}
            className="!min-w-0"
          >
            <MenuItem
              name={isExpanded ? "Collapse" : "Expand"}
              onClick={() => setIsExpanded((prev) => !prev)}
              className="!p-4"
            />
          </Menu>
        </div>

        {/* Expanded: individual vault amounts */}
        {isExpanded && (
          <div className="mt-4 flex flex-col gap-2 border-t border-accent-primary/10 pt-4">
            {pendingWithdrawVaults.map((vault) => (
              <div key={vault.id} className="flex items-center gap-2">
                <Avatar
                  url={btcConfig.icon}
                  alt={btcConfig.coinSymbol}
                  size="small"
                />
                <span className="text-sm text-accent-secondary">
                  {formatBtcAmount(vault.amountBtc)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
