/**
 * Custom hook for vault actions (broadcast, activation)
 */

import { getETHChain } from "@babylonlabs-io/config";
import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { validateSecretAgainstHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  calculateBtcTxHash,
  UtxoNotAvailableError,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useState } from "react";
import type { Hex } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { getVaultRegistryReader } from "../../clients/eth-contract/sdk-readers";
import {
  ContractStatus,
  getNextLocalStatus,
  PeginAction,
  type LocalStorageStatus,
} from "../../models/peginStateMachine";
import {
  assertUtxosAvailable,
  broadcastPrePeginTransaction,
  fetchVaultById,
} from "../../services/vault";
import { activateVaultWithSecret } from "../../services/vault/vaultActivationService";
import { utxosToExpectedRecord } from "../../services/vault/vaultPeginBroadcastService";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import { stripHexPrefix } from "../../utils/btc";

export interface BroadcastPrePeginParams {
  activityId: Hex;
  activityAmount: string;
  activityProviders: Array<{ id: string }>;
  activityApplicationEntryPoint?: string;
  pendingPegin?: PendingPeginRequest;
  updatePendingPeginStatus?: (
    vaultId: string,
    status: LocalStorageStatus,
  ) => void;
  addPendingPegin?: (pegin: Omit<PendingPeginRequest, "timestamp">) => void;
  onRefetchActivities: () => void;
  onShowSuccessModal: () => void;
}

export interface ActivateVaultParams {
  /** Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)) */
  vaultId: Hex;
  /** HTLC secret hex entered by the user (with or without 0x prefix) */
  secretHex: string;
  /** Depositor's ETH address */
  depositorEthAddress: string;
  pendingPegin?: PendingPeginRequest;
  updatePendingPeginStatus?: (
    vaultId: string,
    status: LocalStorageStatus,
  ) => void;
  onRefetchActivities: () => void;
  onShowSuccessModal: () => void;
}

export interface UseVaultActionsReturn {
  // Broadcast state
  broadcasting: boolean;
  broadcastError: string | null;
  handleBroadcast: (params: BroadcastPrePeginParams) => Promise<void>;
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
  const handleBroadcast = async (params: BroadcastPrePeginParams) => {
    const {
      activityId,
      activityAmount,
      activityProviders,
      activityApplicationEntryPoint,
      pendingPegin,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Fetch indexer + on-chain in parallel. Indexer is needed for indexer-only
      // statuses (EXPIRED/INVALID/...) which BTCVaultRegistry doesn't expose;
      // on-chain provides the authoritative prePeginTxHash and depositorBtcPubKey
      // for tx-integrity verification.
      const [vault, onChain] = await Promise.all([
        fetchVaultById(activityId),
        getVaultRegistryReader().getVaultData(activityId),
      ]);

      if (!vault) {
        throw new Error("Vault not found. Please try again.");
      }

      if (vault.status !== ContractStatus.PENDING) {
        throw new Error(
          `Cannot broadcast: vault is in ${ContractStatus[vault.status]} state. Broadcast is only valid during PENDING.`,
        );
      }

      // Cross-check on-chain status. Indexer is the only source for the
      // 4-7 indexer-derived states (EXPIRED/INVALID/...) but for 0-3
      // (Pending/Verified/Active/Redeemed) the contract is authoritative —
      // a stale or malicious indexer reporting PENDING for a vault that's
      // already moved past it would otherwise still trigger UTXO checks
      // and a wallet prompt.
      if (onChain.basic.status !== ContractStatus.PENDING) {
        throw new Error(
          `Cannot broadcast: on-chain vault status is ${ContractStatus[onChain.basic.status]}. Broadcast is only valid during PENDING.`,
        );
      }

      // Pick a candidate unsigned tx hex (prefer the local copy saved at
      // construction time; fall back to the indexer for cross-device resume).
      // Either source is untrusted on its own — the on-chain hash check below
      // is the authoritative invariant.
      const candidateUnsignedTxHex =
        pendingPegin?.unsignedTxHex || vault.unsignedPrePeginTx;

      // Authoritative integrity check: the candidate must hash to the
      // prePeginTxHash registered on-chain. Closes the cross-device fallback
      // gap (auditor #2) where a malicious indexer could substitute the tx.
      const computedTxHash = calculateBtcTxHash(candidateUnsignedTxHex);
      if (
        computedTxHash.toLowerCase() !==
        onChain.protocol.prePeginTxHash.toLowerCase()
      ) {
        throw new Error(
          "Pre-PegIn transaction does not match the on-chain registration. Aborting to prevent broadcasting an unregistered transaction.",
        );
      }
      const unsignedTxHex = candidateUnsignedTxHex;

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error(
          "BTC wallet not connected. Please reconnect your wallet.",
        );
      }

      // Use the on-chain depositor BTC pubkey for Taproot signing options —
      // never the indexer-supplied value.
      const depositorBtcPubkey = stripHexPrefix(
        onChain.basic.depositorBtcPubKey,
      );
      if (!depositorBtcPubkey) {
        throw new Error(
          "Depositor BTC public key not found on-chain. Please try creating the peg-in request again.",
        );
      }

      // Get depositor's BTC address for UTXO validation
      const depositorAddress = await btcWalletProvider.getAddress();

      // Validate UTXOs are still available BEFORE asking user to sign.
      // This prevents wasted signing effort if UTXOs have been spent
      // by unrelated transactions.
      await assertUtxosAvailable(unsignedTxHex, depositorAddress);

      // Use trusted UTXO data from localStorage when available (stored at
      // construction time), falling back to mempool API with cross-validation
      const expectedUtxos = pendingPegin?.selectedUTXOs?.length
        ? utxosToExpectedRecord(pendingPegin.selectedUTXOs)
        : undefined;

      await broadcastPrePeginTransaction({
        unsignedTxHex,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
        depositorBtcPubkey,
        expectedUtxos,
      });

      // Update or create localStorage entry for status tracking
      // Use state machine to determine next status
      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );

