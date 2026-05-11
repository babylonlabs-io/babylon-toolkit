/**
 * Deposit Flow Hook
 *
 * Orchestrates the batch-first deposit flow. A single vault is just a batch of 1.
 * Creates ONE Pre-PegIn BTC transaction with N HTLC outputs (one per vault) and
 * registers them all atomically on Ethereum via submitPeginRequestBatch().
 *
 * Flow:
 * 0. Validation — check wallets, UTXOs, pubkeys, array alignment
 * 1. Get shared resources (ETH wallet client)
 * 2. Prepare pegin via SDK orchestrator (sizing pass + wallet root popup +
 *    per-vault WOTS / hashlock derivation + commit pass with batch PSBT signing).
 *    Returns broadcast-ready Pre-PegIn + per-vault derived secrets.
 * 3a. Sign BIP-322 proof-of-possession (one wallet popup per deposit session)
 * 3b. Build batch request array (recompute hashlocks from returned secrets)
 * 3c. Re-check UTXO availability before committing to ETH
 * 3d. Batch ETH registration (single submitPeginRequestBatch tx for all vaults)
 * 3e. Build pegin results from batch response
 * 4a. Save pending pegins to localStorage (PENDING status, reserves UTXOs)
 * 4b. Broadcast Pre-PegIn transaction to Bitcoin, update status to CONFIRMING
 * 5. Submit WOTS keys, poll VP, sign payout transactions
 * 6. Download vault artifacts (per vault, user-driven)
 * 7. Wait for contract verification, then activate vaults (reveal HTLC secret)
 *
 * ETH registration is atomic: submitPeginRequestBatch registers all vaults in a
 * single transaction, so either all succeed or all fail. If it fails, the Pre-PegIn
 * is NOT broadcast, so no BTC gets locked in unregistered HTLC outputs.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  primeVpTokenRegistry,
  VpResponseValidationError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { computeHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import {
  collectReservedUtxoRefs,
  selectUtxosForDeposit,
} from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import { getOffchainParamsVersionsFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import { fetchVaultsByDepositorStrict } from "@/services/vault/fetchVaults";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import {
  broadcastPrePeginTransaction,
  utxosToExpectedRecord,
} from "@/services/vault/vaultPeginBroadcastService";
import { preparePeginTransaction } from "@/services/vault/vaultTransactionService";
import { assertUtxosAvailable } from "@/services/vault/vaultUtxoValidationService";
import {
  addPendingPegin,
  addUtxoReservation,
  getPendingPegins,
  getUtxoReservations,
  removeUtxoReservation,
  updatePendingPeginStatus,
} from "@/storage/peginStorage";
import type { Vault } from "@/types/vault";
import { btcAddressToScriptPubKeyHex, stripHexPrefix } from "@/utils/btc";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { sanitizeErrorMessage } from "@/utils/errors/formatting";
import { formatBtcValue } from "@/utils/formatting";
import { getVpProxyUrl } from "@/utils/rpc";

import {
  DepositFlowStep,
  getEthWalletClient,
  registerPeginBatchAndWait,
  signAndSubmitPayouts,
  signProofOfPossession,
  submitWotsPublicKey,
  type DepositUtxo,
} from "./depositFlowSteps";
import { useBtcWalletState } from "./useBtcWalletState";
import { useVaultProviders } from "./useVaultProviders";

// ============================================================================
// Types
// ============================================================================

export interface UseDepositFlowParams {
  /** Vault amounts in satoshis - [amount1] for single vault, [amount1, amount2] for two vaults */
  vaultAmounts: bigint[];
  /** Mempool fee rate in sat/vB for UTXO selection and funding */
  mempoolFeeRate: number;
  /** Bitcoin wallet provider */
  btcWalletProvider: BitcoinWallet | null;
  /** Depositor's Ethereum address */
  depositorEthAddress: Address | undefined;
  /** Selected application controller address */
  selectedApplication: string;
  /** Selected vault provider addresses */
  selectedProviders: string[];
  /** Vault provider BTC public key (x-only, 64 hex chars) */
  vaultProviderBtcPubkey: string;
  /** Vault keeper BTC public keys */
  vaultKeeperBtcPubkeys: string[];
  /** Universal challenger BTC public keys */
  universalChallengerBtcPubkeys: string[];
}

export interface ArtifactDownloadInfo {
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
  vaultId: string;
}

