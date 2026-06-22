/**
 * Pending-deposit signing-notification observer.
 *
 * Fires a browser notification when one of the polled deposits enters a state
 * that needs the depositor to sign or act, and the user is on another tab.
 * Mounted inside `PeginPollingProvider`, where every deposit's `peginState` is
 * already computed. No-ops when the SigningNotification provider is absent
 * (e.g. in tests) or the feature flag is off.
 */

import { useEffect, useMemo, useRef } from "react";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";
import { useDocumentHidden } from "@/hooks/useDocumentHidden";
import {
  PeginAction,
  USER_ACTIONABLE_PEGIN_ACTIONS,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";
import type { BrowserNotificationCopy } from "@/utils/notifications/browserNotification";

// Pending-deposit actions that need the depositor to sign/act, mapped to copy.
// Mirrors `hasActionableStep` in PostDepositContinuationView: the user-actionable
// set plus the shared Pre-PegIn broadcast.
const ACTION_NOTIFICATION_COPY: Partial<
  Record<PeginAction, BrowserNotificationCopy>
> = {
  [PeginAction.SUBMIT_WOTS_KEY]: COPY.deposit.notifications.submitWotsKey,
  [PeginAction.SIGN_PAYOUT_TRANSACTIONS]:
    COPY.deposit.notifications.signPayouts,
  [PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN]:
    COPY.deposit.notifications.signAndBroadcast,
  [PeginAction.ACTIVATE_VAULT]: COPY.deposit.notifications.activateVault,
};

function isNotifiableAction(action: PeginAction): boolean {
  return (
    USER_ACTIONABLE_PEGIN_ACTIONS.has(action) ||
    action === PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN
  );
}

export function useSigningRequiredNotifications(
  activities: VaultActivity[],
  getPollingResult: (depositId: string) => DepositPollingResult | undefined,
  btcPublicKey: string | undefined,
): void {
  const notifier = useSigningNotificationOptional();
  // Re-fire when the user switches tabs: a deposit that became actionable while
  // the tab was focused is suppressed by the provider, so we retry once hidden.
  const documentHidden = useDocumentHidden();

  const pending = useMemo(() => {
    const out: Array<{ key: string; copy: BrowserNotificationCopy }> = [];
    for (const activity of activities) {
      const result = getPollingResult(activity.id);
      if (!result || result.loading || !result.isOwnedByCurrentWallet) continue;
      for (const action of result.peginState.availableActions ?? []) {
        if (!isNotifiableAction(action)) continue;
        // Mirror `hasActionableStep`: payout signing needs the BTC public key to
        // render the resume branch, so don't nudge to an action the user can't
        // take yet. (Ownership "assumes owned" when the key is missing, so this
        // guard is required - the ownership filter alone won't catch it.)
        if (
          action === PeginAction.SIGN_PAYOUT_TRANSACTIONS &&
          btcPublicKey === undefined
        ) {
          continue;
        }
        const copy = ACTION_NOTIFICATION_COPY[action];
        if (!copy) continue;
        out.push({ key: `signing:${activity.id}:${action}`, copy });
      }
    }
    return out;
  }, [activities, getPollingResult, btcPublicKey]);

  // Stable string the effect keys on, so it only runs when the set of
  // signing-required deposits changes - not on every poll tick.
  const signature = pending.map((p) => p.key).join("|");
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    if (!notifier) return;
    for (const { key, copy } of pendingRef.current) {
      notifier.notifySigningRequired(key, copy);
    }
  }, [signature, notifier, documentHidden]);
}