      if (pendingPegin && updatePendingPeginStatus && nextStatus) {
        // Case 1: localStorage entry EXISTS - update status
        updatePendingPeginStatus(activityId, nextStatus);
      } else if (addPendingPegin && nextStatus) {
        // Case 2: NO localStorage entry (cross-device) - create one using the
        // values we just validated against the contract, not the raw indexer
        // response. Persisting indexer-tainted values would re-introduce the
        // trust boundary on the next pending-activity flow.
        addPendingPegin({
          id: activityId,
          amount: activityAmount,
          providerIds: activityProviders.map((p) => p.id),
          applicationEntryPoint: activityApplicationEntryPoint,
          peginTxHash: vault.peginTxHash,
          depositorBtcPubkey: onChain.basic.depositorBtcPubKey,
          unsignedTxHex,
          status: nextStatus,
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
      // Hashlock from on-chain — indexer is untrusted for signing-critical reads.
      const reader = getVaultRegistryReader();
      const protocolInfo = await reader.getVaultProtocolInfo(vaultId);
      if (
        !protocolInfo.depositorSignedPeginTx ||
        protocolInfo.depositorSignedPeginTx === "0x"
      ) {
        throw new Error(
          `Vault ${vaultId} not found on-chain or has no pegin transaction`,
        );
      }
      if (!protocolInfo.hashlock || protocolInfo.hashlock === "0x") {
        throw new Error(
          "Vault hashlock not found. The vault may not support activation.",
        );
      }

      // Validate secret against hashlock before sending ETH tx.
      // SDK version is sync + requires 0x-prefixed inputs.
      const isValid = validateSecretAgainstHashlock(
        ensureHexPrefix(secretHex),
        ensureHexPrefix(protocolInfo.hashlock),
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
      const rawMessage =
        err instanceof Error ? err.message : "Failed to activate vault";
      // Normalize the on-chain "vault not found" message so we don't leak
      // implementation detail like the raw vault id into the UI.
      const errorMessage = rawMessage.includes("not found on-chain")
        ? "Vault not found. The vault ID may be invalid."
        : rawMessage;
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
