/**
 * DepositMobileCard Component
 *
 * Mobile-friendly card view for a single deposit.
 * Uses the centralized polling context for state.
 */

import { Hint, StatusBadge, VaultDetailCard } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import type { Deposit } from "../../../types/vault";
import { formatTimeAgo } from "../../../utils/formatting";

import { getActionStatus, getWarningMessages } from "./actionStatus";
import { ActionWarningIndicator } from "./ActionWarningIndicator";
import { CopyableAddressCell, getCardActions } from "./DepositTableCells";

const btcConfig = getNetworkConfigBTC();

interface DepositMobileCardProps {
  deposit: Deposit;
  onSignClick: (depositId: string, transactions: unknown[]) => void;
  onBroadcastClick: (depositId: string) => void;
  onRedeemClick: (depositId: string) => void;
  onLamportKeyClick?: (depositId: string) => void;
}

export function DepositMobileCard({
  deposit,
  onSignClick,
  onBroadcastClick,
  onRedeemClick,
  onLamportKeyClick,
}: DepositMobileCardProps) {
  const pollingResult = useDepositPollingResult(deposit.id);

  if (!pollingResult) return null;

  const { peginState, transactions } = pollingResult;
  const status = getActionStatus(pollingResult);
  const warnings = getWarningMessages(pollingResult);

  // Only show actions if available
  const actions =
    status.type === "available" ? getCardActions(status.action) : undefined;
  // Disabled styling when there are blocking warnings (not just when no action)
  const disabled = warnings.length > 0;

  const card = (
    <VaultDetailCard
      key={deposit.id}
      id={deposit.id}
      title={{
        icons: [btcConfig.icon],
        text: `${deposit.amount} ${btcConfig.coinSymbol}`,
      }}
      details={[
        {
          label: "Peg-In Tx",
          value: <CopyableAddressCell address={deposit.pegInTxHash} />,
        },
        {
          label: "Application",
          value: (
            <span className="text-sm text-accent-primary">
              {deposit.appName || "Unknown"}
            </span>
          ),
        },
        {
          label: "Time",
          value: (
            <span className="text-sm text-accent-secondary">
              {deposit.timestamp ? formatTimeAgo(deposit.timestamp) : "-"}
            </span>
          ),
        },
        {
          label: "Status",
          value: (
            <div className="flex items-center gap-1.5">
              <Hint tooltip={peginState.message} attachToChildren>
                <StatusBadge
                  status={peginState.displayVariant}
                  label={peginState.displayLabel}
                />
              </Hint>
              <ActionWarningIndicator messages={warnings} />
            </div>
          ),
        },
      ]}
      actions={actions}
      onAction={(id, action) => {
        if (action === "lamport_key") {
          onLamportKeyClick?.(id);
        } else if (action === "sign" && transactions) {
          onSignClick(id, transactions);
        } else if (action === "broadcast") {
          onBroadcastClick(id);
        } else if (action === "redeem") {
          onRedeemClick(id);
        }
      }}
    />
  );

  // Apply disabled styling if deposit is disabled
  if (disabled) {
    return <div className="opacity-50">{card}</div>;
  }

  return card;
}
