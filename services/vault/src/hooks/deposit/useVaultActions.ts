/**
 * Custom hook for vault actions (broadcast, activation)
 */

import {
  ensureHexPrefix,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  OnChainBtcVaultStatus,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
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

import { getETHChain } from "@/config/network";

import { getVaultFromChain } from "../../clients/eth-contract/btc-vault-registry/query";
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

export interface BroadcastPrePeginParams {
  vaultId: Hex;
  pendingPegin?: PendingPeginRequest;
  updatePendingPeginStatus?: (
    vaultId: string,
    status: LocalStorageStatus,
  ) => void;
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
      vaultId,
      pendingPegin,
      updatePendingPeginStatus,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Fetch vault data from GraphQL
      const vault = await fetchVaultById(vaultId);

      if (!vault) {
        throw new Error("Vault not found. Please try again.");
      }

      if (vault.status !== ContractStatus.PENDING) {
        throw new Error(
          `Cannot broadcast: vault is in ${ContractStatus[vault.status]} state. Broadcast is only valid during PENDING.`,
        );
      }

      const graphqlUnsignedTxHex = vault.unsignedPrePeginTx;

      // Prefer the locally stored transaction when available, while keeping the
      // indexer comparison as a sanity check for drift or substitution.
      const localUnsignedTxHex = pendingPegin?.unsignedTxHex;
      if (
        localUnsignedTxHex &&
        stripHexPrefix(localUnsignedTxHex).toLowerCase() !==
          stripHexPrefix(graphqlUnsignedTxHex).toLowerCase()
      ) {
        throw new Error(
          "Transaction mismatch: the indexer returned a transaction that differs from the locally stored copy. Aborting to prevent a potential attack.",
        );
      }

      const unsignedTxHex = localUnsignedTxHex || graphqlUnsignedTxHex;

      // prePeginTxHash on-chain commits to all inputs/outputs — any tx
      // substitution between build and broadcast produces a different hash.
      const onChainVault = await getVaultFromChain(vaultId);
      const computedHash = calculateBtcTxHash(unsignedTxHex);
      if (
        computedHash.toLowerCase() !== onChainVault.prePeginTxHash.toLowerCase()
      ) {
        throw new Error(
          "Transaction integrity check failed: the Pre-PegIn transaction " +
            "does not match the hash stored on-chain. Aborting to prevent a potential attack.",
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
      // Strip "0x" prefix since it comes from GraphQL (Ethereum-style hex)
      const depositorBtcPubkey = stripHexPrefix(vault.depositorBtcPubkey);
      if (!depositorBtcPubkey) {
        throw new Error(
          "Depositor BTC public key not found. Please try creating the peg-in request again.",
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

      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );

      if (updatePendingPeginStatus && nextStatus) {
        updatePendingPeginStatus(vaultId, nextStatus);
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

      // Gate on a fresh on-chain status read. The UI surfaces the "Activate"
      // button based on indexer-reported status; a poisoned or lagging indexer
      // reporting VERIFIED while the contract is still PENDING would let the
      // secret reach `simulateContract` calldata and leak to the RPC layer.
      // Exact-match VERIFIED (not >= 1) — ACTIVE/REDEEMED/etc. must not pass.
      // Compare AND label against `OnChainBtcVaultStatus` (not the app-side
      // `ContractStatus`, which reassigns the contract's Expired(4) value to
      // the indexer-only LIQUIDATED and would mislabel on-chain Expired).
      const basicInfo = await reader.getVaultBasicInfo(vaultId);
      if (basicInfo.status !== OnChainBtcVaultStatus.VERIFIED) {
        const label =
          OnChainBtcVaultStatus[basicInfo.status] ??
          `UNKNOWN(${basicInfo.status})`;
        throw new Error(
          `Cannot activate: vault is in ${label} state. Activation is only valid when VERIFIED.`,
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

      // Call activateVaultWithSecret on the contract. Hashlock is forwarded
      // so the SDK re-checks `sha256(secret) === hashlock` as the last gate
      // before calldata is assembled.
      await activateVaultWithSecret({
        vaultId: ensureHexPrefix(vaultId),
        secret: ensureHexPrefix(secretHex),
        hashlock: ensureHexPrefix(protocolInfo.hashlock) as Hex,
        walletClient,
      });

      // Cross-device resume has no `pendingPegin`; fall back to the
      // contract-authoritative signed pegin tx so the entry doesn't leak.
      const peginTxidForRelease = pendingPegin?.peginTxHash
        ? stripHexPrefix(pendingPegin.peginTxHash)
        : stripHexPrefix(
            calculateBtcTxHash(protocolInfo.depositorSignedPeginTx),
          );
      vpTokenRegistry.release(peginTxidForRelease);

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
