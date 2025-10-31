/**
 * Custom hook for managing vault activity actions
 */

import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useState } from "react";
import type { Hex } from "viem";

import type { ClaimerTransactions } from "../clients/vault-provider-rpc/types";
import { CONTRACTS } from "../config/contracts";
import { getNextLocalStatus, PeginAction } from "../models/peginStateMachine";
import { broadcastPeginTransaction, getPeginRequest } from "../services/vault";
import type { PendingPeginRequest } from "../storage/peginStorage";
import { stripHexPrefix } from "../utils/btc";

import { useSignPeginTransactions } from "./useSignPeginTransactions";

export interface BroadcastPeginParams {
  activityId: string;
  activityAmount: string;
  activityProviders: Array<{ id: string }>;
  connectedAddress: string;
  pendingPegin?: PendingPeginRequest;
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPeginRequest["status"],
    btcTxHash?: string,
  ) => void;
  addPendingPegin?: (pegin: Omit<PendingPeginRequest, "timestamp">) => void;
  onRefetchActivities: () => void;
  onShowSuccessModal: () => void;
}

export interface SignPayoutParams {
  peginTxId: string;
  vaultProviderAddress: Hex;
  depositorBtcPubkey: string;
  transactions: ClaimerTransactions[];
  activityId: string;
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPeginRequest["status"],
  ) => void;
  onRefetchActivities?: () => void;
}

export interface UseVaultActivityActionsReturn {
  // Broadcast state
  broadcasting: boolean;
  broadcastError: string | null;
  handleBroadcast: (params: BroadcastPeginParams) => Promise<void>;

  // Sign state
  signing: boolean;
  signError: string | null;
  handleSign: (params: SignPayoutParams) => Promise<void>;
}

/**
 * Custom hook for vault activity actions (broadcast and sign)
 */
export function useVaultActivityActions(): UseVaultActivityActionsReturn {
  // Broadcast state
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Sign state
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Connectors
  const btcConnector = useChainConnector("BTC");
  const { signPayoutsAndSubmit } = useSignPeginTransactions();

  /**
   * Handle broadcasting BTC transaction
   */
  const handleBroadcast = async (params: BroadcastPeginParams) => {
    const {
      activityId,
      activityAmount,
      activityProviders,
      pendingPegin,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Fetch pegin request from BTCVaultsManager contract (source of truth)
      const peginRequest = await getPeginRequest(
        CONTRACTS.BTC_VAULTS_MANAGER,
        activityId as Hex,
      );

      const unsignedTxHex = peginRequest.unsignedBtcTx;

      if (!unsignedTxHex) {
        throw new Error(
          "Unsigned transaction not found in contract. Please try again.",
        );
      }

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error(
          "BTC wallet not connected. Please reconnect your wallet.",
        );
      }

      // Get depositor's BTC public key (needed for Taproot signing)
      // Strip "0x" prefix since it comes from contract (Ethereum-style hex)
      const depositorBtcPubkey = stripHexPrefix(
        peginRequest.depositorBtcPubkey,
      );
      if (!depositorBtcPubkey) {
        throw new Error(
          "Depositor BTC public key not found. Please try creating the peg-in request again.",
        );
      }

      // Broadcast the transaction (UTXO will be derived from mempool API)
      const txId = await broadcastPeginTransaction({
        unsignedTxHex,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
        depositorBtcPubkey,
      });

      // Update or create localStorage entry with broadcast results
      // Use state machine to determine next status
      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );

      if (pendingPegin && updatePendingPeginStatus && nextStatus) {
        // Case 1: localStorage entry EXISTS - update status and BTC tx hash
        updatePendingPeginStatus(activityId, nextStatus, txId);
      } else if (addPendingPegin && nextStatus) {
        // Case 2: NO localStorage entry (cross-device) - create full peg-in entry
        addPendingPegin({
          id: activityId,
          amount: activityAmount,
          providerId: activityProviders[0]?.id, // Use first provider ID
          status: nextStatus,
        });
      }

      // Show success modal and refetch
      onShowSuccessModal();
      onRefetchActivities();

      setBroadcasting(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to broadcast transaction";
      setBroadcastError(errorMessage);
      setBroadcasting(false);
    }
  };

  /**
   * Handle signing payout transactions
   */
  const handleSign = async (params: SignPayoutParams) => {
    const {
      peginTxId,
      vaultProviderAddress,
      depositorBtcPubkey,
      transactions,
      activityId,
      updatePendingPeginStatus,
      onRefetchActivities,
    } = params;

    // Get BTC wallet provider
    const btcWalletProvider = btcConnector?.connectedWallet?.provider;
    if (!btcWalletProvider) {
      setSignError("BTC wallet not connected. Please reconnect your wallet.");
      return;
    }

    setSigning(true);
    setSignError(null);

    try {
      await signPayoutsAndSubmit({
        peginTxId,
        vaultProviderAddress,
        depositorBtcPubkey,
        transactions,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
      });

      // Update localStorage status using state machine
      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_PAYOUT_TRANSACTIONS,
      );
      if (updatePendingPeginStatus && nextStatus) {
        updatePendingPeginStatus(activityId, nextStatus);
      }

      // Refetch activities after successful submission
      if (onRefetchActivities) {
        onRefetchActivities();
      }

      setSigning(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to sign transactions";
      setSignError(errorMessage);
      setSigning(false);
    }
  };

  return {
    broadcasting,
    broadcastError,
    handleBroadcast,
    signing,
    signError,
    handleSign,
  };
}