export interface UseDepositFlowReturn {
  /** Execute the batch deposit flow */
  executeDeposit: () => Promise<MultiVaultDepositResult | null>;
  /** Cancel the running flow (e.g. when the user closes the modal) */
  abort: () => void;
  /** Current step in the deposit flow */
  currentStep: DepositFlowStep;
  /** Current vault being processed (0 or 1), null if not processing a vault */
  currentVaultIndex: number | null;
  /** Whether the flow is currently processing */
  processing: boolean;
  /** Error message if any step failed */
  error: string | null;
  /** Whether currently waiting for external action (e.g., wallet signature) */
  isWaiting: boolean;
  /** Payout signing progress (X of Y signings) */
  payoutSigningProgress: PayoutSigningProgress | null;
  /** Artifact download info (when set, the UI should show the download modal) */
  artifactDownloadInfo: ArtifactDownloadInfo | null;
  /** Callback to continue the flow after artifact download */
  continueAfterArtifactDownload: () => void;
}

export interface PeginCreationResult {
  /** Vault index (0 or 1) */
  vaultIndex: number;
  /** Derived vault ID: keccak256(abi.encode(peginTxHash, depositor)) */
  vaultId: Hex;
  /** Raw BTC pegin transaction hash (for VP RPC operations) */
  peginTxHash: Hex;
  /** Ethereum transaction hash */
  ethTxHash: Hex;
  /** Funded Pre-PegIn tx hex — this is the tx the depositor signs and broadcasts */
  fundedPrePeginTxHex: string;
  /** PegIn tx hex — the vault transaction derived from the Pre-PegIn */
  peginTxHex: string;
  /** UTXOs used in the pegin */
  selectedUTXOs: DepositUtxo[];
  /** Transaction fee in satoshis */
  fee: bigint;
  /** Depositor's BTC public key (x-only) */
  depositorBtcPubkey: string;
}

export interface MultiVaultDepositResult {
  /** Array of pegin results (one per vault) */
  pegins: PeginCreationResult[];
  /** Batch ID linking the vaults */
  batchId: string;
  /** Warning messages for background operation failures (payout signing, broadcast) */
  warnings?: string[];
}

// ============================================================================
// Main Hook
// ============================================================================

