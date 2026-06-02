/**
 * Deposit Flow Hook
 *
 * Batch-first deposit: one Pre-PegIn BTC tx with N HTLC outputs (one per vault),
 * registered atomically on Ethereum via submitPeginRequestBatch — all vaults
 * succeed or none, and the Pre-PegIn is broadcast only after ETH registration,
 * so a failed batch never strands BTC in unregistered HTLCs. A single vault is
 * a batch of 1.
 *
 * Runs through WOTS submission and payout signing, then parks at
 * AWAIT_VP_VERIFICATION and hands off to the continuation view (artifact
 * download + activation happen at its ActivationGate).
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  ensureHexPrefix,
  isRegisteredVaultVersionMismatchError,
  stripHexPrefix,
  validateOnChainParticipantKeys,
  verifyRegisteredVaultVersions,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  primeVpTokenRegistry,
  VpResponseValidationError,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { computeHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Address, Hex } from "viem";

import {
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import featureFlags from "@/config/featureFlags";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { COPY } from "@/copy";
import { UTXOS_QUERY_KEY } from "@/hooks/useUTXOs";
import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";
import {
  broadcastPrePeginTransaction,
  utxosToExpectedRecord,
} from "@/services/vault/vaultPeginBroadcastService";
import {
  preparePeginTransaction,
  type PeginSigningProgress,
} from "@/services/vault/vaultTransactionService";
import { assertUtxosAvailable } from "@/services/vault/vaultUtxoValidationService";
import {
  addPendingPegin,
  removePendingPegin,
  updatePendingPeginStatus,
} from "@/storage/peginStorage";
import {
  btcAddressToScriptPubKeyHex,
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "@/utils/btc";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { mapDepositError, type DepositErrorContent } from "@/utils/errors";
import { formatBtcValue } from "@/utils/formatting";
import { processAsReady } from "@/utils/processAsReady";
import { getVpProxyUrl } from "@/utils/rpc";

import {
  DepositFlowStep,
  getEthWalletClient,
  payoutSigningStep,
  registerPeginBatchAndWait,
  signAndSubmitPayouts,
  signProofOfPossession,
  submitWotsPublicKey,
  waitForPayoutReady,
  waitForWotsReady,
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

export interface UseDepositFlowReturn {
  /** Execute the batch deposit flow */
  executeDeposit: () => Promise<MultiVaultDepositResult | null>;
  /** Cancel the running flow (e.g. when the user closes the modal) */
  abort: () => void;
  /** Current step in the deposit flow */
  currentStep: DepositFlowStep;
  /** Current vault being processed (0 or 1), null if not processing a vault */
  currentVaultIndex: number | null;
  /**
   * Indices of vaults whose WOTS submission has actually succeeded. Lets the
   * split-progress view tell a genuinely-submitted earlier vault apart from one
   * the loop skipped (WOTS failure/timeout), so a skipped sibling isn't shown
   * as past WOTS.
   */
  wotsSubmittedVaultIndices: ReadonlySet<number>;
  /**
   * Indices of vaults whose payout signing has actually completed. Lets the
   * split-progress view tell a genuinely-signed earlier vault apart from one
   * the loop skipped (WOTS failure), so a skipped sibling isn't shown as signed.
   */
  payoutSignedVaultIndices: ReadonlySet<number>;
  /** Whether the flow is currently processing */
  processing: boolean;
  /** Mapped error content (title + body) if any step failed */
  error: DepositErrorContent | null;
  /**
   * Soft warnings accumulated by the most recent flow (e.g. "couldn't save a
   * local copy" when the deposit registered on-chain but `addPendingPegin`
   * failed). Empty until the flow finishes or errors out; persists for the
   * UI to surface until the next run starts.
   */
  lastWarnings: string[];
  /** Whether currently waiting for external action (e.g., wallet signature) */
  isWaiting: boolean;
  /** Payout signing progress (X of Y signings) */
  payoutSigningProgress: PayoutSigningProgress | null;
  /** Peg-in BTC signing progress (X of Y peg-in txs, split deposits only) */
  peginSigningProgress: PeginSigningProgress | null;
  /**
   * Data backing the "Awaiting Bitcoin confirmation" detail panel, snapshotted
   * when the BTC wait begins: the timestamp, the Pre-PegIn broadcast txid, and
   * the required confirmation depth of the offchain-params version this
   * deposit registered against. `null` until the BTC broadcast completes.
   */
  btcConfirmationDetail: {
    startedAt: number;
    prePeginTxid: string;
    requiredDepth: number;
    depositIds: readonly string[];
  } | null;
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

  const btcConnector = useChainConnector("BTC");

  // State
  const [currentStep, setCurrentStep] = useState<DepositFlowStep>(
    DepositFlowStep.DERIVE_VAULT_SECRET,
  );
  const [currentVaultIndex, setCurrentVaultIndex] = useState<number | null>(
    null,
  );
  const [wotsSubmittedVaultIndices, setWotsSubmittedVaultIndices] = useState<
    ReadonlySet<number>
  >(() => new Set());
  const [payoutSignedVaultIndices, setPayoutSignedVaultIndices] = useState<
    ReadonlySet<number>
  >(() => new Set());
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<DepositErrorContent | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  // Soft warnings accumulated during the most recent run (per-vault payout
  // failures, localStorage write failures, etc.). Exposed so the UI can
  // surface them after completion — these are informational, the flow
  // itself doesn't abort on them.
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);
  const [payoutSigningProgress, setPayoutSigningProgress] =
    useState<PayoutSigningProgress | null>(null);
  const [peginSigningProgress, setPeginSigningProgress] =
    useState<PeginSigningProgress | null>(null);
  const [btcConfirmationDetail, setBtcConfirmationDetail] = useState<{
    startedAt: number;
    prePeginTxid: string;
    requiredDepth: number;
    depositIds: readonly string[];
  } | null>(null);

  const payoutClaimersDoneRef = useRef(false);

  // Abort controller for cancelling the flow
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
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
  const queryClient = useQueryClient();
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
      setLastWarnings([]);
      setPeginSigningProgress(null);
      setCurrentStep(DepositFlowStep.DERIVE_VAULT_SECRET);

      // Track background operation failures
      const warnings: string[] = [];

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

        // Defense-in-depth wallet liveness probe. The click-time check in
        // SimpleDeposit.handleDeposit already gates this flow, but a stale
        // Unisat session can still surface here if the user opened the SIGN
        // step through any other path or if the wallet went dead between
        // click and modal mount. Probing here surfaces a clear, actionable
        // error before any irreversible state is written.
        //
        // The round-trip probe is gated to injected extensions (Unisat/OKX/
        // OneKey) via shouldProbeWalletLiveness; AppKit/hardware wallets fall
        // back to the cached-address check to avoid reopening their modal /
        // re-engaging the device.
        if (btcWalletProvider && btcAddress) {
          await verifyBtcWalletLiveness(btcWalletProvider, btcAddress, {
            probeConnection: shouldProbeWalletLiveness(
              btcConnector?.connectedWallet?.id,
            ),
          });
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
        // Sign each peg-in PSBT one at a time so the (x of n) sub-counter can
        // advance per signature. A native batch signPsbts signs every tx in a
        // single popup and returns one result, hiding intra-batch progress
        // from the dApp — so we override signPsbts to loop signPsbt instead,
        // trading one popup for N popups in exchange for live progress.
        const signOnePeginPsbt: typeof confirmedBtcWallet.signPsbt = async (
          psbtHex,
          opts,
        ) => {
          setCurrentStep(DepositFlowStep.SIGN_PEGIN_BTC);
          const signed = await confirmedBtcWallet.signPsbt(psbtHex, opts);
          setPeginSigningProgress((prev) =>
            prev
              ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) }
              : prev,
          );
          return signed;
        };
        const phaseTrackingBtcWallet: typeof confirmedBtcWallet = {
          ...confirmedBtcWallet,
          deriveContextHash: (appName, context) => {
            setCurrentStep(DepositFlowStep.DERIVE_VAULT_SECRET);
            return confirmedBtcWallet.deriveContextHash(appName, context);
          },
          signPsbt: signOnePeginPsbt,
          signPsbts: async (psbtHexes, opts) => {
            const signed: string[] = [];
            for (let i = 0; i < psbtHexes.length; i++) {
              signed.push(await signOnePeginPsbt(psbtHexes[i], opts?.[i]));
            }
            return signed;
          },
        };

        // No hard pre-filter. `DuplicateHashlock` on `BTCVaultRegistry`
        // blocks *identical* UTXO-set reuse on-chain; the modal banner
        // advises on overlap with pending vaults. Residual: partial
        // overlap (e.g. {U1,U2} vs {U1,U3}) derives a different hashlock
        // — both register, only one Pre-PegIn can broadcast, the other
        // strands until expiry.

        const [vaultKeeperReader, universalChallengerReader] =
          await Promise.all([
            getVaultKeeperReader(),
            getUniversalChallengerReader(),
          ]);
        const validatedKeys = await validateOnChainParticipantKeys({
          vaultRegistryReader: getVaultRegistryReader(),
          vaultKeeperReader,
          universalChallengerReader,
          vaultProviderEthAddress: selectedProviders[0] as Address,
          applicationEntryPoint: selectedApplication as Address,
          expectedVaultProviderBtcPubkey: vaultProviderBtcPubkey,
          expectedVaultKeeperBtcPubkeys: vaultKeeperBtcPubkeys,
          expectedUniversalChallengerBtcPubkeys: universalChallengerBtcPubkeys,
        });

        // Prime the peg-in signing sub-counter (one tx per vault) before the
        // commit pass drives the wallet popup(s).
        setPeginSigningProgress({ completed: 0, total: vaultAmounts.length });

        const batchResult = await preparePeginTransaction(
          phaseTrackingBtcWallet,
          walletClient,
          {
            pegInAmounts: vaultAmounts,
            protocolFeeRate: config.offchainParams.feeRate,
            minPeginFeeRate: config.offchainParams.minPeginFeeRate,
            mempoolFeeRate,
            changeAddress: confirmedBtcAddress,
            vaultProviderBtcPubkey: validatedKeys.vaultProviderBtcPubkeyXOnly,
            vaultKeeperBtcPubkeys: validatedKeys.vaultKeeperBtcPubkeysSorted,
            universalChallengerBtcPubkeys:
              validatedKeys.universalChallengerBtcPubkeysSorted,
            timelockPegin,
            timelockRefund,
            councilQuorum: config.offchainParams.councilQuorum,
            councilSize: config.offchainParams.securityCouncilKeys.length,
            availableUTXOs: spendableUTXOs,
          },
        );
        const {
          perVaultWotsKeys,
          wotsPkHashes,
          htlcSecretHexes,
          authAnchorHex,
        } = batchResult;

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
        // a resume entry exists even if the version check (3g) or broadcast
        // fails. Status is PENDING (not CONFIRMING) — the resume flow will
        // show a "Broadcast" button for these entries. The local record is
        // a UX cache for the resume flow only; nothing about UTXO reuse
        // depends on its presence (chain-side PENDING/VERIFIED vaults are
        // the canonical claim source). A localStorage write failure here is
        // caught per-vault and surfaced as a soft warning so the user can
        // free up storage; the flow continues to broadcast either way.
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

          const pendingRecord = {
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
            // Persist the exact versions the BTC scripts were built against.
            // The resume broadcast path re-asserts these against the on-chain
            // vault before signing — current local config is not safe to
            // compare against, since both could drift to the same new value
            // while the BTC scripts stayed pinned to the construction-time
            // version.
            buildOffchainParamsVersion: config.offchainParamsVersion,
            buildAppVaultKeepersVersion:
              validatedKeys.expectedAppVaultKeepersVersion,
            buildUniversalChallengersVersion:
              validatedKeys.expectedUniversalChallengersVersion,
          };
          // Persist the resume record. A localStorage failure (quota /
          // private browsing) must NOT abort: the vault is already
          // registered on-chain, and aborting would skip the broadcast and
          // strand it. Continue, but warn the user that the local copy is
          // missing.
          try {
            addPendingPegin(confirmedEthAddress, pendingRecord);
          } catch (persistErr) {
            logger.error(
              persistErr instanceof Error
                ? persistErr
                : new Error(String(persistErr)),
              {
                tags: {
                  component: "useDepositFlow",
                  phase: "persist-pending-pegin",
                },
                data: { vaultId: peginResult.vaultId },
              },
            );
            if (
              !warnings.includes(COPY.deposit.warnings.depositRecordNotSaved)
            ) {
              warnings.push(COPY.deposit.warnings.depositRecordNotSaved);
            }
          }
        }

        // Verify on-chain registration locked under the same versions we built scripts against.
        try {
          await verifyRegisteredVaultVersions({
            vaultRegistryReader: getVaultRegistryReader(),
            vaultIds: batchRegistration.vaults.map((v) => v.vaultId as Hex),
            expectedOffchainParamsVersion: config.offchainParamsVersion,
            expectedAppVaultKeepersVersion:
              validatedKeys.expectedAppVaultKeepersVersion,
            expectedUniversalChallengersVersion:
              validatedKeys.expectedUniversalChallengersVersion,
          });
        } catch (err) {
          // Only a confirmed mismatch removes pending entries — transient RPC
          // failures keep them so the user can resume.
          if (isRegisteredVaultVersionMismatchError(err)) {
            for (const v of batchRegistration.vaults) {
              removePendingPegin(confirmedEthAddress, v.vaultId as Hex);
            }
          }
          throw err;
        }

        // ========================================================================
        // Step 4b: Broadcast Pre-PegIn transaction to Bitcoin
        // Broadcast immediately after ETH registration so the VP can verify
        // the Pre-PegIn inputs on the Bitcoin network when it processes the
        // Ethereum event.
        // ========================================================================

        setCurrentStep(DepositFlowStep.BROADCAST_PRE_PEGIN);

        let prePeginBroadcastTxid: string;
        try {
          prePeginBroadcastTxid = await broadcastPrePeginTransaction({
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

        // The mempool now knows our Pre-PegIn spent these outpoints, so the
        // next `/address/<addr>/utxo` fetch will exclude them. Invalidate
        // the cache so a follow-up deposit picks fresh inputs instead of
        // the stale set this one just consumed.
        if (btcAddress) {
          void queryClient.invalidateQueries({
            queryKey: [UTXOS_QUERY_KEY, btcAddress],
          });
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
              enableGrpcArtifactAuth: featureFlags.isGrpcArtifactsEnabled,
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
        // Snapshot the BTC-wait inputs. The Pre-PegIn broadcast txid is the tx
        // that lands on Bitcoin (multi-vault siblings share one broadcast).
        // requiredDepth is pinned to the offchain-params version this deposit
        // registered against — the VP gates on that version's minPrepeginDepth
        // (btc-vault claimer/pegin.rs check_prepegin_depth_and_transition), so
        // a later governance change must not move the displayed target. The
        // panel itself renders at the AWAIT_PAYOUT_TRANSACTIONS step (that's
        // where the minPrepeginDepth wait actually happens); we capture the
        // values here at broadcast time so startedAt anchors to broadcast.
        setBtcConfirmationDetail({
          startedAt: Date.now(),
          prePeginTxid: prePeginBroadcastTxid,
          requiredDepth: config.offchainParams.minPrepeginDepth,
          depositIds: broadcastedResults.map((r) => r.vaultId),
        });
        setIsWaiting(true);

        let baseStep: DepositFlowStep = DepositFlowStep.AWAIT_BTC_CONFIRMATION;
        const postBroadcastBtcWallet: typeof confirmedBtcWallet = {
          ...confirmedBtcWallet,
          // `isWaiting` flips to `false` while a popup is open and back
          // to `true` after it closes, so the SDK polling that follows
          // remains "Close & continue later"-able.
          deriveContextHash: async (appName, context) => {
            const returnStep = baseStep;
            if (baseStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS) {
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
              setCurrentStep(returnStep);
            }
          },
          signPsbt: async (psbtHex, opts) => {
            if (payoutClaimersDoneRef.current) {
              setCurrentStep(DepositFlowStep.SIGN_DEPOSITOR_GRAPH);
              setPayoutSigningProgress({
                phase: "graph",
                completed: 0,
                total: 1,
              });
            }
            setIsWaiting(false);
            try {
              return await confirmedBtcWallet.signPsbt(psbtHex, opts);
            } finally {
              setIsWaiting(true);
              if (payoutClaimersDoneRef.current) {
                setPayoutSigningProgress({
                  phase: "graph",
                  completed: 1,
                  total: 1,
                });
              }
            }
          },
          ...(confirmedBtcWallet.signPsbts
            ? {
                signPsbts: async (psbtHexes, opts) => {
                  if (payoutClaimersDoneRef.current) {
                    setCurrentStep(DepositFlowStep.SIGN_DEPOSITOR_GRAPH);
                    setPayoutSigningProgress({
                      phase: "graph",
                      completed: 0,
                      total: psbtHexes.length,
                    });
                  }
                  setIsWaiting(false);
                  try {
                    return await confirmedBtcWallet.signPsbts!(psbtHexes, opts);
                  } finally {
                    setIsWaiting(true);
                    if (payoutClaimersDoneRef.current) {
                      setPayoutSigningProgress({
                        phase: "graph",
                        completed: psbtHexes.length,
                        total: psbtHexes.length,
                      });
                    }
                  }
                },
              }
            : {}),
        };

        // Track per-vault outcomes so failed lanes don't block healthy siblings
        const wotsFailedVaultIds = new Set<string>();

        const MAX_WOTS_ATTEMPTS = 2;

        baseStep = DepositFlowStep.SUBMIT_WOTS_KEYS;
        // Clear both membership sets before the per-vault phases. The split UI
        // derives each non-active vault's step purely from membership, so stale
        // entries from a previous run must not leak into this one.
        setWotsSubmittedVaultIndices(new Set());
        setPayoutSignedVaultIndices(new Set());

        // Process vaults in the order the VP makes them ready (concurrent
        // read-only readiness waits) while signing stays serialized — a slow
        // vault never starves a ready sibling, and only one wallet popup is ever
        // open at a time.
        await processAsReady(
          broadcastedResults,
          (result) =>
            waitForWotsReady({
              peginTxHash: result.peginTxHash,
              providerAddress: provider.id,
              signal,
            }),
          async (result) => {
            signal.throwIfAborted();

            // Mark the vault now being signed so the split UI shows it active.
            // The concurrent pre-wait only orders processing — submitWotsPublicKey
            // re-checks readiness authoritatively and retries, so a pre-wait
            // timeout/terminal is never treated as failure here (preserves the
            // original per-vault retry window).
            setCurrentVaultIndex(result.vaultIndex);

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
                setWotsSubmittedVaultIndices((prev) =>
                  new Set(prev).add(result.vaultIndex),
                );
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
                warnings.push(
                  `Vault ${result.vaultIndex + 1}: WOTS key submission failed - ${errorMsg}`,
                );
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
          },
        );

        // ========================================================================
        // Step 5b: Sign Payout Transactions
        // ========================================================================

        baseStep = DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS;

        // Only sign payouts for vaults whose WOTS succeeded — skipped lanes have
        // no keys at the VP and would just time out. Process the rest in the
        // order the VP makes their presign transactions ready.
        const payoutCandidates = broadcastedResults.filter(
          (result) => !wotsFailedVaultIds.has(result.vaultId),
        );

        await processAsReady(
          payoutCandidates,
          (result) =>
            waitForPayoutReady({
              peginTxHash: result.peginTxHash,
              providerAddress: provider.id,
              signal,
            }),
          async (result) => {
            signal.throwIfAborted();

            setCurrentVaultIndex(result.vaultIndex);
            setCurrentStep(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS);
            setIsWaiting(true);
            payoutClaimersDoneRef.current = false;

            // The concurrent pre-wait only orders processing — signAndSubmitPayouts
            // re-checks readiness authoritatively, so a pre-wait timeout/terminal
            // is never treated as failure here.
            try {
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
                onProgress: (p) => {
                  if (!p) return;
                  setPayoutSigningProgress(p);
                  setCurrentStep(payoutSigningStep(p.phase));
                  payoutClaimersDoneRef.current =
                    p.total > 0 && p.completed >= p.total;
                },
              });

              setPayoutSignedVaultIndices((prev) =>
                new Set(prev).add(result.vaultIndex),
              );
              setCurrentStep(DepositFlowStep.AWAIT_VP_VERIFICATION);
            } catch (error) {
              // If the user cancelled, stop immediately — don't continue.
              if (signal.aborted) throw error;

              const errorMsg =
                error instanceof Error ? error.message : String(error);
              warnings.push(
                `Vault ${result.vaultIndex + 1}: Payout signing failed - ${errorMsg}`,
              );
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
          },
        );

        setPayoutSigningProgress(null);
        setCurrentVaultIndex(null);

        // Payout signing done. Each signed vault is left at AWAIT_VP_VERIFICATION
        // (set above). The flow hands off to the post-deposit continuation view,
        // which polls each vault and surfaces the manual artifact-download +
        // activation step at its ActivationGate (where the user can download or
        // explicitly skip) — so we no longer block the flow on a download here.
        setIsWaiting(true);

        // Snapshot the warnings into hook state so the UI can show them
        // post-completion. (Returning them in the result alone isn't
        // enough — `DepositSignContent` reads from the hook, not the
        // return value, for everything else.)
        if (warnings.length > 0) {
          setLastWarnings([...warnings]);
        }

        // Return result
        return {
          pegins: peginResults,
          batchId,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (err: unknown) {
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
          setError(mapDepositError(err));
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            data: {
              context: "Multi-vault deposit flow error",
              ...(err instanceof VpResponseValidationError && {
                detail: err.detail,
              }),
            },
          });
        }
        // Surface any warnings collected before the error (e.g. a failed
        // `addPendingPegin` write that came BEFORE a broadcast failure)
        // so the user sees both the error AND the localStorage warning.
        if (warnings.length > 0) {
          setLastWarnings([...warnings]);
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
      btcConnector?.connectedWallet?.id,
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
      queryClient,
    ]);

  return {
    executeDeposit,
    abort,
    currentStep,
    currentVaultIndex,
    wotsSubmittedVaultIndices,
    payoutSignedVaultIndices,
    processing,
    error,
    /** Soft warnings from the most recent flow (empty until completion). */
    lastWarnings,
    isWaiting,
    payoutSigningProgress,
    peginSigningProgress,
    btcConfirmationDetail,
  };
}
