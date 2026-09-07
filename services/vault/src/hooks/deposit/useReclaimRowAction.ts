/**
 * useReclaimRowAction — whether a settled vault's row may offer the reclaim of
 * its depositor-claim reserve.
 *
 * Sibling of `useRefundRowAction`, and the same three-state contract:
 *
 *  - `available` — the reclaim can be performed now.
 *  - `blockedTooltip` — the reclaim is the row's action but is not performable;
 *    the row shows a disabled control explaining why. Null when the reclaim is
 *    not this row's action at all, which leaves the row with no action rather
 *    than a permanently disabled button.
 *  - `reclaimableSats` — the reserve's value, for the row's figure. Null until
 *    the chain read lands.
 *
 * Refund and reclaim are mutually exclusive by contract status: refund applies
 * to EXPIRED vaults (no PegIn was ever broadcast), reclaim to
 * DEPOSITOR_WITHDRAWN ones (the PegIn confirmed and the peg-out settled). A row
 * never offers both.
 *
 * The decision itself lives in `models/reclaimEligibility` — read the warning
 * there before changing when this is offered.
 */

import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useMemo } from "react";

import { isWithdrawBlocked } from "@/components/shared/protocolStatus";
import { useBTCWallet } from "@/context/wallet";
import { LEDGER_VAULT_WALLET_ID } from "@/context/wallet/VaultWalletConnectionProvider";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import type { ReclaimStatus } from "@/hooks/useReclaimStatus";
import {
  getReclaimEligibility,
  type ReclaimEligibility,
} from "@/models/reclaimEligibility";

export interface ReclaimRowAction {
  available: boolean;
  /** A sweep is broadcast and unconfirmed: show the button, disabled. */
  reclaiming: boolean;
  blockedTooltip: string | null;
  reclaimableSats: bigint | null;
}

export interface UseReclaimRowActionInput {
  /**
   * This vault's reserve state from the batched poller, carrying the tip height
   * its spends were observed against.
   */
  status: ReclaimStatus | undefined;
  /** Live `BTCVaultStatus` from the contract. */
  onChainStatus: number | undefined;
  /** The vault's depositor BTC pubkey, for the ownership check. */
  depositorBtcPubkey: string | undefined;
  /** True while this session's sweep for this vault is not yet observed. */
  isReclaimInFlight: boolean;
}

/**
 * Whether the vault's depositor key is the connected wallet's.
 *
 * Deliberately not `isVaultOwnedByWallet` from `utils/vaultWarnings`: that
 * helper assumes ownership when either key is missing, which is right for a
 * warning banner and wrong here. This gate fails closed — an unknown key means
 * no action offered, rather than a button that can only fail at signing.
 */
function isOwnedByConnectedWallet(
  vaultDepositorBtcPubkey: string | undefined,
  connectedBtcPubkey: string | undefined,
): boolean {
  if (!vaultDepositorBtcPubkey || !connectedBtcPubkey) return false;
  const normalize = (key: string) => key.replace(/^0x/i, "").toLowerCase();
  return normalize(vaultDepositorBtcPubkey) === normalize(connectedBtcPubkey);
}

export function useReclaimRowAction({
  status,
  onChainStatus,
  depositorBtcPubkey,
  isReclaimInFlight,
}: UseReclaimRowActionInput): ReclaimRowAction {
  const { publicKeyNoCoord } = useBTCWallet();
  // The wallet id lives on the connector, not the BTC wallet context — same
  // accessor `useRefundState` uses.
  const btcConnector = useChainConnector("BTC");
  const isLedgerWallet =
    btcConnector?.connectedWallet?.id === LEDGER_VAULT_WALLET_ID;
  const isOwnedByWallet = isOwnedByConnectedWallet(
    depositorBtcPubkey,
    publicKeyNoCoord,
  );
  // Reclaim is an exit, so it follows withdraw's pause semantics.
  const withdrawBlocked = isWithdrawBlocked(useProtocolGateState());

  const eligibility: ReclaimEligibility = useMemo(
    () =>
      getReclaimEligibility({
        onChainStatus,
        payoutSpend: status?.payoutSpend,
        reserveSpend: status?.reserveSpend,
        // The tip these spends were read against, never a fresher one — see
        // `ReclaimStatus.observedTipHeight`.
        tipHeight: status?.observedTipHeight,
        isOwnedByWallet,
        isLedgerWallet,
        isWithdrawBlocked: withdrawBlocked,
        isReclaimInFlight,
      }),
    [
      onChainStatus,
      status,
      isOwnedByWallet,
      isLedgerWallet,
      withdrawBlocked,
      isReclaimInFlight,
    ],
  );

  return {
    available: eligibility.type === "available",
    reclaiming: eligibility.type === "reclaiming",
    blockedTooltip: eligibility.type === "blocked" ? eligibility.tooltip : null,
    // Only meaningful once the row actually offers something; an absent row
    // shows no figure.
    reclaimableSats:
      eligibility.type === "absent" ? null : (status?.reserveValueSats ?? null),
  };
}
