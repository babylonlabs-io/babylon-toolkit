/**
 * ExpiredDepositSection Component
 *
 * Renders refundable expired deposits as a sibling block below
 * PendingDepositSection. Mirrors the pending block layout (header with count,
 * summary card with total + expand toggle, expanded list of sub-cards) and
 * reuses PendingDepositCard for each row so the refund action stays consistent.
 *
 * Must be rendered inside a PeginPollingProvider so PendingDepositCard can
 * resolve its polling result.
 */

import { Avatar, Card } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { ExpandMenuButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";
import { formatBtcAmount } from "@/utils/formatting";

import { PendingDepositCard } from "./PendingDepositCard";

const btcConfig = getNetworkConfigBTC();

interface ExpiredDepositSectionProps {
  expiredActivities: VaultActivity[];
  vaultProviders: VaultProvider[];
  onSignClick: (depositId: string) => void;
  onBroadcastClick: (depositId: string) => void;
  onWotsKeyClick: (depositId: string) => void;
  onActivationClick: (depositId: string) => void;
  onRefundClick: (depositId: string) => void;
  onArtifactDownloadClick?: (depositId: string) => void;
}

export function ExpiredDepositSection({
  expiredActivities,
  vaultProviders,
  onSignClick,
  onBroadcastClick,
  onWotsKeyClick,
  onActivationClick,
  onRefundClick,
  onArtifactDownloadClick,
}: ExpiredDepositSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalBtcAmount = useMemo(
    () =>
      expiredActivities.reduce(
        (sum, a) => sum + parseFloat(a.collateral.amount || "0"),
        0,
      ),
    [expiredActivities],
  );

  if (expiredActivities.length === 0) return null;

  const count = expiredActivities.length;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-[24px] font-normal text-accent-primary">
          Expired Deposits ({count})
        </h2>
      </div>

      <Card variant="filled" className="w-full">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="small"
            />
            <span className="text-base text-accent-primary">
              {formatBtcAmount(totalBtcAmount)}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <ExpandMenuButton
              isExpanded={isExpanded}
              onToggle={() => setIsExpanded((prev) => !prev)}
              aria-label="Expired deposit details"
            />
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 max-h-[400px] space-y-3 overflow-y-auto">
            {expiredActivities.map((activity) => (
              <PendingDepositCard
                key={activity.id}
                depositId={activity.id}
                amount={activity.collateral.amount}
                timestamp={activity.timestamp}
                txHash={activity.peginTxHash}
                providerId={activity.providers[0].id}
                vaultProviders={vaultProviders}
                onSignClick={onSignClick}
                onBroadcastClick={onBroadcastClick}
                onWotsKeyClick={onWotsKeyClick}
                onActivationClick={onActivationClick}
                onRefundClick={onRefundClick}
                onArtifactDownloadClick={onArtifactDownloadClick}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
