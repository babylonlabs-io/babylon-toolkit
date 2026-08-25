/**
 * Custom hook for vault actions (broadcast, activation)
 */

import {
  ensureHexPrefix,
  forwardDepositApproval,
  forwardDeriveContextHash,
  isRegisteredVaultVersionMismatchError,
  stripHexPrefix,
  supportsDepositApproval,
  verifyRegisteredVaultVersions,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  OnChainBtcVaultStatus,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { validateSecretAgainstHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  getSharedWagmiConfig,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import {
  composeGateState,
  isActivateAndRedeemBlocked,
  isActivationBlocked,
} from "@/components/shared/protocolStatus";
import FeatureFlags from "@/config/featureFlags";
import { getETHChain } from "@/config/network";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { logger } from "@/infrastructure";
import {
  captureFunnelFailure,
  shortId,
  TELEMETRY_EVENT,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import {
  waitForEthRegistrationDepth,
  type RegistrationDepthProgress,
} from "@/services/vault/ethConfirmationGate";
import {
  activationFloorBlocksRemaining,
  activationFloorMinutesRemaining,
} from "@/utils/activationFloor";
import {
  ActivationNotPossibleError,
  isTerminalActivationError,
  isVaultRecordEmptyError,
  mapDepositError,
  type DepositErrorContent,
} from "@/utils/errors";
import { assertVaultCoreVersionSupported } from "@/utils/vaultCoreVersionSupport";

import { getVaultFromChainWithGrace } from "../../clients/eth-contract/btc-vault-registry/query";
import { ethClient } from "../../clients/eth-contract/client";
import { getOnChainPauseState } from "../../clients/eth-contract/pause-state/query";
import {
  getProtocolParamsReader,
  getVaultRegistryReader,
} from "../../clients/eth-contract/sdk-readers";
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
import { rebuildDepositTerms } from "../../services/vault/rebuildDepositTerms";
import { resolveFundedTxFeeAndUtxos } from "../../services/vault/resolveFundedTxFee";
import {
  activateVaultWithSecret,
  activateVaultWithSecretAndRedeem,
} from "../../services/vault/vaultActivationService";
import { utxosToExpectedRecord } from "../../services/vault/vaultPeginBroadcastService";
import { verifyResumeParticipantKeys } from "../../services/vault/verifyResumeParticipantKeys";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import {
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "../../utils/btc";

export interface BroadcastPrePeginParams {
  vaultId: Hex;
  /**
   * Connected wallet's ETH address. On the intent (Ledger) path the rebuild
   * asserts it equals the on-chain depositor before any device interaction —
   * a stale modal after a wallet switch must fail closed, not re-approve.
   */
  depositorEthAddress: string;
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
  /**
   * Escape hatch mode: call `activateVaultWithSecretAndRedeem` instead of
   * `activateVaultWithSecret`, revealing the secret and immediately redeeming
   * the vault for the depositor without application activation. Shares every
   * pre-reveal gate with the normal flow except the pause gate, which checks
   * only the protocol scope — an aave-scope pause is what this mode escapes.
   */
  redeemImmediately?: boolean;
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
  /**
   * Broadcast failure, already classified into user-facing copy. Mapped at the
   * catch site rather than stored as a string, so typed errors reach the
   * mapper with their prototype intact.
   */
  broadcastError: DepositErrorContent | null;
  /**
   * Live Ethereum confirmation depth while the finality gate holds a resume
   * broadcast. `null` outside that window — which is the overwhelmingly common
   * case, since a resumed deposit is usually long past the required depth.
   */
  ethConfirmationDetail: RegistrationDepthProgress | null;
  handleBroadcast: (params: BroadcastPrePeginParams) => Promise<void>;
  // Activation state
  activating: boolean;
  activationError: string | null;
  /** True when the activation failure is terminal (deadline passed) — no Retry. */
  activationErrorTerminal: boolean;
  handleActivation: (params: ActivateVaultParams) => Promise<void>;
}

/**
 * Custom hook for vault actions (broadcast)
 */
/**
 * Marks an activation abort caused by an unreadable activation floor. Carried on
 * `Error.name` rather than a shared flag so the catch block classifies the error
 * that actually propagated — see `onFloorReadFailure`.
 */
const FLOOR_UNAVAILABLE_ERROR_NAME = "ActivationFloorUnavailableError";

export function useVaultActions(): UseVaultActionsReturn {
  const gate = useProtocolGateState();

  // Broadcast state
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] =
    useState<DepositErrorContent | null>(null);
  const [ethConfirmationDetail, setEthConfirmationDetail] =
    useState<RegistrationDepthProgress | null>(null);

  // Activation state
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationErrorTerminal, setActivationErrorTerminal] = useState(false);

  // Track mount: both handleBroadcast and handleActivation await slow
  // on-chain work and then setState. The consumer (Resume*Content inside
  // the deposit modal) can unmount mid-flight; without this guard those
  // post-await setters fire on an unmounted component.
  const mountedRef = useRef(true);
  // Cancels an in-flight broadcast. `mountedRef` only suppresses setState — it
  // does not stop the flow, and the Ethereum finality gate can hold
  // `handleBroadcast` for ~1.6 min, which is ample time for the user to close
  // the modal. Without this the abandoned flow would carry on and raise a BTC
  // wallet popup with no UI behind it.
  const broadcastAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
      // Abort on real unmount only. StrictMode re-runs the effect synchronously
      // in the same task, so this microtask fires after the remount has already
      // set mountedRef back to true — matching useDepositFlow's abort seam.
      queueMicrotask(() => {
        if (!mountedRef.current) {
          broadcastAbortRef.current?.abort();
          broadcastAbortRef.current = null;
        }
      });
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
      depositorEthAddress,
      pendingPegin,
      updatePendingPeginStatus,
      removePendingPegin,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setBroadcasting(true);
    setBroadcastError(null);

    const abortController = new AbortController();
    broadcastAbortRef.current = abortController;
    const { signal } = abortController;

    try {
      // Fetch vault data from GraphQL
      const vault = await fetchVaultById(vaultId);

      if (!vault) {
        throw new Error("BTCVault not found. Please try again.");
      }

      if (vault.status !== ContractStatus.PENDING) {
        throw new Error(
          COPY.deposit.errors.cannotBroadcastInState(
            ContractStatus[vault.status],
          ),
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
      //
      // Uses the grace variant: this runs ahead of the finality gate below, so
      // unlike the reads after it, it gets no protection from the gate's own
      // empty-read tolerance. Resuming seconds after a registration is the
      // documented #1835 repro.
      const onChainVault = await getVaultFromChainWithGrace(vaultId, signal);
      // Fail closed before any signing when this build's WASM can't
      // construct the vault's stamped graph version (e.g. an old deployed
      // build resuming a vault registered after a protocol version bump).
      await assertVaultCoreVersionSupported(onChainVault.vaultCoreVersion);
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
          COPY.deposit.errors.cannotBroadcastInOnChainState(label),
        );
      }

      // Ethereum finality gate. Same rule as the inline deposit flow: the
      // Pre-PegIn must not be broadcast while the registration is still
      // reorg-exposed, or a reorg leaves the BTC locked in an HTLC whose vault
      // record no longer exists. Depth comes from `createdAt` (the ETH block
      // the registration mined at), which needs no transaction hash — the
      // reason this works on a cross-device resume with no local record.
      //
      // Deliberately ahead of the wallet-liveness probe and everything after
      // it: no popup, no UTXO read and no signing should happen for a deposit
      // we may refuse to broadcast.
      //
      // Runs unconditionally, with no "already deep enough" shortcut computed
      // from the `createdAt` read above. A shortcut would authorise the
      // broadcast from a vault reading taken several RPC round-trips earlier
      // and never look at the registry again; the wait re-reads live vault
      // state and hands back the observation the status check below uses. For
      // an already-final deposit — nearly every resume — it costs one extra
      // contract read and returns without polling or rendering a counter.
      let finalBasicInfo;
      try {
        ({ basicInfo: finalBasicInfo } = await waitForEthRegistrationDepth({
          vaultIds: [vaultId],
          // Publish only while the gate is actually holding. An already-final
          // deposit reports its (large) depth once on the way out, and
          // rendering that would flash a nonsensical "50000 of 8" counter.
          onProgress: (progress) => {
            if (progress.confirmations < progress.required) {
              setEthConfirmationDetail(progress);
            }
          },
          signal,
        }));
      } finally {
        if (mountedRef.current) setEthConfirmationDetail(null);
      }

      // The modal can be dismissed during a wait that spans minutes. Stop here
      // rather than surfacing a BTC wallet popup for a flow whose UI is gone.
      if (signal.aborted) return;

      // The PENDING gate above read pre-wait state and the wait can span
      // minutes. `prePeginTxHash` cannot go stale — vaultId commits to it, so
      // any re-mined registration under this id carries the same hash — but
      // `status` can, so re-assert it on the post-wait observation.
      if (finalBasicInfo.status !== OnChainBtcVaultStatus.PENDING) {
        const label =
          OnChainBtcVaultStatus[finalBasicInfo.status] ??
          `UNKNOWN(${finalBasicInfo.status})`;
        throw new Error(
          COPY.deposit.errors.cannotBroadcastInOnChainState(label),
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

      // The integrity guarantee for this broadcast is the on-chain
      // `prePeginTxHash` match asserted above: it commits to every input,
      // output, and script of the registered Pre-PegIn, so a match proves
      // `unsignedTxHex` is exactly the tx the contract registered — safe to
      // broadcast regardless of which offchain-params / signer-set versions
      // it was built against.
      //
      // When the local record supplies BOTH the tx we're broadcasting and its
      // build versions (the normal same-session path), additionally re-verify
      // those versions on-chain as defense-in-depth and drop the entry on a
      // confirmed mismatch. The versions are only meaningful when tied to the
      // local tx — if we fell back to the indexer's tx (`!localUnsignedTxHex`)
      // any stored versions are floating, so we don't trust them. When there
      // is no local anchor — cross-device resume, cleared storage, or a Safe
      // whose asynchronous ETH execution outlived the dApp tab so
      // `addPendingPegin` never ran — skip that redundant check and broadcast
      // on the strength of the hash match. Refusing here would strand a vault
      // that is provably safe to broadcast.
      const buildOffchainParamsVersion =
        pendingPegin?.buildOffchainParamsVersion;
      const buildAppVaultKeepersVersion =
        pendingPegin?.buildAppVaultKeepersVersion;
      const buildUniversalChallengersVersion =
        pendingPegin?.buildUniversalChallengersVersion;
      const buildVaultCoreVersion = pendingPegin?.buildVaultCoreVersion;
      if (
        localUnsignedTxHex &&
        buildOffchainParamsVersion !== undefined &&
        buildAppVaultKeepersVersion !== undefined &&
        buildUniversalChallengersVersion !== undefined &&
        buildVaultCoreVersion !== undefined
      ) {
        try {
          await verifyRegisteredVaultVersions({
            vaultRegistryReader: getVaultRegistryReader(),
            vaultIds: [vaultId],
            expectedOffchainParamsVersion: buildOffchainParamsVersion,
            expectedAppVaultKeepersVersion: buildAppVaultKeepersVersion,
            expectedUniversalChallengersVersion:
              buildUniversalChallengersVersion,
            expectedVaultCoreVersion: buildVaultCoreVersion,
          });
        } catch (err) {
          // Only a confirmed mismatch drops the entry — transient RPC
          // failures keep it so the user can retry. Mirrors the inline
          // deposit path's version-check cleanup in useDepositFlow.
          if (isRegisteredVaultVersionMismatchError(err)) {
            removePendingPegin?.(vaultId);
          }
          throw err;
        }
      }

      // RFC-006: the same guard the inline deposit path applies before
      // broadcast. Its only precondition is the stamp — a missing build
      // version says nothing about participant keys, so this sits outside the
      // version block rather than inheriting its conditions. Records written
      // before this shipped carry no stamp and skip the check.
      //
      // Deliberately NOT wrapped in the cleanup above: dropping the record on
      // drift would discard the stamp, and the next attempt would find no
      // local copy, fall back to the indexer's transaction, pass the
      // `prePeginTxHash` check — it is the registered transaction — and
      // broadcast the very Pre-PegIn this just refused. The hash proves the
      // transaction was not substituted; it does not prove the vault's frozen
      // epochs still resolve to the keys inside its scripts.
      if (pendingPegin?.buildParticipantOperationKeys) {
        await verifyResumeParticipantKeys({
          vaultId,
          expected: pendingPegin.buildParticipantOperationKeys,
        });
      }

      // Intent (Ledger) resume: rebuild the DepositTerms from chain + WASM and
      // run the derive→approve ceremony before signing. Prevouts are resolved
      // once, mempool-only (never the local cache), so the fee the device
      // approves is the fee the broadcast signs. Software wallets unchanged.
      if (supportsDepositApproval(btcWalletProvider)) {
        const { expectedUtxos: resolvedUtxos, fundedTxFee } =
          await resolveFundedTxFeeAndUtxos(unsignedTxHex);
        const depositTerms = await rebuildDepositTerms({
          vaultId,
          target: onChainVault,
          fundedPrePeginTxHex: unsignedTxHex,
          connectedDepositorAddress: depositorEthAddress as Hex,
          depositorBtcPubkey,
          fundedTxFee,
          lifecycle: "broadcast",
        });
        // Last cancellation point before the wallet signs. Several network
        // round-trips (UTXO availability, version/key re-checks, and on the
        // intent path the terms rebuild) sit between the finality gate and
        // here, and the modal can be dismissed during any of them. Past this
        // line the flow is committed: aborting mid-signature would leave the
        // device ceremony half-run for no benefit.
        if (signal.aborted) return;

        await broadcastPrePeginTransaction({
          unsignedTxHex,
          btcWalletProvider: {
            signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
            ...forwardDeriveContextHash(btcWalletProvider),
            ...forwardDepositApproval(btcWalletProvider),
          },
          depositorBtcPubkey,
          expectedUtxos: resolvedUtxos,
          depositTerms,
        });
      } else {
        // Use the locally stored UTXO set as trusted construction-time data
        // ONLY when we're broadcasting the local tx. The stored UTXOs are the
        // inputs of the local tx, not necessarily of the indexer's tx, so when
        // we fell back to the indexer copy (`!localUnsignedTxHex`) we must pass
        // `undefined` and let `broadcastPrePeginTransaction` resolve inputs from
        // the mempool. `createPsbtFromTransaction` throws if `expectedUtxos` is
        // supplied but doesn't cover every input, so a stale/partial local set
        // paired with the indexer tx would dead-end the broadcast.
        const expectedUtxos =
          localUnsignedTxHex && pendingPegin?.selectedUTXOs?.length
            ? utxosToExpectedRecord(pendingPegin.selectedUTXOs)
            : undefined;
        // Last cancellation point before the wallet signs. Several network
        // round-trips (UTXO availability, version/key re-checks, and on the
        // intent path the terms rebuild) sit between the finality gate and
        // here, and the modal can be dismissed during any of them. Past this
        // line the flow is committed: aborting mid-signature would leave the
        // device ceremony half-run for no benefit.
        if (signal.aborted) return;

        await broadcastPrePeginTransaction({
          unsignedTxHex,
          btcWalletProvider: {
            signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
          },
          depositorBtcPubkey,
          expectedUtxos,
        });
      }

      const nextStatus = getNextLocalStatus(
        PeginAction.SIGN_AND_BROADCAST_TO_BITCOIN,
      );

      if (updatePendingPeginStatus && nextStatus) {
        updatePendingPeginStatus(vaultId, nextStatus);
      }

      // The broadcast.succeeded milestone is emitted by the caller
      // (useBroadcastState), which owns the full batchVaultIds set — one
      // Pre-PegIn tx confirms every sibling, and this single-vault primitive
      // cannot see them.

      // Show success modal and refetch
      onShowSuccessModal();
      onRefetchActivities();

      if (mountedRef.current) setBroadcasting(false);
    } catch (err) {
      if (mountedRef.current) {
        // Classify here, while the typed error is still intact — the same seam
        // useDepositFlow uses. Flattening to `err.message` first would strip
        // the prototype and name that every `instanceof` branch in the mapper
        // narrows on, silently downgrading precise errors to message matching:
        // a finality-gate timeout would land in the "broadcast failed" bucket
        // and tell the user their Bitcoin broadcast failed when nothing was
        // ever sent.
        setBroadcastError(mapDepositError(err));
        // Mapping replaces the raw message with friendly copy, and only the
        // fallback branch carries `diagnostics`. Log the original so a mapped
        // failure is still diagnosable — `useBroadcastState`'s catch cannot do
        // it, because this function resolves rather than rethrowing.
        logger.error(err instanceof Error ? err : new Error(String(err)), {
          tags: { vaultId: shortId(vaultId) },
          data: { context: "Resume broadcast failed" },
        });
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
      redeemImmediately,
      pendingPegin,
      updatePendingPeginStatus,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    // Both modes reveal the secret, so both are EXITs guarded before the
    // reveal — but with different scopes: normal activation delegates into the
    // Aave adapter and blocks when EITHER scope is paused, while the
    // activate-and-redeem escape hatch never touches the adapter and blocks
    // only on a protocol-scope pause (an aave pause is what it escapes). Both
    // are preserved under Freeze (time-critical — a depositor with BTC locked
    // must still be able to exit). Guard the chokepoint behind the disabled
    // button; never reveal the secret on-chain while paused. Surface a paused
    // error (rather than a silent return) so the caller's spinner clears via
    // `!activationError` and the user gets feedback. A fresh on-chain re-check
    // below closes the stale-gate window.
    const isRevealBlocked = redeemImmediately
      ? isActivateAndRedeemBlocked
      : isActivationBlocked;
    const pausedMessage = redeemImmediately
      ? COPY.pegin.activateAndRedeemPaused
      : COPY.pegin.activationPaused;
    if (isRevealBlocked(gate)) {
      setActivationError(pausedMessage);
      return;
    }

    setActivating(true);
    setActivationError(null);
    setActivationErrorTerminal(false);

    // Telemetry discriminators for the catch below. `expectedInterruption`
    // marks the self-resolving pre-reveal states (protocol pause, the
    // indexer-lag non-VERIFIED race) that surface to the user but are routine,
    // not reveal failures. `revealed` flips once the secret reveal has landed
    // on-chain — anything thrown after that is post-success bookkeeping, and
    // capturing it as activation.reveal would report a failure for an
    // activation that succeeded.
    let expectedInterruption = false;
    let revealed = false;

    try {
      // Read basic + protocol info in one parallel call. Indexer is
      // untrusted for signing-critical reads, so both come from on-chain.
      // `getVaultData` already throws if the vault is missing on-chain
      // (empty `depositorSignedPeginTx`), so no separate existence check
      // is needed here. Parallel reads also narrow the gap between the
      // status check and the contract write (the actual TOCTOU window
      // for the secret-leak failure mode this hook guards against).
      const reader = getVaultRegistryReader();
      // Read the vault data AND a FRESH pause state in parallel. The cached
      // `gate` can be ~20s stale; the secret must never reach `activateVault`
      // calldata if the protocol paused in that window. A failed pause read
      // falls back to the cached gate (activation is time-critical — an RPC
      // blip must not trap a depositor whose activation deadline is near).
      // The delay read is deliberately NOT `.catch`-ed like the pause read
      // below: an unreadable delay must reject rather than fall through,
      // because proceeding would put the secret into `simulateContract`
      // calldata for a call the contract will refuse. The block-number read
      // is the exception — delay 0 disables the floor, so a `getBlockNumber`
      // blip must not abort that path; a missing block with delay > 0 still
      // aborts below. Skipped entirely when the feature is off — the getter
      // does not exist on every deployment yet.
      // Redeem path is exempt from the floor (see the check below), so it does
      // not need these reads either.
      const floorEnabled =
        FeatureFlags.isActivationDelayEnabled && !redeemImmediately;
      // Re-throws (so the gate still fails closed) but re-labels first: an
      // unreadable window is an expected interruption, not a reveal failure.
      // Without this the `activation.reveal` funnel counts every click on a
      // misconfigured environment as a failed reveal, and the depositor sees
      // raw viem text instead of copy we own.
      const onFloorReadFailure = (cause: unknown): never => {
        // Deliberately does NOT set `expectedInterruption` here. This runs in a
        // `.catch` on a sibling of the `Promise.all` below, and `Promise.all`
        // settles on the FIRST rejection — so a slower floor read could flip
        // the flag for a `getVaultData` failure that has nothing to do with the
        // floor, suppressing a real reveal failure from telemetry. The tag is
        // read in the catch block, where the error that actually propagated is
        // the one being classified.
        const err = new Error(COPY.pegin.messages.activationWindowUnavailable, {
          cause,
        });
        err.name = FLOOR_UNAVAILABLE_ERROR_NAME;
        throw err;
      };
      const [
        { basic: basicInfo, protocol: protocolInfo },
        freshPauseState,
        currentBlock,
        peginActivationDelay,
      ] = await Promise.all([
        reader.getVaultData(vaultId),
        getOnChainPauseState().catch(() => null),
        // `cacheTime: 0` because viem caches getBlockNumber for ~4s by
        // default; a stale-behind head inflates the remaining count and can
        // gate a window that is actually open.
        // Block number is only required when the delay is non-zero. Catching
        // to `undefined` (instead of aborting the whole `Promise.all`) lets a
        // delay of 0 proceed even if `getBlockNumber` blips — delay 0 must
        // never gate. A missing block with delay > 0 still aborts below.
        floorEnabled
          ? ethClient
              .getPublicClient()
              .getBlockNumber({ cacheTime: 0 })
              .catch(() => undefined)
          : Promise.resolve(undefined),
        floorEnabled
          ? getProtocolParamsReader()
              .then((r) => r.getPeginActivationDelay())
              .catch(onFloorReadFailure)
          : Promise.resolve(undefined),
      ]);

      const effectiveGate = freshPauseState
        ? composeGateState(freshPauseState)
        : gate;
      if (isRevealBlocked(effectiveGate)) {
        // Same user-visible outcome as the cached-gate early return above —
        // operator action, not a depositor failure, so telemetry stays quiet
        // on both paths.
        expectedInterruption = true;
        throw new Error(pausedMessage);
      }

      if (!protocolInfo.hashlock || protocolInfo.hashlock === "0x") {
        throw new Error(
          "BTCVault hashlock not found. The BTCVault may not support activation.",
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
        const message = COPY.deposit.errors.cannotActivateInState(label);
        // EXPIRED is terminal — retrying can't revert the status to VERIFIED.
        // Other non-VERIFIED states (e.g. still-PENDING verification) stay
        // retryable, so only EXPIRED suppresses Retry.
        if (basicInfo.status === OnChainBtcVaultStatus.EXPIRED) {
          throw new ActivationNotPossibleError(message);
        }
        // The retryable branch exists to absorb the indexer-lag race above;
        // it is likely the most common landing in the catch and would inflate
        // the activation.reveal rate. EXPIRED stays captured — a genuine
        // dead-end, not a transient.
        expectedInterruption = true;
        throw new Error(message);
      }

      // Activation floor, re-checked on fresh reads immediately before the
      // secret is used. The dashboard gate can be up to a poll interval stale,
      // and `peginActivationDelay` is governance-mutable and read live by the
      // registry, so a raise between render and click would otherwise reach
      // simulation. Retryable: the floor clears purely by waiting.
      //
      // NOT applied to the redeem path. `_requireActivationDelayElapsed` guards
      // `activateVaultWithSecret` only; `activateVaultWithSecretAndRedeem` is
      // deliberately exempt on-chain because it mints no vaultBTC and invokes
      // no adapter callback. Gating it here would block the escape hatch the
      // "Activation incomplete" state advertises as the way to recover BTC —
      // for a contract call that would have succeeded.
      if (floorEnabled) {
        // Shaped so the absence of a value ABORTS rather than skips. Unreachable
        // today for the delay (a failed read rejects above), but the gate must
        // not quietly become fail-open if a future reader returns undefined
        // instead of throwing where the getter is missing.
        if (peginActivationDelay === undefined) {
          // `throw` at the call site: TS does not narrow through a
          // `never`-returning arrow held in a const.
          throw onFloorReadFailure(
            new Error("activation floor inputs missing after a settled read"),
          );
        }
        // Delay of 0 disables the floor: do not require block/`verifiedAt`.
        if (peginActivationDelay !== 0n) {
          if (currentBlock === undefined || protocolInfo.verifiedAt === 0n) {
            throw onFloorReadFailure(
              new Error("activation floor inputs missing after a settled read"),
            );
          }
          const blocksRemaining = activationFloorBlocksRemaining({
            currentBlock,
            verifiedAt: protocolInfo.verifiedAt,
            peginActivationDelay,
          });
          if (blocksRemaining > 0) {
            expectedInterruption = true;
            throw new Error(
              COPY.pegin.messages.activationWindowNotOpen(
                blocksRemaining,
                activationFloorMinutesRemaining(blocksRemaining),
              ),
            );
          }
        }
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

      // Reveal the secret on the contract — the normal activation or, in
      // escape-hatch mode, activate-and-redeem. Hashlock is forwarded so the
      // SDK re-checks `sha256(secret) === hashlock` as the last gate before
      // calldata is assembled.
      const revealSecretOnChain = redeemImmediately
        ? activateVaultWithSecretAndRedeem
        : activateVaultWithSecret;
      await revealSecretOnChain({
        vaultId: ensureHexPrefix(vaultId),
        secret: ensureHexPrefix(secretHex),
        hashlock: ensureHexPrefix(protocolInfo.hashlock) as Hex,
        walletClient,
      });
      revealed = true;

      // Cross-device resume has no `pendingPegin`; fall back to the
      // contract-authoritative signed pegin tx so the entry doesn't leak.
      const peginTxidForRelease = pendingPegin?.peginTxHash
        ? stripHexPrefix(pendingPegin.peginTxHash)
        : stripHexPrefix(
            calculateBtcTxHash(protocolInfo.depositorSignedPeginTx),
          );
      vpTokenRegistry.release(peginTxidForRelease);

      // Update localStorage status
      const nextStatus = getNextLocalStatus(
        redeemImmediately
          ? PeginAction.ACTIVATE_AND_REDEEM
          : PeginAction.ACTIVATE_VAULT,
      );
      if (pendingPegin && updatePendingPeginStatus && nextStatus) {
        updatePendingPeginStatus(vaultId, nextStatus);
      }

      logger.event(TELEMETRY_EVENT.ACTIVATION_ACTIVATED, {
        level: "info",
        category: "activation",
        tags: {
          vaultId: shortId(vaultId),
          // Present only on the escape hatch so existing activation events
          // keep their exact shape.
          ...(redeemImmediately ? { redeem: "true" } : {}),
        },
      });

      // Show success and refetch
      onShowSuccessModal();
      onRefetchActivities();

      if (mountedRef.current) setActivating(false);
    } catch (err) {
      // Capture regardless of mount — activation has no abort signal, so a real
      // reveal failure is worth knowing even if the modal closed mid-flight.
      // This is the only place the error is caught: handleActivation never
      // rethrows, so a capture in any caller's catch would be unreachable.
      // Skipped for expected pre-reveal interruptions and for anything thrown
      // after the reveal landed on-chain — either would count a non-failure
      // against the activation.reveal rate.
      // A floor read that could not complete is an expected interruption, but
      // only when it is the error that actually surfaced.
      const floorUnavailable =
        err instanceof Error && err.name === FLOOR_UNAVAILABLE_ERROR_NAME;
      if (!expectedInterruption && !floorUnavailable && !revealed) {
        captureFunnelFailure(TELEMETRY_STAGE.ACTIVATION_REVEAL, err, vaultId);
      }
      if (mountedRef.current) {
        const rawMessage =
          err instanceof Error ? err.message : "Failed to activate BTC Vault";
        // Normalize the empty-record error so we don't leak the raw vault id
        // into the UI, and don't claim the vault is gone when a lagging RPC
        // node is the likelier cause.
        const errorMessage = isVaultRecordEmptyError(err)
          ? COPY.deposit.errors.vaultRegistrationNotYetVisible.body
          : rawMessage;
        setActivationError(errorMessage);
        // Classify from the typed error before it is flattened to a string — a
        // passed deadline or an already-EXPIRED vault is terminal (no Retry).
        setActivationErrorTerminal(isTerminalActivationError(err));
        setActivating(false);
      }
    }
  };

  return {
    broadcasting,
    broadcastError,
    ethConfirmationDetail,
    handleBroadcast,
    activating,
    activationError,
    activationErrorTerminal,
    handleActivation,
  };
}
