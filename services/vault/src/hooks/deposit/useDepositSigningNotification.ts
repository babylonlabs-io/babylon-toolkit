/**
 * Active-deposit-flow signing-notification observer.
 *
 * Fires a browser notification when the running deposit flow reaches a
 * pre-broadcast signing step (derive secret / sign peg-in / sign PoP) while the
 * user is on another tab. Post-broadcast signing (WOTS / payouts / activation)
 * is covered by the pending-deposit observer ({@link useSigningRequiredNotifications}),
 * so this set deliberately stops at SIGN_POP to avoid double-notifying the same
 * requirement. No-ops when the SigningNotification provider is absent or the
 * feature flag is off.
 */

import { useEffect, useId } from "react";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";
import { useDocumentHidden } from "@/hooks/useDocumentHidden";
import type { BrowserNotificationCopy } from "@/utils/notifications/browserNotification";

// Import the enum from its defining module rather than the `depositFlowSteps`
// barrel: the barrel re-exports the heavy step implementations (WASM/SDK), and
// pulling those into this lightweight hook breaks consumers' test transforms.
import { DepositFlowStep } from "./depositFlowSteps/types";

const PRE_BROADCAST_STEP_COPY: Partial<
  Record<DepositFlowStep, BrowserNotificationCopy>
> = {
  [DepositFlowStep.DERIVE_VAULT_SECRET]:
    COPY.deposit.notifications.deriveVaultSecret,
  [DepositFlowStep.SIGN_PEGIN_BTC]: COPY.deposit.notifications.signPeginBtc,
  [DepositFlowStep.SIGN_POP]: COPY.deposit.notifications.signPop,
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
  const documentHidden = useDocumentHidden();

  useEffect(() => {
    if (!notifier || !active) return;
    const copy = PRE_BROADCAST_STEP_COPY[currentStep];
    if (!copy) return;
    notifier.notifySigningRequired(`inflow:${flowId}:${currentStep}`, copy);
  }, [currentStep, active, notifier, flowId, documentHidden]);
}
