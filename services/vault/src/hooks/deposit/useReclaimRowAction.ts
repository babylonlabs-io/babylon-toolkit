/**
 * useReclaimRowAction — whether a settled vault's row may offer the reclaim of
 * its depositor-claim reserve.
 *
 * Sibling of `useRefundRowAction`, with the same contract plus one outcome of
 * its own:
 *
 *  - `available` — the reclaim can be performed now.
 *  - `blockedTooltip` — the reclaim is the row's action but is not performable;
 *    the row shows a disabled control explaining why. Null when the reclaim is
 *    not this row's action at all, which leaves the row with no action rather
 *    than a permanently disabled button.
 *  - `reclaimableSats` — the reserve's value, for the row's figure. Null until
 *    the chain read lands.
 *  - `needsWallet` — the reclaim would be available to the vault's owner, but
 *    no Bitcoin wallet is connected to verify ownership (an Ethereum-only
 *    session); the row offers the wallet connection in place of the action.
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
import { useCallback } from "react";

import { isWithdrawBlocked } from "@/components/shared/protocolStatus";
import FeatureFlags from "@/config/featureFlags";
import { useBTCWallet } from "@/context/wallet";
import { isLedgerVaultConnector } from "@/context/wallet/VaultWalletConnectionProvider";
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
  /** Available to the owner, but no Bitcoin wallet is connected to verify. */
  needsWallet: boolean;
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

export function useReclaimRowAction() {
  const { publicKeyNoCoord, connected: btcConnected } = useBTCWallet();
  // The wallet id lives on the connector, not the BTC wallet context — same
  // accessor `useRefundState` uses.
  const btcConnector = useChainConnector("BTC");
  const isLedgerWallet = isLedgerVaultConnector(btcConnector);
  // Reclaim is an exit, so it follows withdraw's pause semantics.
  const withdrawBlocked = isWithdrawBlocked(useProtocolGateState());

  return useCallback(
    ({
      status,
      onChainStatus,
      depositorBtcPubkey,
      isReclaimInFlight,
    }: UseReclaimRowActionInput): ReclaimRowAction => {
      const isOwnedByWallet = isOwnedByConnectedWallet(
        depositorBtcPubkey,
        publicKeyNoCoord,
      );
      // With no Bitcoin wallet attached, an Ethereum-only session cannot verify
      // ownership of a vault whose depositor key is known. A locked wallet still
      // exposes its key, so it takes the real ownership check. Evaluate the model as the owner would see it, so
      // the row shows the same outcome (blocked, reclaiming, absent) and only an
      // available reclaim asks for the wallet — the model stays the single gate.
      const assumeOwnership =
        FeatureFlags.isEthFirstEnabled && !btcConnected && !!depositorBtcPubkey;
      const eligibility: ReclaimEligibility = getReclaimEligibility({
        onChainStatus,
        payoutSpend: status?.payoutSpend,
        reserveSpend: status?.reserveSpend,
        // The tip these spends were read against, never a fresher one — see
        // `ReclaimStatus.observedTipHeight`.
        tipHeight: status?.observedTipHeight,
        isOwnedByWallet: assumeOwnership || isOwnedByWallet,
        isLedgerWallet,
        isWithdrawBlocked: withdrawBlocked,
        isReclaimInFlight,
      });
      const isAvailable = eligibility.type === "available";

      return {
        available: isAvailable && !assumeOwnership,
        reclaiming: eligibility.type === "reclaiming",
        needsWallet: isAvailable && assumeOwnership,
        blockedTooltip:
          eligibility.type === "blocked" ? eligibility.tooltip : null,
        // Only meaningful once the row actually offers something; an absent row
        // shows no figure.
        reclaimableSats:
          eligibility.type === "absent"
            ? null
            : (status?.reserveValueSats ?? null),
      };
    },
    [publicKeyNoCoord, btcConnected, isLedgerWallet, withdrawBlocked],
  );
}
