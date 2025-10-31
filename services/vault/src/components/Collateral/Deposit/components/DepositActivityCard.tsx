import { StatusBadge, VaultDetailCard } from "@babylonlabs-io/core-ui";

import type { VaultActivity } from "../../../../types/activity";
import { useDepositActivityCard } from "../hooks/useDepositActivityCard";
import type { PendingPeginRequest } from "../storage/peginStorage";

interface DepositActivityCardProps {
  activity: VaultActivity;
  connectedAddress?: string;
  btcPublicKey?: string;
  pendingPegins?: PendingPeginRequest[];
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPeginRequest["status"],
  ) => void;
  addPendingPegin?: (pegin: Omit<PendingPeginRequest, "timestamp">) => void;
  onRefetchActivities?: () => void;
  onShowSuccessModal?: () => void;
}

export function DepositActivityCard(props: DepositActivityCardProps) {
  const { activity } = props;

  const { actions, detailsData, peginState, handleAction } =
    useDepositActivityCard(props);

  const details = [
    {
      label: "Status",
      value: (
        <StatusBadge
          status={
            peginState.displayVariant as "active" | "inactive" | "pending"
          }
          label={peginState.displayLabel}
        />
      ),
    },
    {
      label: "Vault Provider",
      value: (
        <span className="text-sm text-accent-primary">
          {detailsData.vaultProviderName}
        </span>
      ),
    },
    // Add error messages
    ...detailsData.errorMessages.map((msg) => ({
      label: "Error",
      value: <span className="text-error text-sm">{msg}</span>,
    })),
    // Add info message if present
    ...(detailsData.infoMessage
      ? [
          {
            label: "Info",
            value: (
              <span className="text-sm text-accent-secondary">
                {detailsData.infoMessage}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <VaultDetailCard
      id={activity.id}
      title={{
        icons: [activity.collateral.icon || "/images/btc.png"],
        text: `${activity.collateral.amount} ${activity.collateral.symbol}`,
      }}
      details={details}
      actions={actions}
      onAction={handleAction}
    />
  );
}
