/**
 * Sends signing notifications for the active deposit flow.
 * The pending-deposit observer stops while this flow is active.
 * Each vault needs separate keys for its wallet actions.
 * Tab changes alone must not send alerts for completed signatures.
 */

import { useEffect, useId } from "react";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";
import type { BrowserNotificationCopy } from "@/utils/notifications/browserNotification";

// Import the enum directly to keep WASM and SDK code out of this hook.
import { DepositFlowStep } from "./depositFlowSteps/types";

/**
 * Steps in the same signing phase share one notification key.
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

export function useDepositSigningNotification(
  currentStep: DepositFlowStep,
  active: boolean,
  currentVaultIndex: number | null,
  isWaiting: boolean,
): void {
  const notifier = useSigningNotificationOptional();
  // Each deposit needs separate notification keys.
  const flowId = useId();
  const notifySigningRequired = notifier?.notifySigningRequired;
  const entry = STEP_NOTIFICATION[currentStep];
  const perVault = entry?.phase === "wots" || entry?.phase === "payouts";
  const vaultIndex = perVault ? currentVaultIndex : null;
  const needsWallet = !perVault || !isWaiting;

  // SUBMIT_PEGIN stays current during finality, after the user signs.
  // Keep visibility changes out of this effect to prevent stale alerts.
  useEffect(() => {
    if (!notifySigningRequired || !active || !entry || !needsWallet) return;
    if (perVault && vaultIndex === null) return;
    const phase = perVault ? `${entry.phase}:${vaultIndex}` : entry.phase;
    notifySigningRequired(`inflow:${flowId}:${phase}`, entry.copy);
  }, [
    active,
    entry,
    notifySigningRequired,
    flowId,
    perVault,
    vaultIndex,
    needsWallet,
  ]);
}
