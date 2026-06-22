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
  // Re-fire when the user switches tabs: a step reached while focused is
  // suppressed by the provider, so we retry once the tab is hidden.
  const documentHidden = notifier?.documentHidden ?? false;

  useEffect(() => {
    if (!notifier || !active) return;
    const entry = STEP_NOTIFICATION[currentStep];
    if (!entry) return;
    notifier.notifySigningRequired(
      `inflow:${flowId}:${entry.phase}`,
      entry.copy,
    );
  }, [currentStep, active, notifier, flowId, documentHidden]);
}
