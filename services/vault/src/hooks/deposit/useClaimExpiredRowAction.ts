/**
 * useClaimExpiredRowAction — whether a list row may offer the expired-vault
 * redeem (`claimExpiredVault`).
 *
 * The Vaults page's inactive-vault row and the Activity feed's expired-deposit
 * row present the same action, so they must agree on when it is offered —
 * the counterpart of `useRefundRowAction` for an expired vault the PegIn
 * swept. There is no blocked state to explain: a redeem the connected BTC
 * wallet cannot take (another key owns the vault) offers nothing, and neither
 * does a closed window — the Vaults page states it in the row's status, and
 * the Activity feed adds no row for it.
 *
 * Must be called inside a PeginPollingProvider — it reads that deposit's poll
 * result.
 */

import { getActionStatus } from "@/components/deposit/actionStatus";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { PeginAction } from "@/models/peginStateMachine";
import type { DepositPollingResult } from "@/types/peginPolling";

/** The redeem decision for one poll result — the hook's pure core. */
export function isClaimExpiredRowActionAvailable(
  result: DepositPollingResult | undefined,
): boolean {
  if (!result) return false;
  const actionStatus = getActionStatus(result);
  return (
    actionStatus.type === "available" &&
    actionStatus.action.action === PeginAction.CLAIM_EXPIRED_VAULT
  );
}

export function useClaimExpiredRowAction(vaultId: string): boolean {
  return isClaimExpiredRowActionAvailable(useDepositPollingResult(vaultId));
}
