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
import {
  isActionablePeginAction,
  isCandidateVault,
  PeginAction,
} from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import type { DepositPollingResult } from "@/types/peginPolling";
import type { BrowserNotificationCopy } from "@/utils/notifications/browserNotification";

// Copy for each pegin action the depositor can be nudged about. Keys must stay
// in sync with `isActionablePeginAction` (shared with the continuation view):
// an action it counts but this map omits would silently never notify.
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

export function useSigningRequiredNotifications(
  activities: VaultActivity[],
  getPollingResult: (depositId: string) => DepositPollingResult | undefined,
  btcPublicKey: string | undefined,
): void {
  const notifier = useSigningNotificationOptional();
  // Re-fire when the user switches tabs: a deposit that became actionable while
  // the tab was focused is suppressed by the provider, so we retry once hidden.
  const documentHidden = notifier?.documentHidden ?? false;
  // Stand down while an active deposit flow drives signing in-modal — the
  // in-flow observer owns notifications then, so this avoids double-firing.
  const isActiveFlow = notifier?.isActiveFlow ?? false;
  // Skip all per-poll-tick work when the feature is off (the provider is still
  // mounted, so the notifier is non-null) or absent (tests).
  const enabled = notifier?.enabled ?? false;

  const pending = useMemo(() => {
    if (!enabled || isActiveFlow) return [];
    const out: Array<{ key: string; copy: BrowserNotificationCopy }> = [];
    for (const activity of activities) {
      const result = getPollingResult(activity.id);
      if (!result || result.loading || !result.isOwnedByCurrentWallet) continue;
      // Skip deposits the continuation UI won't offer an action for, so we
      // never nudge an action the user can't actually take there.
      const { peginState } = result;
      if (!isCandidateVault(peginState)) continue;
      for (const action of peginState.availableActions ?? []) {
        if (!isActionablePeginAction(action, btcPublicKey)) continue;
        const copy = ACTION_NOTIFICATION_COPY[action];
        if (!copy) continue;
        out.push({ key: `signing:${activity.id}:${action}`, copy });
      }
    }
    return out;
  }, [enabled, activities, getPollingResult, btcPublicKey, isActiveFlow]);

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
