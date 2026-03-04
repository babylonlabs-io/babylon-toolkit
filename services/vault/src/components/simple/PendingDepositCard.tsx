/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit card with BTC amount and an action button.
 * Uses the PeginPollingContext to resolve the deposit's current state and
 * available actions (sign / broadcast).
 *
 * Must be rendered inside a PeginPollingProvider.
 */

import { Avatar, Card, Chip, ChipButton, Hint } from "@babylonlabs-io/core-ui";

import type {
  ClaimerTransactions,
  DepositorGraphTransactions,
} from "@/clients/vault-provider-rpc/types";
import {
  getActionStatus,
  getWarningMessages,
  PeginAction,
} from "@/components/deposit/DepositOverview/actionStatus";
import { getNetworkConfigBTC } from "@/config";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";

const btcConfig = getNetworkConfigBTC();

interface PendingDepositCardProps {
  depositId: string;
  amount: string;
  onSignClick: (
    depositId: string,
    transactions: ClaimerTransactions[],
    depositorGraph: DepositorGraphTransactions,
  ) => void;
  onBroadcastClick: (depositId: string) => void;
  onLamportKeyClick: (depositId: string) => void;
}

export function PendingDepositCard({
  depositId,
  amount,
  onSignClick,
  onBroadcastClick,
  onLamportKeyClick,
}: PendingDepositCardProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { loading, transactions, depositorGraph, peginState } = pollingResult;
  const status = getActionStatus(pollingResult);
  const warnings = getWarningMessages(pollingResult);
  const isDisabled = warnings.length > 0;

  const isActionable = status.type === "available";
  const displayLabel = peginState.displayLabel;

  const handleClick = () => {
    if (status.type !== "available") return;

    const { action } = status.action;
    if (action === PeginAction.SUBMIT_LAMPORT_KEY) {
      onLamportKeyClick(depositId);
    } else if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
      if (transactions && depositorGraph) {
        onSignClick(depositId, transactions, depositorGraph);
      }
    } else if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
      onBroadcastClick(depositId);
    }
  };

  const label = loading && !transactions ? "Loading..." : displayLabel;
  const buttonDisabled = !isActionable || (loading && !transactions);

  const statusPill = isActionable ? (
    <ChipButton disabled={buttonDisabled} onClick={handleClick}>
      {label}
    </ChipButton>
  ) : (
    <Chip className="cursor-default rounded-full !bg-white !text-black">
      {label}
    </Chip>
  );

  const rightContent = statusPill;

  return (
    <Card
      variant="filled"
      className={`w-full ${isDisabled ? "opacity-50" : ""}`.trim()}
    >
      <div className="flex items-center gap-4">
        <div className="flex flex-1 items-center gap-2">
          <Avatar
            url={btcConfig.icon}
            alt={btcConfig.coinSymbol}
            size="small"
            variant="circular"
          />
          <span className="text-[18px] text-accent-primary/50">
            {amount} {btcConfig.coinSymbol}
          </span>
        </div>

        {peginState.message ? (
          <Hint tooltip={peginState.message} attachToChildren>
            {rightContent}
          </Hint>
        ) : (
          rightContent
        )}
      </div>
    </Card>
  );
}