export function useDepositFlow(
  params: UseDepositFlowParams,
): UseDepositFlowReturn {
  const {
    vaultAmounts,
    mempoolFeeRate,
    btcWalletProvider,
    depositorEthAddress,
    selectedApplication,
    selectedProviders,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = params;

  // State
  const [currentStep, setCurrentStep] = useState<DepositFlowStep>(
    DepositFlowStep.DERIVE_VAULT_SECRET,
  );
  const [currentVaultIndex, setCurrentVaultIndex] = useState<number | null>(
    null,
  );
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [payoutSigningProgress, setPayoutSigningProgress] =
    useState<PayoutSigningProgress | null>(null);
  const [artifactDownloadInfo, setArtifactDownloadInfo] =
    useState<ArtifactDownloadInfo | null>(null);

  const artifactResolverRef = useRef<(() => void) | null>(null);

  const continueAfterArtifactDownload = useCallback(() => {
    setArtifactDownloadInfo(null);
    artifactResolverRef.current?.();
    artifactResolverRef.current = null;
  }, []);

  // Abort controller for cancelling the flow
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    artifactResolverRef.current?.();
    artifactResolverRef.current = null;
  }, []);

  // Abort on real unmount (route change, browser back) but survive StrictMode
  // double-mount. StrictMode re-runs the effect synchronously in the same task,
  // so the microtask fires after remount has set mountedRef back to true.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (!mountedRef.current) {
          abort();
        }
      });
    };
  }, [abort]);

  // Hooks
  const { btcAddress, spendableUTXOs, isUTXOsLoading, utxoError } =
    useBtcWalletState();
  const { findProvider } = useVaultProviders(selectedApplication);
  const { config, timelockPegin, timelockRefund, minDeposit, maxDeposit } =
    useProtocolParamsContext();

  // ============================================================================
  // Main Execution Function
  // ============================================================================

  const executeDeposit =
    useCallback(async (): Promise<MultiVaultDepositResult | null> => {
      // Create a new AbortController for this flow execution
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;

      setProcessing(true);
      setError(null);
      setCurrentStep(DepositFlowStep.DERIVE_VAULT_SECRET);

      // Track background operation failures
      const warnings: string[] = [];

      // Declared outside try so the catch block can clean up the early
      // UTXO reservation if the flow fails after writing it.
      let reservationBatchId: string | null = null;
      let reservationEthAddress: string | null = null;
      // True once `registerPeginBatchAndWait` has been invoked, meaning the
      // SDK may have submitted the ETH registration tx. Used in the catch
      // path to avoid releasing the early UTXO reservation before we know
      // whether the registration landed on-chain.
      let registrationStarted = false;
      // True once durable per-vault `addPendingPegin` records have been
      // persisted. Once set, the early reservation is fully superseded and
      // safe to remove on failure.
      let pendingPersisted = false;
      // Track registry entries we primed so we can release them on
      // user-cancel (bound `authAnchorHex` lifetime to the flow).
      const primedRegistryTxids: string[] = [];

      try {
        // ========================================================================
        // Step 0: Validation
        // ========================================================================

        if (isUTXOsLoading) {
          throw new Error("Loading UTXOs...");
        }
        if (utxoError) {
          throw new Error(`Failed to load UTXOs: ${utxoError.message}`);
        }

        if (!spendableUTXOs) {
          throw new Error(
            "Spendable UTXOs unavailable after loading completed",
          );
        }

        validateMultiVaultDepositInputs({
          btcAddress,
          depositorEthAddress,
          vaultAmounts,
          selectedProviders,
          confirmedUTXOs: spendableUTXOs,
          vaultProviderBtcPubkey,
          vaultKeeperBtcPubkeys,
          universalChallengerBtcPubkeys,
          minDeposit,
          maxDeposit,
        });

        // After validation, these values are guaranteed to be defined
        if (!btcAddress || !depositorEthAddress || !btcWalletProvider) {
          throw new Error("BTC or ETH wallet not connected");
        }
        const confirmedBtcAddress = btcAddress;
        const confirmedEthAddress = depositorEthAddress;
        const confirmedBtcWallet = btcWalletProvider;

        // Extract primary provider (current implementation supports single provider only)
        const primaryProvider = selectedProviders[0] as Address;

        // Generate batch ID for tracking
        const batchId = uuidv4();

        // ========================================================================
        // Step 1: Get shared resources
        // ========================================================================

        // Get ETH wallet client once (chain switch + wallet client are reusable)
        const walletClient = await getEthWalletClient(confirmedEthAddress);

        // ========================================================================
        // Step 2: Create Batch Pre-PegIn (all vaults in one BTC tx)
        // ========================================================================

        setCurrentStep(DepositFlowStep.DERIVE_VAULT_SECRET);
        const phaseTrackingBtcWallet: typeof confirmedBtcWallet = {
          ...confirmedBtcWallet,
          deriveContextHash: (appName, context) => {
            setCurrentStep(DepositFlowStep.DERIVE_VAULT_SECRET);
            return confirmedBtcWallet.deriveContextHash(appName, context);
          },
          signPsbt: (psbtHex, opts) => {
            setCurrentStep(DepositFlowStep.SIGN_PEGIN_BTC);
            return confirmedBtcWallet.signPsbt(psbtHex, opts);
          },
          ...(confirmedBtcWallet.signPsbts
            ? {
                signPsbts: (psbtHexes, opts) => {
                  setCurrentStep(DepositFlowStep.SIGN_PEGIN_BTC);
                  return confirmedBtcWallet.signPsbts!(psbtHexes, opts);
                },
              }
            : {}),
        };

        // Filter out UTXOs reserved by in-flight deposits to prevent
        // double-spend failures across concurrent sessions/tabs and across
        // browser contexts (cleared storage, second profile, second device).
        // Local browser state covers the same-context case; the indexer-supplied
        // vault list covers the cross-context case where localStorage is empty
        // but a PENDING/VERIFIED vault is already registered on Ethereum.
        // Force a fresh read here (do NOT rely on the React Query cache) so
        // staleness cannot reintroduce the cross-context double-spend window.
        // Indexer unavailability is fail-closed: better to block the deposit
        // than to silently skip the on-chain reservation set.
        const pendingPegins = getPendingPegins(confirmedEthAddress);
        const utxoReservations = getUtxoReservations(confirmedEthAddress);
        let depositorVaults: Vault[];
        try {
          depositorVaults =
            await fetchVaultsByDepositorStrict(confirmedEthAddress);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(err instanceof Error ? err : new Error(errorMsg), {
            tags: {
              component: "useDepositFlow",
              phase: "reservation-fetch",
            },
            data: { ethAddress: confirmedEthAddress },
          });
          throw new Error(
            `Unable to verify existing deposits. Please try again. (${errorMsg})`,
          );
        }
        const reservedUtxoRefs = collectReservedUtxoRefs({
          vaults: depositorVaults,
          pendingPegins,
          utxoReservations,
        });
        const availableUTXOs = selectUtxosForDeposit({
          availableUtxos: spendableUTXOs,
          reservedUtxoRefs,
          requiredAmount: vaultAmounts.reduce((sum, a) => sum + a, 0n),
          feeRate: mempoolFeeRate,
        });

        const batchResult = await preparePeginTransaction(
          phaseTrackingBtcWallet,
          walletClient,
          {
            pegInAmounts: vaultAmounts,
            protocolFeeRate: config.offchainParams.feeRate,
            mempoolFeeRate,
            changeAddress: confirmedBtcAddress,
            vaultProviderBtcPubkey,
            vaultKeeperBtcPubkeys,
            universalChallengerBtcPubkeys,
            timelockPegin,
            timelockRefund,
            councilQuorum: config.offchainParams.councilQuorum,
            councilSize: config.offchainParams.securityCouncilKeys.length,
            availableUTXOs,
          },
        );
        const {
          perVaultWotsKeys,
          wotsPkHashes,
          htlcSecretHexes,
          authAnchorHex,
        } = batchResult;

        // Reserve UTXOs in localStorage immediately so other tabs see them
        // during the (potentially lengthy) PoP signing and ETH registration.
        // Cleaned up after pending pegin entries are written, or on failure.
        reservationBatchId = batchId;
        reservationEthAddress = confirmedEthAddress;
        addUtxoReservation(confirmedEthAddress, {
          unsignedTxHex: batchResult.fundedPrePeginTxHex,
          timestamp: Date.now(),
          batchId,
        });

        // ========================================================================
        // Step 3: Sign PoP + batch register all vaults on Ethereum
        // ========================================================================

        // 3b. Sign PoP during SIGN_POP so the wallet popup is associated
        // with this step, not the following SUBMIT_PEGIN.
        setCurrentStep(DepositFlowStep.SIGN_POP);
        const popSignature = await signProofOfPossession(
          confirmedBtcWallet,
          walletClient,
        );

        // Guard: the BTC pubkey used for WOTS derivation (in preparePegin)
        // must match the pubkey that signed the PoP. A mismatch means the
        // wallet account changed between the two steps — registering would
        // bind WOTS keys to one identity and the PoP to another, making the
        // vault unactivatable.
        if (
          popSignature.depositorBtcPubkey !== batchResult.depositorBtcPubkey
        ) {
          throw new Error(
            "BTC wallet account changed during deposit flow. " +
              "The signing key no longer matches the key used for vault setup. " +
              "Please restart the deposit.",
          );
        }

        // 3c. Build batch request array.
        const batchRequests = batchResult.perVault.map((vault, i) => ({
          depositorSignedPeginTx: vault.peginTxHex,
          hashlock: computeHashlock(ensureHexPrefix(htlcSecretHexes[i])) as Hex,
          htlcVout: vault.htlcVout,
          depositorPayoutBtcAddress: confirmedBtcAddress,
          depositorWotsPkHash: wotsPkHashes[i],
        }));

        // 3d. Re-check UTXO availability before committing to ETH registration.
        // This catches the common case where UTXOs were spent during the
        // (potentially lengthy) PoP signing step. It does not eliminate the
        // race entirely — UTXOs could still be spent between this check and
        // the BTC broadcast — but it prevents the most likely failure mode.
        await assertUtxosAvailable(
          batchResult.fundedPrePeginTxHex,
          confirmedBtcAddress,
        );

        // 3e. Single batch ETH transaction for all vaults.
        setCurrentStep(DepositFlowStep.SUBMIT_PEGIN);
        // Mark registration as started BEFORE the SDK call. From this point
        // forward the ETH tx may be in the mempool or mined even if the call
        // throws (e.g. `waitForTransactionReceipt` timeout after
        // `sendTransaction` returned). The catch path uses this flag to keep
        // the early UTXO reservation in place so the same outpoints cannot
        // back a second deposit while the registration outcome is unknown.
        registrationStarted = true;
        const batchRegistration = await registerPeginBatchAndWait({
          btcWalletProvider: confirmedBtcWallet,
          walletClient,
          vaultProviderAddress: primaryProvider,
          unsignedPrePeginTx: batchResult.fundedPrePeginTxHex,
          requests: batchRequests,
          popSignature,
        });

        // 3f. Build pegin results from batch response
        const peginResults: PeginCreationResult[] =
          batchRegistration.vaults.map((vault, i) => ({
            vaultIndex: i,
            vaultId: vault.vaultId,
            peginTxHash: vault.peginTxHash,
            ethTxHash: batchRegistration.ethTxHash,
            fundedPrePeginTxHex: batchResult.fundedPrePeginTxHex,
            peginTxHex: batchResult.perVault[i].peginTxHex,
            selectedUTXOs: batchResult.selectedUTXOs,
            fee: batchResult.fee,
            depositorBtcPubkey: batchResult.depositorBtcPubkey,
          }));

        // ========================================================================
        // Step 4a: Persist pending pegins BEFORE broadcast and before any
        // further network calls. Saved immediately after ETH registration so
        // the selected UTXOs are reserved and a resume entry exists even if
        // the version check (3g) or broadcast fails. Status is PENDING (not
        // CONFIRMING) — the resume flow will show a "Broadcast" button for
        // these entries. This prevents two failure modes:
        // 1. A failed broadcast leaving no localStorage record, causing UTXOs
        //    to be reused in a new deposit.
        // 2. A transient RPC error during the on-chain version check (3g)
        //    leaving an ETH-registered vault with no localStorage entry,
        //    silently orphaning it.
        // ========================================================================

        for (const peginResult of peginResults) {
          const vaultAmount = vaultAmounts[peginResult.vaultIndex];

          if (vaultAmount === undefined) {
            logger.error(
              new Error("[Multi-Vault] Invalid vault index for vault"),
              {
                data: {
                  vaultIndex: peginResult.vaultIndex,
                  vaultId: peginResult.vaultId,
                },
              },
            );
            continue;
          }

          addPendingPegin(confirmedEthAddress, {
            id: peginResult.vaultId,
            peginTxHash: peginResult.peginTxHash,
            depositorBtcPubkey: peginResult.depositorBtcPubkey,
            amount: formatBtcValue(satoshiToBtcNumber(vaultAmount)),
            providerIds: [primaryProvider],
            applicationEntryPoint: selectedApplication,
            batchId,
            batchIndex: peginResult.vaultIndex + 1,
            batchTotal: vaultAmounts.length,
            status: LocalStorageStatus.PENDING,
            unsignedTxHex: peginResult.fundedPrePeginTxHex,
            selectedUTXOs: peginResult.selectedUTXOs.map((u) => ({
              txid: u.txid,
              vout: u.vout,
              value: String(u.value),
              scriptPubKey: u.scriptPubKey,
            })),
          });
          // At least one durable pending-pegin record now covers the
          // same UTXOs as the early reservation (all vaults in a batch
          // share `batchResult.selectedUTXOs`), so any subsequent failure
          // can safely release the reservation. Set inside the loop so
          // the flag is never `true` with zero records written.
          pendingPersisted = true;
        }

        // 3g. Verify the on-chain vault was registered under the same offchain
        // params version we used to build the BTC scripts. submitPeginRequestBatch
        // does not accept an expected version, so the contract snapshots the
        // latest version at inclusion time. If governance or an authorized update
        // changed the latest version between context fetch and tx inclusion, the
        // BTC scripts (timelocks, council quorum, signer set) will not match the
        // on-chain record. Aborting before broadcast keeps BTC unspent - the
        // user's registered ETH vault times out per protocol rules.
        //
        // Runs AFTER step 4a so an RPC failure here doesn't orphan the
        // ETH-registered vault: localStorage already has a PENDING entry the
        // user can resume from.
        //
        // Reads only `offchainParamsVersion` for all vaults in a single
        // multicall (one RPC round-trip, one read per vault) instead of fanning
        // out 2N parallel `getBtcVaultBasicInfo` + `getBtcVaultProtocolInfo`
        // calls.
        const expectedVersion = config.offchainParamsVersion;
        const actualVersions = await getOffchainParamsVersionsFromChain(
          batchRegistration.vaults.map((v) => v.vaultId),
        );
        const versionMismatches = actualVersions
          .map((actualVersion, i) => ({
            vaultId: batchRegistration.vaults[i].vaultId,
            actualVersion,
          }))
          .filter((v) => v.actualVersion !== expectedVersion);
        if (versionMismatches.length > 0) {
          const detail = versionMismatches
            .map(
              (v) =>
                `vault ${v.vaultId}: expected v${expectedVersion}, got v${v.actualVersion}`,
            )
            .join("; ");
          throw new Error(
            `Aborting BTC broadcast: offchain params version changed during registration (${detail}). The Pre-PegIn was not broadcast; the registered ETH vault will time out per protocol rules.`,
          );
        }

        // Early reservation is now superseded by real pending pegin entries.
        removeUtxoReservation(confirmedEthAddress, batchId);
        reservationBatchId = null;
        reservationEthAddress = null;

        // ========================================================================
        // Step 4b: Broadcast Pre-PegIn transaction to Bitcoin
        // Broadcast immediately after ETH registration so the VP can verify
        // the Pre-PegIn inputs on the Bitcoin network when it processes the
        // Ethereum event.
        // ========================================================================

        setCurrentStep(DepositFlowStep.BROADCAST_PRE_PEGIN);

        try {
          await broadcastPrePeginTransaction({
            unsignedTxHex: batchResult.fundedPrePeginTxHex,
            btcWalletProvider: {
              signPsbt: (psbtHex: string) =>
                confirmedBtcWallet.signPsbt(psbtHex),
            },
            depositorBtcPubkey: batchResult.depositorBtcPubkey,
            expectedUtxos: utxosToExpectedRecord(batchResult.selectedUTXOs),
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Failed to broadcast batch Pre-PegIn transaction: ${errorMsg}`,
          );
        }

        // Broadcast succeeded — update pending pegins from PENDING to CONFIRMING
        for (const peginResult of peginResults) {
          updatePendingPeginStatus(
            confirmedEthAddress,
            peginResult.vaultId,
            LocalStorageStatus.CONFIRMING,
          );
        }

        // All vaults share the same Pre-PegIn tx — if broadcast succeeded,
        // all pegins are live on Bitcoin.
        const broadcastedResults = peginResults;

        const provider = findProvider(primaryProvider as Hex);
        if (!provider) {
          throw new Error("Vault provider not found");
        }

        // Best-effort: subsequent gated calls re-derive on cache miss
        // if priming fails. All sibling vaults share one VP, so fetch
        // the pubkey once and seed each per-vault registry entry.
        const vpBaseUrl = getVpProxyUrl(provider.id);
        try {
          const pinnedServerPubkey =
            await getVaultRegistryReader().getVaultProviderBtcPubKey(
              provider.id as Address,
            );
          for (const r of broadcastedResults) {
            const peginTxid = stripHexPrefix(r.peginTxHash);
            primeVpTokenRegistry({
              baseUrl: vpBaseUrl,
              peginTxid,
              authAnchorHex,
              pinnedServerPubkey,
            });
            primedRegistryTxids.push(peginTxid);
          }
        } catch (err) {
          logger.warn("Failed to fetch VP pubkey for registry priming", {
            providerId: provider.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // ========================================================================
        // Step 5: WOTS + Payout signing
        // ========================================================================

        setCurrentStep(DepositFlowStep.AWAIT_BTC_CONFIRMATION);
        setIsWaiting(true);

        let baseStep: DepositFlowStep = DepositFlowStep.AWAIT_BTC_CONFIRMATION;
        const postBroadcastBtcWallet: typeof confirmedBtcWallet = {
          ...confirmedBtcWallet,
          // `isWaiting` flips to `false` while a popup is open and back
          // to `true` after it closes, so the SDK polling that follows
          // remains "Close & continue later"-able.
          deriveContextHash: async (appName, context) => {
            if (baseStep === DepositFlowStep.SIGN_PAYOUTS) {
              setCurrentStep(DepositFlowStep.SIGN_AUTH_ANCHOR);
            } else if (baseStep === DepositFlowStep.SUBMIT_WOTS_KEYS) {
              setCurrentStep(DepositFlowStep.SUBMIT_WOTS_KEYS);
            }
            setIsWaiting(false);
            try {
              return await confirmedBtcWallet.deriveContextHash(
                appName,
                context,
              );
            } finally {
              setIsWaiting(true);
            }
          },
          signPsbt: async (psbtHex, opts) => {
            setCurrentStep(DepositFlowStep.SIGN_PAYOUTS);
            setIsWaiting(false);
            try {
              return await confirmedBtcWallet.signPsbt(psbtHex, opts);
            } finally {
              setIsWaiting(true);
            }
          },
          ...(confirmedBtcWallet.signPsbts
            ? {
                signPsbts: async (psbtHexes, opts) => {
                  setCurrentStep(DepositFlowStep.SIGN_PAYOUTS);
                  setIsWaiting(false);
                  try {
                    return await confirmedBtcWallet.signPsbts!(psbtHexes, opts);
                  } finally {
                    setIsWaiting(true);
                  }
                },
              }
            : {}),
        };

        // Track per-vault outcomes so failed lanes don't block healthy siblings
        const wotsFailedVaultIds = new Set<string>();

        const MAX_WOTS_ATTEMPTS = 2;

        baseStep = DepositFlowStep.SUBMIT_WOTS_KEYS;

        for (const result of broadcastedResults) {
          signal.throwIfAborted();

          let wotsSuccess = false;

          for (let attempt = 1; attempt <= MAX_WOTS_ATTEMPTS; attempt++) {
            try {
              await submitWotsPublicKey({
                vaultId: result.vaultId,
                peginTxHash: result.peginTxHash,
                depositorBtcPubkey: result.depositorBtcPubkey,
                providerAddress: provider.id,
                wotsPublicKeys: perVaultWotsKeys[result.vaultIndex],
                btcWallet: postBroadcastBtcWallet,
                unsignedPrePeginTxHex: batchResult.fundedPrePeginTxHex,
                signal,
              });
              wotsSuccess = true;
              break;
            } catch (error) {
              // Re-throw abort errors so they're suppressed by the outer catch
              if (signal.aborted) throw error;

              if (attempt < MAX_WOTS_ATTEMPTS) {
                // submitWotsPublicKey is idempotent — if the VP already accepted
                // the key but the response was lost, the retry will detect that
                // the VP moved past the WOTS stage and return early.
                logger.warn(
                  `[Multi-Vault] WOTS submission failed for vault ${result.vaultId}, retrying (attempt ${attempt}/${MAX_WOTS_ATTEMPTS})`,
                );
                continue;
              }

              const errorMsg =
                error instanceof Error ? error.message : String(error);
              const warning = `Vault ${result.vaultIndex + 1}: WOTS key submission failed - ${errorMsg}`;
              warnings.push(warning);
              logger.error(
                error instanceof Error ? error : new Error(String(error)),
                {
                  data: {
                    context:
                      "[Multi-Vault] Failed to submit WOTS key for vault",
                    vaultId: result.vaultId,
                  },
                },
              );
            }
          }

          if (!wotsSuccess) {
            wotsFailedVaultIds.add(result.vaultId);
          }
        }

        // ========================================================================
        // Step 5b: Sign Payout Transactions
        // ========================================================================

        baseStep = DepositFlowStep.SIGN_PAYOUTS;

        const payoutSignedVaultIds = new Set<string>();

        for (let vi = 0; vi < broadcastedResults.length; vi++) {
          const result = broadcastedResults[vi];

          signal.throwIfAborted();

          // Skip vaults whose WOTS key submission failed — the VP won't have
          // the keys needed, so payout signing would timeout.
          if (wotsFailedVaultIds.has(result.vaultId)) continue;

          try {
            setCurrentVaultIndex(vi);
            const peginTxidNoPrefix = stripHexPrefix(result.peginTxHash);
            const cacheHit =
              vpTokenRegistry.peek(peginTxidNoPrefix) !== undefined;
            setCurrentStep(
              cacheHit
                ? DepositFlowStep.SIGN_PAYOUTS
                : DepositFlowStep.SIGN_AUTH_ANCHOR,
            );
            setIsWaiting(true);

            await signAndSubmitPayouts({
              vaultId: result.vaultId,
              peginTxHash: result.peginTxHash,
              depositorBtcPubkey: result.depositorBtcPubkey,
              providerBtcPubKey: provider.btcPubKey,
              registeredPayoutScriptPubKey:
                btcAddressToScriptPubKeyHex(confirmedBtcAddress),
              btcWallet: postBroadcastBtcWallet,
              depositorEthAddress: confirmedEthAddress,
              unsignedPrePeginTxHex: batchResult.fundedPrePeginTxHex,
              signal,
              onProgress: setPayoutSigningProgress,
            });

            payoutSignedVaultIds.add(result.vaultId);
          } catch (error) {
            // If the user cancelled, stop immediately — don't continue with other vaults
            if (signal.aborted) throw error;

            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const warning = `Vault ${result.vaultIndex + 1}: Payout signing failed - ${errorMsg}`;
            warnings.push(warning);
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              {
                data: {
                  context:
                    "[Multi-Vault] Failed to sign or submit payouts for vault",
                  vaultId: result.vaultId,
                  providerAddress: provider.id,
                },
              },
            );
            // Continue with other vaults
          }
        }

        setPayoutSigningProgress(null);
        setCurrentVaultIndex(null);

        // ========================================================================
        // Step 6: Download Vault Artifacts (per vault, sequential)
        // ========================================================================

        const readyResults = broadcastedResults.filter((r) =>
          payoutSignedVaultIds.has(r.vaultId),
        );

        setCurrentStep(DepositFlowStep.ARTIFACT_DOWNLOAD);
        setIsWaiting(false);

        for (const result of readyResults) {
          if (signal.aborted) break;

          setArtifactDownloadInfo({
            providerAddress: provider.id,
            peginTxid: result.peginTxHash,
            depositorPk: result.depositorBtcPubkey,
            vaultId: result.vaultId,
          });

          await new Promise<void>((resolve) => {
            artifactResolverRef.current = resolve;
          });

          // The X button on ArtifactDownloadModal calls abort(), which
          // resolves the resolver above. Re-check here so a dismissal
          // exits the loop (and triggers the abort branch below)
          // instead of advancing as if the artifact were downloaded.
          signal.throwIfAborted();
        }

        setIsWaiting(true);

        // Return result
        return {
          pegins: peginResults,
          batchId,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (err: unknown) {
        // Clean up the early UTXO reservation so the UTXOs are released for
        // reuse — but ONLY when it is safe to do so. If
        // `registerPeginBatchAndWait` was invoked and no durable pending
        // pegin records were written, the ETH registration outcome is
        // unknown (the failure can be a post-`sendTransaction` receipt
        // timeout while the tx is still in the mempool or already mined).
        // Releasing the reservation in that window would let the same
        // outpoints back a second deposit, leaving one ETH-registered vault
        // unbroadcastable. Leave the reservation in place and let the
        // existing 5-minute TTL handle cleanup; the user can retry after
        // expiry. The trade-off is a UX delay for genuine pre-receipt
        // failures, which is acceptable versus a stranded vault.
        if (
          reservationBatchId &&
          reservationEthAddress &&
          (!registrationStarted || pendingPersisted)
        ) {
          removeUtxoReservation(reservationEthAddress, reservationBatchId);
        }

        // On user-cancel, release any registry entries we primed so
        // `authAnchorHex` doesn't outlive the abandoned flow. On other
        // errors keep the entries — the user may retry, in which case
        // the cache hit avoids a second wallet popup.
        if (signal.aborted) {
          for (const peginTxid of primedRegistryTxids) {
            vpTokenRegistry.release(peginTxid);
          }
        }

        // Don't show error if flow was aborted (user intentionally closed modal)
        if (!signal.aborted) {
          setError(sanitizeErrorMessage(err));
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            data: {
              context: "Multi-vault deposit flow error",
              ...(err instanceof VpResponseValidationError && {
                detail: err.detail,
              }),
            },
          });
        }
        return null;
      } finally {
        setProcessing(false);
        if (!signal.aborted) {
          setCurrentVaultIndex(null);
        }
        abortControllerRef.current = null;
      }
    }, [
      vaultAmounts,
      mempoolFeeRate,
      btcWalletProvider,
      depositorEthAddress,
      selectedApplication,
      selectedProviders,
      vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys,
      timelockPegin,
      timelockRefund,
      config,
      minDeposit,
      maxDeposit,
      btcAddress,
      spendableUTXOs,
      isUTXOsLoading,
      utxoError,
      findProvider,
    ]);

  return {
    executeDeposit,
    abort,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
    artifactDownloadInfo,
    continueAfterArtifactDownload,
  };
}
