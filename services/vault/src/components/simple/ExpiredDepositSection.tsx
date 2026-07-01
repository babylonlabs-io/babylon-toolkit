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

import { Avatar, Card, Heading } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { ExpandablePanel, ExpandMenuButton } from "@/components/shared";
import { SUMMARY_CARD_CLASS } from "@/components/shared/layoutClasses";
import { getNetworkConfigBTC } from "@/config";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";
import { formatBtcAmount } from "@/utils/formatting";

import { PendingDepositCard } from "./PendingDepositCard";

const btcConfig = getNetworkConfigBTC();

interface ExpiredDepositSectionProps {
  expiredActivities: VaultActivity[];
  vaultProviders: VaultProvider[];
  /** Invoked when an expired card is clicked — opens the refund modal. */
  onRefundClick: (depositId: string) => void;
}

export function ExpiredDepositSection({
  expiredActivities,
  vaultProviders,
  onRefundClick,
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
        <Heading
          variant="h5"
          as="h2"
          className="font-normal text-accent-primary"
        >
          Expired Deposits ({count})
        </Heading>
      </div>

      <Card variant="filled" className={SUMMARY_CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar
              url={btcConfig.icon}
              alt={btcConfig.coinSymbol}
              size="medium"
            />
            <span className="text-xl text-accent-primary">
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

        <ExpandablePanel expanded={isExpanded}>
          <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto">
            {expiredActivities.map((activity) => (
              <PendingDepositCard
                key={activity.id}
                depositId={activity.id}
                amount={activity.collateral.amount}
                timestamp={activity.timestamp}
                peginTxHash={activity.peginTxHash}
                prePeginTxHash={activity.prePeginTxHash}
                providerId={activity.providers[0].id}
                vaultProviders={vaultProviders}
                onCardClick={onRefundClick}
              />
            ))}
          </div>
        </ExpandablePanel>
      </Card>
    </div>
  );
}
