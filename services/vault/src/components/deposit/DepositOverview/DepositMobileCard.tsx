/**
 * DepositMobileCard Component
 *
 * Mobile-friendly card view for a single deposit.
 * Uses the centralized polling context for state.
 */

import { StatusBadge, VaultDetailCard } from "@babylonlabs-io/core-ui";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import { getPrimaryActionButton } from "../../../models/peginStateMachine";
import type { Deposit } from "../../../types/vault";

import { CopyableAddressCell, getCardActions } from "./DepositTableCells";

interface DepositMobileCardProps {
  deposit: Deposit;
  onSignClick: (depositId: string, transactions: any[]) => void;
  onBroadcastClick: (depositId: string) => void;
  onRedeemClick: (depositId: string) => void;
}

export function DepositMobileCard({
  deposit,
  onSignClick,
  onBroadcastClick,
  onRedeemClick,
}: DepositMobileCardProps) {
  const pollingResult = useDepositPollingResult(deposit.id);

  if (!pollingResult) return null;

  const { peginState, transactions } = pollingResult;
  const actionButton = getPrimaryActionButton(peginState);
  const actions = getCardActions(actionButton);

  return (
    <VaultDetailCard
      key={deposit.id}
      id={deposit.id}
      title={{
        icons: ["/images/btc.png"],
        text: `${deposit.amount} BTC`,
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
          label: "Status",
          value: (
            <div title={peginState.message || ""} className="cursor-help">
              <StatusBadge
                status={peginState.displayVariant}
                label={peginState.displayLabel}
              />
            </div>
          ),
        },
      ]}
      actions={actions}
      onAction={(id, action) => {
        if (action === "sign" && transactions) {
          onSignClick(id, transactions);
        } else if (action === "broadcast") {
          onBroadcastClick(id);
        } else if (action === "redeem") {
          onRedeemClick(id);
        }
      }}
    />
  );
}
