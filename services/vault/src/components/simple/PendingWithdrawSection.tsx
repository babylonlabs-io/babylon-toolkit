/**
 * PendingWithdrawSection Component
 *
 * Displays the "Pending Withdraw" dashboard section with a summary card
 * that expands to show individual vault details (amount, status, provider, tx hash).
 * Follows the same pattern as PendingDepositSection.
 */

import { Avatar, Card } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import { ExpandMenuButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import type { PegoutPollingResult } from "@/hooks/usePegoutPolling";
import { formatBtcAmount } from "@/utils/formatting";

import { STATUS_DOT_COLORS } from "./statusColors";
import { VaultDetailCard, VaultStatusBadge } from "./VaultDetailCard";

const btcConfig = getNetworkConfigBTC();

interface PendingWithdrawSectionProps {
  pendingWithdrawVaults: RedeemedVaultInfo[];
  pegoutStatuses: Map<string, PegoutPollingResult>;
}

export function PendingWithdrawSection({
  pendingWithdrawVaults,
  pegoutStatuses,
}: PendingWithdrawSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (pendingWithdrawVaults.length === 0) return null;

  const totalBtc = pendingWithdrawVaults.reduce(
    (sum, v) => sum + v.amountBtc,
    0,
  );
  const count = pendingWithdrawVaults.length;

  return (
    <div className="w-full space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Pending Withdraw ({count})
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
          <ExpandMenuButton
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((prev) => !prev)}
            aria-label="Pending withdraw details"
          />
        </div>

        {/* Expanded: individual vault detail cards */}
        {isExpanded && (
          <div className="mt-4 max-h-[400px] space-y-3 overflow-y-auto">
            {pendingWithdrawVaults.map((vault) => {
              const pollingResult = pegoutStatuses.get(vault.id);
              const displayState = pollingResult?.displayState;
              const label = displayState?.label ?? "Checking...";
              const variant = displayState?.variant ?? "pending";
              const tooltip = displayState?.message;

              return (
                <VaultDetailCard
                  key={vault.id}
                  amountBtc={vault.amountBtc}
                  timestamp={vault.createdAt}
                  txHash={vault.id}
                  providerName={vault.providerName}
                  providerIconUrl={vault.providerIconUrl}
                  providerVerified={vault.providerVerified}
                  statusContent={
                    <VaultStatusBadge
                      dotColor={STATUS_DOT_COLORS[variant]}
                      label={label}
                      tooltip={tooltip}
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
