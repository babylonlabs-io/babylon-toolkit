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

import { isInteractiveEventTarget } from "./cardInteraction";
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

  // Display-only header total. `formatBtcAmount` rounds to 8 dp, so float-sum
  // drift never surfaces. Do NOT copy this parseFloat-sum into any commitment,
  // fee, or split-sizing path — those must sum satoshis as integers/bigints.
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
    if (!clickable || isInteractiveEventTarget(event)) return;
    onGroupClick?.(activities[0].id);
  };

  // Keyboard activation mirrors the click guard: Enter/Space on the hoisted
  // Broadcast button (or an inner Copy / explorer link) fires that control
  // only, without also opening the multistepper.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!clickable || isInteractiveEventTarget(event)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onGroupClick?.(activities[0].id);
    }
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
      // a11y status: keyboard activation handled (handleKeyDown, same
      // inner-control guard as click). KNOWN, ACCEPTED TRADEOFF: this
      // `role="button"` wrapper contains real interactive children (per-row
      // Copy/explorer controls + the hoisted Broadcast button) —
      // nested-interactive ARIA, accepted for the temporary card-as-button
      // design. Proper fix (stretched-link button) tracked as a follow-up.
      role={clickable ? "button" : undefined}
      aria-label={clickable ? COPY.deposit.progress.openDetailsAria : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? handleClick : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
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
