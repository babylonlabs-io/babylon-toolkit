/**
 * PendingDepositCard Component
 *
 * Renders a single pending deposit card with BTC amount and an action button.
 * Uses the PeginPollingContext to resolve the deposit's current state and
 * available actions (sign / broadcast).
 *
 * Must be rendered inside a PeginPollingProvider.
 */

import { Avatar, Button, Card } from "@babylonlabs-io/core-ui";

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
  onSignClick: (depositId: string, transactions: unknown[]) => void;
  onBroadcastClick: (depositId: string) => void;
}

export function PendingDepositCard({
  depositId,
  amount,
  onSignClick,
  onBroadcastClick,
}: PendingDepositCardProps) {
  const pollingResult = useDepositPollingResult(depositId);

  if (!pollingResult) return null;

  const { loading, transactions, peginState } = pollingResult;
  const status = getActionStatus(pollingResult);
  const warnings = getWarningMessages(pollingResult);
  const isDisabled = warnings.length > 0;

  const isActionable = status.type === "available";
  const displayLabel = peginState.displayLabel;

  const handleClick = () => {
    if (status.type !== "available") return;

    const { action } = status.action;
    if (action === PeginAction.SIGN_PAYOUT_TRANSACTIONS) {
      onSignClick(depositId, transactions || []);
    } else if (action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN) {
      onBroadcastClick(depositId);
    }
  };

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

        <Button
          variant="contained"
          size="small"
          className="rounded-full !bg-white !text-black hover:!bg-gray-100"
          disabled={!isActionable || (loading && !transactions)}
          onClick={handleClick}
        >
          {loading && !transactions ? "Loading..." : displayLabel}
        </Button>
      </div>
    </Card>
  );
}
