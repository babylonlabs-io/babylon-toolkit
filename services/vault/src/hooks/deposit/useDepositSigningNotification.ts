/**
 * Active-deposit-flow signing-notification observer.
 *
 * Fires a browser notification when the running deposit flow reaches a signing
 * step while the user is on another tab. `executeDeposit` drives the WHOLE flow
 * in-modal (derive → peg-in → PoP → WOTS → payout signing) before it returns,
 * and the pending-deposit observer can't cover those in-modal popups (the
 * deposit isn't indexed yet and the continuation provider isn't mounted), so
 * this observer owns notifications for the active flow. The pending-deposit
 * observer stands down while `isActiveFlow` is set, so there's no double-fire.
 *
 * Notifies at step entry only, which covers every step the flow reaches after an
 * unattended wait - the broadcast, WOTS and payout popups. The accepted cost is
 * every popup the step change does not mark: one that is already open when the
 * depositor leaves the tab, because the step alone cannot tell an open popup
 * from an answered one, and one raised by a round that re-enters the step it is
 * already on, because that is a same-value set and the effect does not re-run.
 * The per-vault WOTS round is the second case; the payout round moves through
 * several step values, so it still re-runs.
 *
 * No-ops when the SigningNotification provider is absent or the flag is off.
 */

import { useEffect, useId } from "react";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";
import type { BrowserNotificationCopy } from "@/utils/notifications/browserNotification";

// Import the enum from its defining module rather than the `depositFlowSteps`
// barrel: the barrel re-exports the heavy step implementations (WASM/SDK), and
// pulling those into this lightweight hook breaks consumers' test transforms.
import { DepositFlowStep } from "./depositFlowSteps/types";

/**
 * Maps each signing step to a notification phase + copy. Steps that belong to
 * the same logical signing moment share a `phase` so they collapse to a single
 * notification — the auth-anchor/payout/recovery popups are one "sign your
 * payouts" event, not three.
 */
const STEP_NOTIFICATION: Partial<
  Record<DepositFlowStep, { phase: string; copy: BrowserNotificationCopy }>
> = {
  [DepositFlowStep.DERIVE_VAULT_SECRET]: {
    phase: "derive",
    copy: COPY.deposit.notifications.deriveVaultSecret,
  },
  [DepositFlowStep.SIGN_PEGIN_BTC]: {
    phase: "pegin",
    copy: COPY.deposit.notifications.signPeginBtc,
  },
  [DepositFlowStep.SIGN_POP]: {
    phase: "pop",
    copy: COPY.deposit.notifications.signPop,
  },
  [DepositFlowStep.SUBMIT_PEGIN]: {
    phase: "register",
    copy: COPY.deposit.notifications.submitPegin,
  },
  [DepositFlowStep.BROADCAST_PRE_PEGIN]: {
    phase: "broadcast",
    copy: COPY.deposit.notifications.signAndBroadcast,
  },
  [DepositFlowStep.SUBMIT_WOTS_KEYS]: {
    phase: "wots",
    copy: COPY.deposit.notifications.submitWotsKey,
  },
  [DepositFlowStep.SIGN_AUTH_ANCHOR]: {
    phase: "payouts",
    copy: COPY.deposit.notifications.signPayouts,
  },
  [DepositFlowStep.SIGN_PAYOUTS]: {
    phase: "payouts",
    copy: COPY.deposit.notifications.signPayouts,
  },
  [DepositFlowStep.SIGN_DEPOSITOR_GRAPH]: {
    phase: "payouts",
    copy: COPY.deposit.notifications.signPayouts,
  },
};

/**
 * @param currentStep the active deposit-flow step
 * @param active whether the flow has actually started. Guards against the
 *   initial `DERIVE_VAULT_SECRET` value firing (and consuming its de-dup key)
 *   while the summary card is still shown, before the user clicks Sign.
 */
export function useDepositSigningNotification(
  currentStep: DepositFlowStep,
  active: boolean,
): void {
  const notifier = useSigningNotificationOptional();
  // Per-flow id keeps the de-dup key unique so a second deposit in the same
  // session notifies again rather than being swallowed by the prior flow.
  const flowId = useId();
  // Stable across provider re-renders, unlike `notifier` itself: the effect
  // must run when the step changes and at no other time (see below).
  const notifySigningRequired = notifier?.notifySigningRequired;

  // Fires only when the flow ENTERS a signing step, never again while it stays
  // there. A step outlives its wallet popup: SUBMIT_PEGIN stays current through
  // the receipt wait and the ~1.6 min Ethereum finality gate, long after the
  // depositor confirmed the registration. This effect also ran when the tab
  // became hidden, and the provider leaves a key unconsumed while the tab is
  // visible, so tabbing away during that wait asked for a signature that was
  // already given.
  useEffect(() => {
    if (!notifySigningRequired || !active) return;
    const entry = STEP_NOTIFICATION[currentStep];
    if (!entry) return;
    notifySigningRequired(`inflow:${flowId}:${entry.phase}`, entry.copy);
  }, [currentStep, active, notifySigningRequired, flowId]);
}
