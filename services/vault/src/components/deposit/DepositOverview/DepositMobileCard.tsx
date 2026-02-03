/**
 * DepositMobileCard Component
 *
 * Mobile-friendly card view for a single deposit.
 * Uses the centralized polling context for state.
 */

import { Hint, StatusBadge, VaultDetailCard } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

import { useDepositPollingResult } from "../../../context/deposit/PeginPollingContext";
import { getPrimaryActionButton } from "../../../models/peginStateMachine";
import type { Deposit } from "../../../types/vault";
import { formatTimeAgo } from "../../../utils/formatting";
import {
  UTXO_UNAVAILABLE_WARNING,
  WALLET_OWNERSHIP_WARNING,
} from "../../../utils/vaultWarnings";

import { ActionWarningIndicator } from "./ActionWarningIndicator";
import { CopyableAddressCell, getCardActions } from "./DepositTableCells";

const btcConfig = getNetworkConfigBTC();

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

  const {
    peginState,
    transactions,
    isOwnedByCurrentWallet,
    error,
    utxoUnavailable,
  } = pollingResult;
  const actionButton = getPrimaryActionButton(peginState);

  // Only show actions if the vault is owned by the connected wallet and UTXO is available
  const actions =
    isOwnedByCurrentWallet && !utxoUnavailable
      ? getCardActions(actionButton)
      : undefined;

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
              <ActionWarningIndicator
                messages={[
                  ...(error ? [error.message] : []),
                  ...(!isOwnedByCurrentWallet
                    ? [WALLET_OWNERSHIP_WARNING]
                    : []),
                  ...(utxoUnavailable ? [UTXO_UNAVAILABLE_WARNING] : []),
                ]}
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

  // Apply disabled styling if vault is not owned by connected wallet or UTXO unavailable
  if (!isOwnedByCurrentWallet || utxoUnavailable) {
    return <div className="opacity-50">{card}</div>;
  }

  return card;
}
