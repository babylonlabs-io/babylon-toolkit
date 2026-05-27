/**
 * BatchedDepositGroup Component
 *
 * Handles the set of vaults funded by one shared Pre-PegIn Bitcoin
 * transaction (a batched / split pegin).
 *
 * Siblings always render inside a grouped container so it's visually clear
 * they belong to the same deposit. While the shared Pre-PegIn still needs
 * broadcasting, a broadcast button is hoisted to the group (one button for
 * the batch) and suppressed on the inner cards. Once the broadcast is done
 * the button is dropped, but the grouping wrapper stays so the user can
 * still tell at a glance that the cards are siblings.
 */

import { Button } from "@babylonlabs-io/core-ui";

import {
  getActionStatus,
  PeginAction,
} from "@/components/deposit/actionStatus";
import { getNetworkConfigBTC } from "@/config";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import type { VaultActivity } from "@/types/activity";
import type { VaultProvider } from "@/types/vaultProvider";
import { formatBtcAmount } from "@/utils/formatting";

import { PendingDepositCard } from "./PendingDepositCard";

interface BatchedDepositGroupProps {
  /** Sibling vaults sharing one Pre-PegIn transaction (2 or more). */
  activities: VaultActivity[];
  vaultProviders: VaultProvider[];
  /** Hoisted batch-level broadcast handler; only invoked while a sibling
   *  still needs the shared Pre-PegIn broadcast. */
  onBroadcastClick: (depositId: string) => void;
  /** Optional handler invoked when the group body is clicked outside any
   *  per-row action. One handler covers the whole batch — siblings open
   *  the same batch-level multistepper, so there's nothing to disambiguate
   *  per sub-card. The handler receives the first sibling's id as a
   *  representative; the caller resolves the full batch from there. */
  onGroupClick?: (representativeDepositId: string) => void;
}

export function BatchedDepositGroup({
  activities,
  vaultProviders,
  onBroadcastClick,
  onGroupClick,
}: BatchedDepositGroupProps) {
  const { getPollingResult } = usePeginPolling();

  // A sibling still needs the shared Pre-PegIn broadcast. One broadcast
  // covers the whole batch, so clicking the hoisted button routes through
  // any pending sibling.
  const broadcastTarget = activities.find((activity) => {
    const result = getPollingResult(activity.id);
    if (!result) return false;
    const status = getActionStatus(result);
    return (
      status.type === "available" &&
      status.action.action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN
    );
  });

  const totalBtc = activities.reduce(
    (sum, activity) => sum + parseFloat(activity.collateral.amount || "0"),
    0,
  );
  const btcSymbol = getNetworkConfigBTC().coinSymbol;

  // One click anywhere on the group opens the batch-level multistepper.
  // Clicks landing on a button or anchor inside (Copy, explorer link,
  // hoisted broadcast button, per-vault action) preserve their own behaviour.
  const clickable = Boolean(onGroupClick);
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!clickable) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a")) return;
    onGroupClick?.(activities[0].id);
  };

  return (
    <div
      // `group` enables the shared hover state — when the wrapper is hovered,
      // every VaultCardShell inside lights up via `group-hover:` so the whole
      // batch reads as a single button.
      className={
        clickable
          ? "group rounded-xl border border-accent-primary bg-primary-light/10 p-3 transition-colors hover:bg-primary-light/[0.15]"
          : "rounded-xl border border-accent-primary bg-primary-light/10 p-3"
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onGroupClick?.(activities[0].id);
              }
            }
          : undefined
      }
      style={clickable ? { cursor: "pointer" } : undefined}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs text-accent-secondary">
          {COPY.pegin.batchedDeposit.groupLabel}
        </span>
        <span className="text-xs text-accent-secondary">
          {COPY.pegin.batchedDeposit.totalLabel(
            formatBtcAmount(totalBtc),
            btcSymbol,
          )}
        </span>
      </div>
      <div className="space-y-2">
        {activities.map((activity) => (
          <PendingDepositCard
            key={activity.id}
            depositId={activity.id}
            amount={activity.collateral.amount}
            timestamp={activity.timestamp}
            peginTxHash={activity.peginTxHash}
            prePeginTxHash={activity.prePeginTxHash}
            providerId={activity.providers[0].id}
            vaultProviders={vaultProviders}
          />
        ))}
      </div>
      {broadcastTarget && (
        <div className="mt-3">
          <Button
            variant="contained"
            color="primary"
            className="w-full"
            onClick={() => onBroadcastClick(broadcastTarget.id)}
          >
            {COPY.pegin.primaryAction.SIGN_AND_BROADCAST_TO_BITCOIN}
          </Button>
          <span className="mt-2 block text-center text-xs text-accent-secondary">
            {COPY.pegin.batchedDeposit.broadcastHelper}
          </span>
        </div>
      )}
    </div>
  );
}
