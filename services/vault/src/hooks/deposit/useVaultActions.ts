/**
 * Custom hook for vault actions (broadcast, activation)
 */

import { getETHChain } from "@babylonlabs-io/config";
import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useState } from "react";
import type { Hex } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import {
  getNextLocalStatus,
  PeginAction,
  type LocalStorageStatus,
} from "../../models/peginStateMachine";
import {
  assertUtxosAvailable,
  broadcastPeginTransaction,
  fetchVaultById,
  UtxoNotAvailableError,
} from "../../services/vault";
import { activateVaultWithSecret } from "../../services/vault/vaultActivationService";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import { stripHexPrefix } from "../../utils/btc";
import { validateSecretAgainstHashlock } from "../../utils/htlcSecret";

export interface BroadcastPeginParams {
  activityId: string;
  activityAmount: string;
  activityProviders: Array<{ id: string }>;
  activityApplicationController?: string;
  pendingPegin?: PendingPeginRequest;
  updatePendingPeginStatus?: (
    peginId: string,
    status: LocalStorageStatus,
    btcTxHash?: string,
  ) => void;
  addPendingPegin?: (pegin: Omit<PendingPeginRequest, "timestamp">) => void;
  onRefetchActivities: () => void;
  onShowSuccessModal: () => void;
}

export interface ActivateVaultParams {
  /** Vault ID (e.g. pegin tx hash) */
  vaultId: string;
  /** HTLC secret hex entered by the user (with or without 0x prefix) */
  secretHex: string;
  /** Depositor's ETH address */
  depositorEthAddress: string;
  pendingPegin?: PendingPeginRequest;
  updatePendingPeginStatus?: (
    peginId: string,
    status: LocalStorageStatus,
    btcTxHash?: string,
  ) => void;
  onRefetchActivities: () => void;
  onShowSuccessModal: () => void;
}

export interface UseVaultActionsReturn {
  // Broadcast state
  broadcasting: boolean;
  broadcastError: string | null;
  handleBroadcast: (params: BroadcastPeginParams) => Promise<void>;
  // Activation state
  activating: boolean;
  activationError: string | null;
  handleActivation: (params: ActivateVaultParams) => Promise<void>;
}

/**
 * Custom hook for vault actions (broadcast)
 */
export function useVaultActions(): UseVaultActionsReturn {
  // Broadcast state
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Activation state
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  // Connectors
  const btcConnector = useChainConnector("BTC");

  /**
   * Handle broadcasting BTC transaction
   */
  const handleBroadcast = async (params: BroadcastPeginParams) => {
    const {
      activityId,
      activityAmount,
      activityProviders,
      activityApplicationController,
      pendingPegin,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Fetch vault data from GraphQL
      const vault = await fetchVaultById(activityId as Hex);

      if (!vault) {
        throw new Error("Vault not found. Please try again.");
      }

      const unsignedTxHex = vault.unsignedPrePeginTx;

      if (!unsignedTxHex) {
        throw new Error("Pre-pegin transaction not found. Please try again.");
      }

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error(
          "BTC wallet not connected. Please reconnect your wallet.",
        );
      }

      // Get depositor's BTC public key (needed for Taproot signing)
      // Strip "0x" prefix since it comes from GraphQL (Ethereum-style hex)
      const depositorBtcPubkey = stripHexPrefix(vault.depositorBtcPubkey);
      if (!depositorBtcPubkey) {
        throw new Error(
          "Depositor BTC public key not found. Please try creating the peg-in request again.",
        );
      }

      // Get depositor's BTC address for UTXO validation
      const depositorAddress = await btcWalletProvider.getAddress();

      // Validate UTXOs are still available BEFORE asking user to sign
      // This prevents wasted signing effort if UTXOs have been spent
      await assertUtxosAvailable(unsignedTxHex, depositorAddress);

      // Broadcast the transaction (UTXO will be derived from mempool API)
      const txId = await broadcastPeginTransaction({
        unsignedTxHex,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
        depositorBtcPubkey,
      });

      // Update or create localStorage entry for status tracking
      // Use state machine to determine next status
      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );

      if (pendingPegin && updatePendingPeginStatus && nextStatus) {
        // Case 1: localStorage entry EXISTS - update status and txHash
        updatePendingPeginStatus(activityId, nextStatus, txId);
      } else if (addPendingPegin && nextStatus) {
        // Case 2: NO localStorage entry (cross-device) - create one with status and txHash
        addPendingPegin({
          id: activityId,
          amount: activityAmount,
          providerIds: activityProviders.map((p) => p.id),
          applicationController: activityApplicationController,
          status: nextStatus,
          btcTxHash: txId,
        });
      }

      // Show success modal and refetch
      onShowSuccessModal();
      onRefetchActivities();

      setBroadcasting(false);
    } catch (err) {
      let errorMessage: string;

      if (err instanceof UtxoNotAvailableError) {
        // UTXO not available - provide specific error message
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = "Failed to broadcast transaction";
      }

      setBroadcastError(errorMessage);
      setBroadcasting(false);
    }
  };

  /**
   * Handle vault activation — reveal HTLC secret on Ethereum
   */
  const handleActivation = async (params: ActivateVaultParams) => {
    const {
      vaultId,
      secretHex,
      depositorEthAddress,
      pendingPegin,
      updatePendingPeginStatus,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setActivating(true);
    setActivationError(null);

    try {
      // Fetch vault to get hashlock for client-side validation
      const vault = await fetchVaultById(vaultId as Hex);
      if (!vault) {
        throw new Error("Vault not found. Please try again.");
      }
      if (!vault.hashlock) {
        throw new Error(
          "Vault hashlock not found. The vault may not support atomic swap activation.",
        );
      }

      // Validate secret against hashlock before sending ETH tx
      const isValid = await validateSecretAgainstHashlock(
        secretHex,
        vault.hashlock,
      );
      if (!isValid) {
        throw new Error(
          "Invalid secret: SHA256(secret) does not match the vault's hashlock. Please check your secret and try again.",
        );
      }

      // Get ETH wallet client
      const chain = getETHChain();
      const wagmiConfig = getSharedWagmiConfig();
      await switchChain(wagmiConfig, { chainId: chain.id });
      const walletClient = await getWalletClient(wagmiConfig, {
        account: depositorEthAddress as Hex,
      });

      // Call activateVaultWithSecret on the contract
      await activateVaultWithSecret({
        vaultId: ensureHexPrefix(vaultId),
        secret: ensureHexPrefix(secretHex),
        walletClient,
      });

      // Update localStorage status
      const nextStatus = getNextLocalStatus(PeginAction.ACTIVATE_VAULT);
      if (pendingPegin && updatePendingPeginStatus && nextStatus) {
        updatePendingPeginStatus(vaultId, nextStatus);
      }

      // Show success and refetch
      onShowSuccessModal();
      onRefetchActivities();

      setActivating(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to activate vault";
      setActivationError(errorMessage);
      setActivating(false);
    }
  };

  return {
    broadcasting,
    broadcastError,
    handleBroadcast,
    activating,
    activationError,
    handleActivation,
  };
}
