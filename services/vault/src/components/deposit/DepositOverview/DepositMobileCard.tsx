/**
 * DepositMobileCard Component
 *
 * Mobile-friendly card view for a single deposit.
 * Uses the centralized polling context for state.
 */

import { StatusBadge, VaultDetailCard } from "@babylonlabs-io/core-ui";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import {
  getPrimaryActionButton,
  PeginAction,
} from "../../../models/peginStateMachine";
import type { Deposit } from "../../../types/vault";

import { CopyableAddressCell } from "./DepositTableCells";

interface DepositMobileCardProps {
  deposit: Deposit;
  onSignClick: (depositId: string, transactions: any[]) => void;
  onBroadcastClick: (depositId: string) => void;
}

export function DepositMobileCard({
  deposit,
  onSignClick,
  onBroadcastClick,
}: DepositMobileCardProps) {
  const pollingResult = useDepositPollingResult(deposit.id);

  if (!pollingResult) return null;

  const { peginState, transactions } = pollingResult;
  const actionButton = getPrimaryActionButton(peginState);

  // Determine actions based on state machine
  const actions =
    actionButton?.action === PeginAction.SIGN_PAYOUT_TRANSACTIONS
      ? [{ name: "Sign", action: "sign" }]
      : actionButton?.action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN
        ? [{ name: "Sign & Broadcast", action: "broadcast" }]
        : undefined;

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
          label: "Vault",
          value: (
            <CopyableAddressCell address={deposit.vaultProvider.address} />
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
        }
      }}
    />
  );
}
