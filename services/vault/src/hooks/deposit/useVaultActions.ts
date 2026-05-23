/**
 * Custom hook for vault actions (broadcast, activation)
 */

import {
  ensureHexPrefix,
  isRegisteredVaultVersionMismatchError,
  stripHexPrefix,
  verifyRegisteredVaultVersions,
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
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { getETHChain } from "@/config/network";
import { COPY } from "@/copy";

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
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "../../utils/btc";

export interface BroadcastPrePeginParams {
  vaultId: Hex;
  pendingPegin?: PendingPeginRequest;
  updatePendingPeginStatus?: (
    vaultId: string,
    status: LocalStorageStatus,
  ) => void;
  /**
   * Drop the local pending entry when a confirmed on-chain version
   * mismatch makes it permanently un-broadcastable. Mirrors the inline
   * deposit path's cleanup so the UI stops surfacing a Broadcast button
   * that will always fail and the selectedUTXOs are freed.
   */
  removePendingPegin?: (vaultId: string) => void;
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

  // Track mount: both handleBroadcast and handleActivation await slow
  // on-chain work and then setState. The consumer (Resume*Content inside
  // the deposit modal) can unmount mid-flight; without this guard those
  // post-await setters fire on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      removePendingPegin,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Fetch vault data from GraphQL
      const vault = await fetchVaultById(vaultId);

      if (!vault) {
        throw new Error("BTC Vault not found. Please try again.");
      }

      if (vault.status !== ContractStatus.PENDING) {
        throw new Error(
          `Cannot broadcast: BTC Vault is in ${ContractStatus[vault.status]} state. Broadcast is only valid during PENDING.`,
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

      // Gate on a fresh on-chain status read. The GraphQL pre-check above is
      // an indexer/Redis value that can lag the chain; if a vault has moved
      // off PENDING since the indexer last refreshed, signing+broadcasting
      // here would lock BTC into a flow that can no longer activate normally.
      // Compare AND label against `OnChainBtcVaultStatus` (not the app-side
      // `ContractStatus`, which reassigns the contract's Expired(4) to the
      // indexer-only LIQUIDATED and would mislabel on-chain Expired).
      if (onChainVault.status !== OnChainBtcVaultStatus.PENDING) {
        const label =
          OnChainBtcVaultStatus[onChainVault.status] ??
          `UNKNOWN(${onChainVault.status})`;
        throw new Error(
          `Cannot broadcast: on-chain BTC Vault is in ${label} state. Broadcast is only valid during PENDING.`,
        );
      }

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      const connectedBtcAddress =
        btcConnector?.connectedWallet?.account?.address;
      if (!btcWalletProvider || !connectedBtcAddress) {
        throw new Error(
          "BTC wallet not connected. Please reconnect your wallet.",
        );
      }

      // The wallet may have locked since the action started. Probe it with a
      // round-trip before any signing (a cached `getAddress()` would not reveal
      // a lock) so a locked/changed wallet fails fast with an actionable error
      // instead of a silent no-op (no signing popup appears).
      await verifyBtcWalletLiveness(btcWalletProvider, connectedBtcAddress, {
        probeConnection: shouldProbeWalletLiveness(
          btcConnector?.connectedWallet?.id,
        ),
      });

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

      // Resume broadcast must verify versions against the values used to
      // construct `unsignedTxHex`, not the current local config — both
      // could have rotated to a newer version while the BTC scripts are
      // still pinned to the construction-time version. Refuse when
      // there's no local anchor for the guard: cross-device resume (no
      // pendingPegin), the cross-device "tracking record" form
      // (`unsignedTxHex: ""` — the storage validator accepts it as a
      // future-sync marker, but its build versions would not be tied to
      // the indexer's tx we'd otherwise sign), or legacy entries missing
      // build versions.
      if (!pendingPegin || pendingPegin.unsignedTxHex === "") {
        throw new Error(COPY.deposit.errors.crossDeviceBroadcastUnsupported);
      }
      const buildOffchainParamsVersion =
        pendingPegin.buildOffchainParamsVersion;
      const buildAppVaultKeepersVersion =
        pendingPegin.buildAppVaultKeepersVersion;
      const buildUniversalChallengersVersion =
        pendingPegin.buildUniversalChallengersVersion;
      if (
        buildOffchainParamsVersion === undefined ||
        buildAppVaultKeepersVersion === undefined ||
        buildUniversalChallengersVersion === undefined
      ) {
        throw new Error(COPY.deposit.errors.crossDeviceBroadcastUnsupported);
      }
      try {
        await verifyRegisteredVaultVersions({
          vaultRegistryReader: getVaultRegistryReader(),
          vaultIds: [vaultId],
          expectedOffchainParamsVersion: buildOffchainParamsVersion,
          expectedAppVaultKeepersVersion: buildAppVaultKeepersVersion,
          expectedUniversalChallengersVersion: buildUniversalChallengersVersion,
        });
      } catch (err) {
        // Only a confirmed mismatch drops the entry — transient RPC
        // failures keep it so the user can retry. Mirrors the inline
        // deposit path at useDepositFlow.ts:661.
        if (isRegisteredVaultVersionMismatchError(err)) {
          removePendingPegin?.(vaultId);
        }
        throw err;
      }

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

      if (mountedRef.current) setBroadcasting(false);
    } catch (err) {
      if (mountedRef.current) {
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
      // Read basic + protocol info in one parallel call. Indexer is
      // untrusted for signing-critical reads, so both come from on-chain.
      // `getVaultData` already throws if the vault is missing on-chain
      // (empty `depositorSignedPeginTx`), so no separate existence check
      // is needed here. Parallel reads also narrow the gap between the
      // status check and the contract write (the actual TOCTOU window
      // for the secret-leak failure mode this hook guards against).
      const reader = getVaultRegistryReader();
      const { basic: basicInfo, protocol: protocolInfo } =
        await reader.getVaultData(vaultId);

      if (!protocolInfo.hashlock || protocolInfo.hashlock === "0x") {
        throw new Error(
          "BTC Vault hashlock not found. The BTC Vault may not support activation.",
        );
      }

      // Gate on the on-chain status. The UI surfaces the "Activate" button
      // based on indexer-reported status; a poisoned or lagging indexer
      // reporting VERIFIED while the contract is still PENDING would let
      // the secret reach `simulateContract` calldata and leak to the RPC
      // layer. Exact-match VERIFIED (not >= 1) — ACTIVE/REDEEMED/etc. must
      // not pass. Compare AND label against `OnChainBtcVaultStatus` (not
      // the app-side `ContractStatus`, which reassigns the contract's
      // Expired(4) value to the indexer-only LIQUIDATED and would
      // mislabel on-chain Expired).
      if (basicInfo.status !== OnChainBtcVaultStatus.VERIFIED) {
        const label =
          OnChainBtcVaultStatus[basicInfo.status] ??
          `UNKNOWN(${basicInfo.status})`;
        throw new Error(
          `Cannot activate: BTC Vault is in ${label} state. Activation is only valid when VERIFIED.`,
        );
      }

      // Validate secret against hashlock before sending ETH tx.
      // SDK version is sync + requires 0x-prefixed inputs.
      const isValid = validateSecretAgainstHashlock(
        ensureHexPrefix(secretHex),
        ensureHexPrefix(protocolInfo.hashlock),
      );
      if (!isValid) {
        throw new Error(COPY.deposit.errors.invalidSecret);
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

      if (mountedRef.current) setActivating(false);
    } catch (err) {
      if (mountedRef.current) {
        const rawMessage =
          err instanceof Error ? err.message : "Failed to activate BTC Vault";
        // Normalize the on-chain "vault not found" message so we don't leak
        // implementation detail like the raw vault id into the UI.
        const errorMessage = rawMessage.includes("not found on-chain")
          ? "BTC Vault not found. The BTC Vault ID may be invalid."
          : rawMessage;
        setActivationError(errorMessage);
        setActivating(false);
      }
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
