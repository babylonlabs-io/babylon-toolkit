/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit card with BTC amount and an action button.
 * Uses the PeginPollingContext to resolve the deposit's current state and
 * available actions (sign / broadcast).
 *
 * Must be rendered inside a PeginPollingProvider.
 */

import { Avatar, Button, Card, Hint } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import type {
  ClaimerTransactions,
  DepositorGraphTransactions,
} from "@/clients/vault-provider-rpc/types";
import {
  getActionStatus,
  getWarningMessages,
  PeginAction,
} from "@/components/deposit/DepositOverview/actionStatus";
import { MenuButton } from "@/components/shared";
import { getNetworkConfigBTC } from "@/config";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";

import { PendingDepositExpandedContent } from "./PendingDepositExpandedContent";

const btcConfig = getNetworkConfigBTC();

interface PendingDepositCardProps {
  depositId: string;
  amount: string;
  timestamp?: number;
  txHash: string;
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
  timestamp,
  txHash,
  onSignClick,
  onBroadcastClick,
  onLamportKeyClick,
}: PendingDepositCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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

  const button = (
    <Button
      variant="contained"
      size="small"
      className="rounded-full !bg-white !text-black hover:!bg-gray-100"
      disabled={!isActionable || (loading && !transactions)}
      onClick={handleClick}
    >
      {loading && !transactions ? "Loading..." : displayLabel}
    </Button>
  );

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

        <div className="flex items-center gap-2">
          {peginState.message ? (
            <Hint tooltip={peginState.message} attachToChildren>
              {button}
            </Hint>
          ) : (
            button
          )}
          <MenuButton
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label="Toggle deposit details"
          />
        </div>
      </div>

      {isExpanded && (
        <PendingDepositExpandedContent
          statusLabel={peginState.displayLabel}
          statusVariant={peginState.displayVariant}
          timestamp={timestamp}
          txHash={txHash}
        />
      )}
    </Card>
  );
}
