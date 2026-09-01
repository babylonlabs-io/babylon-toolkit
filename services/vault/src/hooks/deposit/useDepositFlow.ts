/**
 * Deposit Flow Hook
 *
 * Batch-first deposit: one Pre-PegIn BTC tx with N HTLC outputs (one per vault),
 * registered atomically on Ethereum via submitPeginRequestBatch — all vaults
 * succeed or none, and the Pre-PegIn is broadcast only after ETH registration,
 * so a failed batch never strands BTC in unregistered HTLCs. A single vault is
 * a batch of 1.
 *
 * Runs through WOTS submission, signs payouts only when the VP is already
 * ready, then hands off to the in-modal continuation view for any remaining
 * payout signing, artifact download, and activation work.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  ensureHexPrefix,
  forwardDepositApproval,
  isDepositTermsRejectedError,
  isRegisteredVaultVersionMismatchError,
  requireChangeAddress,
  stripHexPrefix,
  supportsDepositApproval,
  validateOnChainParticipantKeys,
  verifyRegisteredParticipantKeys,
  verifyRegisteredVaultVersions,
  type DepositTermsApprover,
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
  getOperationKeyReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import { isDepositBlocked } from "@/components/shared/protocolStatus";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import {
  markPayoutSignCanceled,
  markWotsSubmitted,
} from "@/context/deposit/optimisticDepositState";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { UTXOS_QUERY_KEY } from "@/hooks/useUTXOs";
import { logger } from "@/infrastructure";
import {
  amountBucket,
  shortId,
  TELEMETRY_EVENT,
} from "@/infrastructure/telemetryEvents";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import { validateMultiVaultDepositInputs } from "@/services/deposit/validations";
import {
  waitForEthRegistrationDepth,
  type RegistrationDepthProgress,
} from "@/services/vault/ethConfirmationGate";
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
import { resolveVpAuthPinnedPubkey } from "@/services/vault/vpAuthPinnedPubkey";
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
import { supportsCancelSigning } from "@/utils/cancelSigning";
import {
  COMMISSION_UNAVAILABLE_ERROR,
  mapDepositError,
  type DepositErrorContent,
} from "@/utils/errors";
import {
  isUserCancellation,
  WALLET_CONNECTION_REJECTED_CODE,
} from "@/utils/errors/userCancellation";
import { formatBtcValue } from "@/utils/formatting";
import { getVpProxyUrl } from "@/utils/rpc";

import {
  DepositFlowStep,
  getEthWalletClient,
  isPayoutReadinessTimeout,
  payoutSigningStep,
  registerPeginBatchAndWait,
  signAndSubmitPayouts,
  signProofOfPossession,
  submitWotsPublicKey,
  waitForPayoutReadiness,
  waitForWotsReadiness,
  type DepositUtxo,
} from "./depositFlowSteps";
import type { DepositWarning } from "./depositWarnings";
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
  /**
   * VP commission (bps) shown to the depositor at provider selection, for the
   * primary provider (`selectedProviders[0]`). `undefined` while the on-chain
   * commission is still loading or failed to fetch — the flow refuses to submit
   * in that state rather than binding to an unquoted value.
   */
  quotedCommissionBps: number | undefined;
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
  /** Whether the flow is currently processing */
  processing: boolean;
  /** Mapped error content (title + body) if any step failed */
  error: DepositErrorContent | null;
  /**
   * Structured soft warnings from the most recent flow (e.g. a per-vault WOTS
   * readiness timeout, or "couldn't save a local copy"). Empty until the flow
   * finishes or errors out. Non-terminal per-vault warnings are dropped by the
   * continuation view once their vault advances past the warned stage — see
   * {@link DepositWarning}.
   */
  lastWarnings: DepositWarning[];
  /** Whether currently waiting for external action (e.g., wallet signature) */
  isWaiting: boolean;
  /** Payout signing progress (X of Y signings) */
  payoutSigningProgress: PayoutSigningProgress | null;
  /** Peg-in BTC signing progress (X of Y peg-in txs, split deposits only) */
  peginSigningProgress: PeginSigningProgress | null;
  /**
   * Per-vault live render steps for split deposits. The initial modal uses
   * these instead of positional inference because earlier vaults can fail WOTS
   * or payout signing while later vaults continue.
   */
  perVaultSteps: DepositFlowStep[];
  /**
   * Data backing the "Awaiting Bitcoin confirmation" detail panel, snapshotted
   * when the BTC wait begins: the Pre-PegIn broadcast txid and the required
   * confirmation depth of the offchain-params version this deposit registered
   * against. `null` until the BTC broadcast completes.
   */
  btcConfirmationDetail: {
    prePeginTxid: string;
    requiredDepth: number;
    depositIds: readonly string[];
  } | null;
  /**
   * Live depth of the Ethereum registration while the finality gate holds the
   * flow between the ETH receipt and the Pre-PegIn broadcast. `null` outside
   * that window — the flow is only here for ~1.6 min per deposit.
   */
  ethConfirmationDetail: RegistrationDepthProgress | null;
  /**
   * True while a cancellable device signature (signPsbt/signPsbts/signMessage)
   * is in flight AND the provider that started it exposes `cancelSigning`
   * (only the Ledger provider does — always capability-probed).
   */
  canCancelDeviceSign: boolean;
  /** True from {@link cancelDeviceSign} until the in-flight signature settles. */
  deviceCancelRequested: boolean;
  /**
   * Requests cancellation of the in-flight device signature. Does NOT settle
   * it: the provider aborts at its next device exchange boundary, which may be
   * only after the user finishes or rejects on the physical device.
   */
  cancelDeviceSign: () => void;
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
  /** Structured warnings for recoverable/terminal per-vault failures. */
  warnings?: DepositWarning[];
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
    quotedCommissionBps,
    vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = params;

  const btcConnector = useChainConnector("BTC");

  // State
  const [currentStep, setCurrentStep] = useState<DepositFlowStep>(
    DepositFlowStep.DERIVE_VAULT_SECRET,
  );
  // Mirror of `currentStep` for the flow callback's outer catch: the callback
  // closes over a `currentStep` that is stale by the time it throws, so the
  // failure telemetry reads the ref to tag which step the flow was on. Written
  // synchronously with the state update — a `useEffect` mirror only lands after
  // the commit, which a throw in the first async tick after a transition would
  // beat, tagging the step before the one that actually failed.
  const currentStepRef = useRef(DepositFlowStep.DERIVE_VAULT_SECRET);
  const advanceStep = useCallback((step: DepositFlowStep) => {
    currentStepRef.current = step;
    setCurrentStep(step);
  }, []);
  const [currentVaultIndex, setCurrentVaultIndex] = useState<number | null>(
    null,
  );
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<DepositErrorContent | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  // Soft warnings accumulated during the most recent run (per-vault payout
  // failures, localStorage write failures, etc.). Exposed so the UI can
  // surface them after completion — these are informational, the flow
  // itself doesn't abort on them.
  const [lastWarnings, setLastWarnings] = useState<DepositWarning[]>([]);
  const [payoutSigningProgress, setPayoutSigningProgress] =
    useState<PayoutSigningProgress | null>(null);
  const [peginSigningProgress, setPeginSigningProgress] =
    useState<PeginSigningProgress | null>(null);
  const [perVaultSteps, setPerVaultSteps] = useState<DepositFlowStep[]>(() =>
    vaultAmounts.map(() => DepositFlowStep.DERIVE_VAULT_SECRET),
  );
  const [btcConfirmationDetail, setBtcConfirmationDetail] = useState<{
    prePeginTxid: string;
    requiredDepth: number;
    depositIds: readonly string[];
  } | null>(null);
  const [ethConfirmationDetail, setEthConfirmationDetail] =
    useState<RegistrationDepthProgress | null>(null);

  const payoutClaimersDoneRef = useRef(false);

  // Cancellable device-sign window (#2110 T3): only signPsbt/signPsbts/
  // signMessage run through the Ledger provider's abortable loop, so the flag
  // tracks exactly those calls — never derive/approve ceremonies or waits.
  const [deviceSignActive, setDeviceSignActive] = useState(false);
  const [deviceCancelRequested, setDeviceCancelRequested] = useState(false);
  // Ref mirrors so cancelDeviceSign and the settle path read live values
  // synchronously inside the long-lived async closures.
  const deviceSignActiveRef = useRef(false);
  const deviceCancelRequestedRef = useRef(false);
  // Sticky per-run signal: a requested cancel SETTLED as the wallet's
  // user-cancel rejection. The multi-vault payout loop reads it to stop
  // instead of re-running the next vault's device ceremony, and the outer
  // catch reads it to surface cancelled (not rejected) copy. Reset only at
  // the start of the next executeDeposit run.
  const deviceCancelSettledRef = useRef(false);
  // Set when the LAST runCancellableSign settled successfully with a cancel
  // request still pending (the late-cancel race). Only the broadcast wrapper
  // consults it — everywhere else the successful sign deliberately proceeds.
  const lastSignSettledWithCancelPendingRef = useRef(false);
  // Provider that STARTED the in-flight sign. Cancellation binds to it so a
  // wallet swapped in mid-prompt cannot orphan the original ceremony.
  const deviceSignProviderRef = useRef<unknown>(null);

  const runCancellableSign = useCallback(
    async <T>(signingProvider: unknown, sign: () => Promise<T>): Promise<T> => {
      deviceSignProviderRef.current = signingProvider;
      deviceSignActiveRef.current = true;
      setDeviceSignActive(true);
      lastSignSettledWithCancelPendingRef.current = false;
      try {
        const signed = await sign();
        // Captured before the finally consumes the request — the broadcast
        // wrapper reads it to withhold pushTx on a late cancel.
        lastSignSettledWithCancelPendingRef.current =
          deviceCancelRequestedRef.current;
        return signed;
      } catch (error) {
        // The requested cancel took effect (a late cancel that still signed
        // successfully deliberately does NOT stick — the flow proceeds).
        if (deviceCancelRequestedRef.current && isUserCancellation(error)) {
          deviceCancelSettledRef.current = true;
        }
        throw error;
      } finally {
        deviceSignProviderRef.current = null;
        deviceSignActiveRef.current = false;
        setDeviceSignActive(false);
        // Either outcome consumes a pending cancel request — the UI must
        // never wedge on the disabled cancel button after a settle.
        deviceCancelRequestedRef.current = false;
        setDeviceCancelRequested(false);
      }
    },
    [],
  );

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
  const gate = useProtocolGateState();
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
      deviceCancelSettledRef.current = false;
      advanceStep(DepositFlowStep.DERIVE_VAULT_SECRET);
      setPerVaultSteps(
        vaultAmounts.map(() => DepositFlowStep.DERIVE_VAULT_SECRET),
      );

      // Track background operation failures
      const warnings: DepositWarning[] = [];
      const recordWarning = (warning: DepositWarning) => {
        warnings.push(warning);
        setLastWarnings([...warnings]);
      };

      // Track registry entries we primed so we can release them on
      // user-cancel (bound `authAnchorHex` lifetime to the flow).
      const primedRegistryTxids: string[] = [];

      // Flips once the ETH batch registration is mined: a cancel after that
      // point gets the after-registration copy pointing at the resume path.
      let registeredOnEth = false;

      try {
        // Deposit (pegin) is a protocol-scope ENTRY action. The dialog-open is
        // gated and the on-chain register below is contract-enforced
        // (`whenNotFrozen`), but guard the execution path too: abort cleanly
        // here — before the wallet popup and the doomed on-chain register —
        // rather than letting it revert, if the protocol is frozen/paused.
        if (isDepositBlocked(gate)) {
          throw new Error(COPY.deposit.errors.protocolPaused);
        }

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

        // The VP commission the depositor was shown must be known before we
        // bind it on-chain. If it never loaded, refuse to submit rather than
        // letting the SDK bind `maxAcceptableCommissionBps` to an unquoted
        // fresh read — that is the silent-overcharge path TRV-032 describes.
        if (quotedCommissionBps === undefined) {
          throw new Error(COMMISSION_UNAVAILABLE_ERROR);
        }

        // Generate batch ID for tracking
        const batchId = uuidv4();

        logger.event(TELEMETRY_EVENT.DEPOSIT_STARTED, {
          level: "info",
          category: "deposit",
          tags: { providerId: shortId(primaryProvider) },
          batchId,
          vaultCount: vaultAmounts.length,
          amountBucket: amountBucket(
            satoshiToBtcNumber(vaultAmounts.reduce((sum, a) => sum + a, 0n)),
          ),
        });

        // ========================================================================
        // Step 1: Get shared resources
        // ========================================================================

        // Get ETH wallet client once (chain switch + wallet client are reusable)
        const walletClient = await getEthWalletClient(confirmedEthAddress);

        // ========================================================================
        // Step 2: Create Batch Pre-PegIn (all vaults in one BTC tx)
        // ========================================================================

        advanceStep(DepositFlowStep.DERIVE_VAULT_SECRET);
        // A single peg-in PSBT signs via signPsbt (the SDK's
        // signPsbtsWithFallback routes lone PSBTs there), ticking the counter
        // once. Multi-vault: one native batch popup when the wallet supports
        // signPsbts — the (x of n) sub-counter jumps 0 -> N around the one
        // call — else sequential signPsbt ticks it per signature.
        const signOnePeginPsbt: typeof confirmedBtcWallet.signPsbt = async (
          psbtHex,
          opts,
        ) => {
          advanceStep(DepositFlowStep.SIGN_PEGIN_BTC);
          const signed = await runCancellableSign(confirmedBtcWallet, () =>
            confirmedBtcWallet.signPsbt(psbtHex, opts),
          );
          setPeginSigningProgress((prev) =>
            prev
              ? { ...prev, completed: Math.min(prev.completed + 1, prev.total) }
              : prev,
          );
          return signed;
        };
        // Native batch path: one popup; the counter jumps 0 -> N around the call.
        const signPeginBatch: typeof confirmedBtcWallet.signPsbts = async (
          psbtHexes,
          opts,
        ) => {
          advanceStep(DepositFlowStep.SIGN_PEGIN_BTC);
          setPeginSigningProgress({ completed: 0, total: psbtHexes.length });
          const signed = await runCancellableSign(confirmedBtcWallet, () =>
            confirmedBtcWallet.signPsbts!(psbtHexes, opts),
          );
          setPeginSigningProgress({
            completed: psbtHexes.length,
            total: psbtHexes.length,
          });
          return signed;
        };

        const phaseTrackingBtcWallet: typeof confirmedBtcWallet &
          Partial<DepositTermsApprover> = {
          ...confirmedBtcWallet,
          deriveContextHash: (appName, context) => {
            advanceStep(DepositFlowStep.DERIVE_VAULT_SECRET);
            return confirmedBtcWallet.deriveContextHash(appName, context);
          },
          signPsbt: signOnePeginPsbt,
          ...(typeof confirmedBtcWallet.signPsbts === "function"
            ? { signPsbts: signPeginBatch }
            : {}),
          // Object spread drops prototype methods — see forwardDepositApproval.
          ...forwardDepositApproval(confirmedBtcWallet),
        };

        // No hard pre-filter. `DuplicateHashlock` on `BTCVaultRegistry`
        // blocks *identical* UTXO-set reuse on-chain; the modal banner
        // advises on overlap with pending vaults. Residual: partial
        // overlap (e.g. {U1,U2} vs {U1,U3}) derives a different hashlock
        // — both register, only one Pre-PegIn can broadcast, the other
        // strands until expiry.

        const [
          vaultKeeperReader,
          universalChallengerReader,
          operationKeyReader,
        ] = await Promise.all([
          getVaultKeeperReader(),
          getUniversalChallengerReader(),
          getOperationKeyReader(),
        ]);
        const validatedKeys = await validateOnChainParticipantKeys({
          vaultRegistryReader: getVaultRegistryReader(),
          vaultKeeperReader,
          universalChallengerReader,
          operationKeyReader,
          vaultProviderEthAddress: selectedProviders[0] as Address,
          applicationEntryPoint: selectedApplication as Address,
          expectedVaultProviderBtcPubkey: vaultProviderBtcPubkey,
          expectedVaultKeeperBtcPubkeys: vaultKeeperBtcPubkeys,
          expectedUniversalChallengerBtcPubkeys: universalChallengerBtcPubkeys,
          onIndexerServingOperationKeys: (message) => logger.info(message),
          onIndexerHintsInconsistent: (message) =>
            logger.error(new Error(message), {
              tags: {
                component: "useDepositFlow",
                phase: "validate-participant-keys",
              },
            }),
        });

        // Prime the peg-in signing sub-counter (one tx per vault) before the
        // commit pass drives the wallet popup(s).
        setPeginSigningProgress({ completed: 0, total: vaultAmounts.length });

        // Approval (policy) wallets dictate the change address (BIP-86 change
        // branch); software wallets keep change on the connected address.
        const prePeginChangeAddress = supportsDepositApproval(
          phaseTrackingBtcWallet,
        )
          ? await requireChangeAddress(phaseTrackingBtcWallet)
          : confirmedBtcAddress;

        const batchResult = await preparePeginTransaction(
          phaseTrackingBtcWallet,
          walletClient,
          {
            // Read atomically with the offchain params below. The contract
            // stamps whatever version is active at registration-tx time, so
            // the post-registration verifyRegisteredVaultVersions call
            // asserts the stamp matches this build-time value before the
            // BTC broadcast.
            vaultCoreVersion: config.activeVaultCoreVersion,
            pegInAmounts: vaultAmounts,
            protocolFeeRate: config.offchainParams.feeRate,
            minPeginFeeRate: config.offchainParams.minPeginFeeRate,
            mempoolFeeRate,
            changeAddress: prePeginChangeAddress,
            vaultProviderBtcPubkey: validatedKeys.vaultProviderBtcPubkeyXOnly,
            commissionBps: quotedCommissionBps,
            vaultKeeperBtcPubkeys: validatedKeys.vaultKeeperBtcPubkeysSorted,
            universalChallengerBtcPubkeys:
              validatedKeys.universalChallengerBtcPubkeysSorted,
            timelockPegin,
            timelockAssert: Number(config.offchainParams.timelockAssert),
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
        advanceStep(DepositFlowStep.SIGN_POP);
        // Wrapped as a whole: the BIP-322 signMessage inside is the
        // cancellable device call, and its prep reads are cached/fast.
        const popSignature = await runCancellableSign(confirmedBtcWallet, () =>
          signProofOfPossession(confirmedBtcWallet, walletClient),
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
        advanceStep(DepositFlowStep.SUBMIT_PEGIN);
        const batchRegistration = await registerPeginBatchAndWait({
          btcWalletProvider: confirmedBtcWallet,
          walletClient,
          vaultProviderAddress: primaryProvider,
          unsignedPrePeginTx: batchResult.fundedPrePeginTxHex,
          requests: batchRequests,
          popSignature,
          quotedCommissionBps,
        });
        registeredOnEth = true;

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

        // One milestone per vault (scalar vaultId) so the whole post-registration
        // funnel — registered, broadcast, activated — joins on a single `vaultId`
        // field. `deposit.started` stays batch-level (it fires before any vaultId
        // exists); group the funnel by `batchId` and scale by `vaultCount`.
        for (const peginResult of peginResults) {
          logger.event(TELEMETRY_EVENT.DEPOSIT_REGISTERED, {
            level: "info",
            category: "deposit",
            tags: {
              vaultId: shortId(peginResult.vaultId),
              providerId: shortId(primaryProvider),
            },
            batchId,
            ethTxHash: shortId(batchRegistration.ethTxHash),
            vaultCount: peginResults.length,
          });
        }

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
            buildVaultCoreVersion: config.activeVaultCoreVersion,
            // RFC-006: pin the keys the scripts were actually built with, so a
            // rotation landing before a later resume can't be broadcast over.
            buildParticipantOperationKeys: {
              vaultProvider: validatedKeys.vaultProviderBtcPubkeyXOnly,
              vaultKeepers: validatedKeys.vaultKeeperBtcPubkeysSorted,
              universalChallengers:
                validatedKeys.universalChallengerBtcPubkeysSorted,
            },
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
            if (!warnings.some((w) => w.stage === "persistence")) {
              recordWarning({
                stage: "persistence",
                terminal: true,
                message: COPY.deposit.warnings.depositRecordNotSaved,
              });
            }
          }
        }

        // ========================================================================
        // Ethereum finality gate. Committing BTC to the HTLC while the
        // registration is still reorg-exposed can strand the deposit: the vault
        // record vanishes from the chain while the BTC stays locked until the
        // HTLC refund timelock (~3 days).
        //
        // Placed AFTER the pending records are persisted above. Those records
        // carry the build-version and participant-key stamps, and the resume
        // path SKIPS both of those checks when the stamp is absent — so a tab
        // close during this ~1.6 min wait must not be able to leave a
        // stamp-less record behind. As a bonus, the two verification reads
        // below now run against state that is itself 8 blocks past the
        // registration instead of racing it.
        // ========================================================================
        try {
          await waitForEthRegistrationDepth({
            vaultIds: batchRegistration.vaults.map((v) => v.vaultId as Hex),
            onProgress: setEthConfirmationDetail,
            signal,
          });
        } finally {
          setEthConfirmationDetail(null);
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
            expectedVaultCoreVersion: config.activeVaultCoreVersion,
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

        // RFC-006 read-after-mine. The vault froze its key epochs when
        // `submitPeginRequest` executed, so an operator rotating between our
        // key read and that execution would leave the registered vault bonded
        // to keys other than the ones baked into the Pre-PegIn we are about to
        // broadcast. Re-resolve against the frozen epochs and fail closed.
        //
        // Runs after the version check on purpose: a version mismatch has the
        // clearer message, and re-resolving against an already-drifted roster
        // version would report a key diff caused by a version diff.
        //
        // Outside the cleanup above by design. Key drift must leave the pending
        // records in place: they hold the build-time key stamp, which is the
        // only thing that lets a later resume re-detect the drift. Dropping
        // them would let the resume path fall back to the indexer's copy, pass
        // the `prePeginTxHash` check, and broadcast the Pre-PegIn this refused.
        await verifyRegisteredParticipantKeys({
          vaultRegistryReader: getVaultRegistryReader(),
          operationKeyReader,
          vaultIds: batchRegistration.vaults.map((v) => v.vaultId as Hex),
          expected: validatedKeys.participantKeys,
        });

        // ========================================================================
        // Step 4b: Broadcast Pre-PegIn transaction to Bitcoin
        // Broadcast immediately after ETH registration so the VP can verify
        // the Pre-PegIn inputs on the Bitcoin network when it processes the
        // Ethereum event.
        // ========================================================================

        advanceStep(DepositFlowStep.BROADCAST_PRE_PEGIN);
        setPerVaultSteps(
          vaultAmounts.map(() => DepositFlowStep.BROADCAST_PRE_PEGIN),
        );

        let prePeginBroadcastTxid: string;
        try {
          prePeginBroadcastTxid = await broadcastPrePeginTransaction({
            unsignedTxHex: batchResult.fundedPrePeginTxHex,
            btcWalletProvider: {
              signPsbt: async (psbtHex: string) => {
                const signedPsbtHex = await runCancellableSign(
                  confirmedBtcWallet,
                  () => confirmedBtcWallet.signPsbt(psbtHex),
                );
                // A late cancel that still signed successfully proceeds
                // elsewhere — but here the next step is the irreversible
                // pushTx, so honor the cancel: throw before the tx leaves,
                // keeping the records PENDING and resumable (Broadcast CTA).
                if (lastSignSettledWithCancelPendingRef.current) {
                  deviceCancelSettledRef.current = true;
                  throw Object.assign(
                    new Error(
                      "Signing canceled — the signed Pre-PegIn was not broadcast",
                    ),
                    { code: WALLET_CONNECTION_REJECTED_CODE },
                  );
                }
                return signedPsbtHex;
              },
              deriveContextHash: (appName: string, context: string) =>
                confirmedBtcWallet.deriveContextHash(appName, context),
              // Object spread drops prototype methods — see forwardDepositApproval.
              ...forwardDepositApproval(confirmedBtcWallet),
            },
            depositorBtcPubkey: batchResult.depositorBtcPubkey,
            expectedUtxos: utxosToExpectedRecord(batchResult.selectedUTXOs),
            depositTerms: batchResult.depositTerms,
          });
        } catch (error) {
          // Preserve a typed intent rejection so the error mapper can show the
          // intent-rejection copy instead of a generic broadcast failure — the
          // broadcast service already keeps it typed at its boundary.
          if (isDepositTermsRejectedError(error)) {
            throw error;
          }
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          // `cause` keeps the typed inner error visible to the cause-walking
          // classifiers (user cancellation, method-not-supported) in the
          // mappers.
          throw new Error(
            `Failed to broadcast batch Pre-PegIn transaction: ${errorMsg}`,
            { cause: error },
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

        // Per vault (scalar vaultId) so each committed vault has a broadcast
        // milestone that the per-vault stall alert can join against its
        // activation.activated. All siblings share one Pre-PegIn tx/txid.
        for (const peginResult of peginResults) {
          logger.event(TELEMETRY_EVENT.DEPOSIT_BROADCAST_SUCCEEDED, {
            level: "info",
            category: "deposit",
            tags: { vaultId: shortId(peginResult.vaultId) },
            batchId,
            prePeginTxid: shortId(prePeginBroadcastTxid),
            vaultCount: peginResults.length,
          });
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
          const pinnedServerPubkey = await resolveVpAuthPinnedPubkey(
            provider.id as Address,
          );
          for (const r of broadcastedResults) {
            const peginTxid = stripHexPrefix(r.peginTxHash);
            primeVpTokenRegistry({
              baseUrl: vpBaseUrl,
              peginTxid,
              authAnchorHex,
              pinnedServerPubkey,
              depositorBtcPubkey: batchResult.depositorBtcPubkey,
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

        advanceStep(DepositFlowStep.AWAIT_BTC_CONFIRMATION);
        setPerVaultSteps(
          broadcastedResults.map(() => DepositFlowStep.AWAIT_BTC_CONFIRMATION),
        );
        // Snapshot the BTC-wait inputs. The Pre-PegIn broadcast txid is the tx
        // that lands on Bitcoin (multi-vault siblings share one broadcast).
        // requiredDepth is pinned to the offchain-params version this deposit
        // registered against — the VP gates on that version's minPrepeginDepth
        // (btc-vault claimer/pegin.rs check_prepegin_depth_and_transition), so
        // a later governance change must not move the displayed target. The
        // panel itself renders at the AWAIT_PAYOUT_TRANSACTIONS step (that's
        // where the minPrepeginDepth wait actually happens); we capture the
        // values here at broadcast time.
        setBtcConfirmationDetail({
          prePeginTxid: prePeginBroadcastTxid,
          requiredDepth: config.offchainParams.minPrepeginDepth,
          depositIds: broadcastedResults.map((r) => r.vaultId),
        });
        setIsWaiting(true);

        let baseStep: DepositFlowStep = DepositFlowStep.AWAIT_BTC_CONFIRMATION;
        const postBroadcastBtcWallet: typeof confirmedBtcWallet &
          Partial<DepositTermsApprover> = {
          ...confirmedBtcWallet,
          // `isWaiting` flips to `false` while a popup is open and back
          // to `true` after it closes, so the SDK polling that follows
          // remains "Close & continue later"-able.
          deriveContextHash: async (appName, context) => {
            const returnStep = baseStep;
            if (baseStep === DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS) {
              advanceStep(DepositFlowStep.SIGN_AUTH_ANCHOR);
            } else if (baseStep === DepositFlowStep.SUBMIT_WOTS_KEYS) {
              advanceStep(DepositFlowStep.SUBMIT_WOTS_KEYS);
            }
            setIsWaiting(false);
            try {
              return await confirmedBtcWallet.deriveContextHash(
                appName,
                context,
              );
            } finally {
              setIsWaiting(true);
              advanceStep(returnStep);
            }
          },
          signPsbt: async (psbtHex, opts) => {
            if (payoutClaimersDoneRef.current) {
              advanceStep(DepositFlowStep.SIGN_DEPOSITOR_GRAPH);
              setPayoutSigningProgress({
                phase: "graph",
                completed: 0,
                total: 1,
              });
            }
            setIsWaiting(false);
            try {
              return await runCancellableSign(confirmedBtcWallet, () =>
                confirmedBtcWallet.signPsbt(psbtHex, opts),
              );
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
                    advanceStep(DepositFlowStep.SIGN_DEPOSITOR_GRAPH);
                    setPayoutSigningProgress({
                      phase: "graph",
                      completed: 0,
                      total: psbtHexes.length,
                    });
                  }
                  setIsWaiting(false);
                  try {
                    return await runCancellableSign(confirmedBtcWallet, () =>
                      confirmedBtcWallet.signPsbts!(psbtHexes, opts),
                    );
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
          // Object spread drops prototype methods — see forwardDepositApproval.
          ...forwardDepositApproval(confirmedBtcWallet),
        };

        // Track per-vault outcomes so failed lanes don't block healthy siblings
        const wotsFailedVaultIds = new Set<string>();

        const MAX_WOTS_ATTEMPTS = 2;

        baseStep = DepositFlowStep.SUBMIT_WOTS_KEYS;

        const { readyVaultIds, terminalVaultIds } = await waitForWotsReadiness({
          vaults: broadcastedResults.map((result) => ({
            vaultId: result.vaultId,
          })),
          providerAddress: provider.id,
          signal,
        });

        for (const result of broadcastedResults) {
          signal.throwIfAborted();

          if (!readyVaultIds.has(result.vaultId)) {
            recordWarning({
              vaultId: result.vaultId,
              stage: "wots",
              terminal: terminalVaultIds.has(result.vaultId),
              message: terminalVaultIds.has(result.vaultId)
                ? COPY.deposit.warnings.wotsReadinessTerminal(
                    result.vaultIndex + 1,
                  )
                : COPY.deposit.warnings.wotsReadinessTimeout(
                    result.vaultIndex + 1,
                  ),
            });
            wotsFailedVaultIds.add(result.vaultId);
            continue;
          }

          // Mark the current vault being processed so the split-deposit UI
          // can show per-vault progression for the WOTS phase.
          setCurrentVaultIndex(result.vaultIndex);
          advanceStep(DepositFlowStep.SUBMIT_WOTS_KEYS);
          setPerVaultSteps((prev) =>
            prev.map((step, index) =>
              index === result.vaultIndex
                ? DepositFlowStep.SUBMIT_WOTS_KEYS
                : step,
            ),
          );

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
              // Mirrors the resume path: the dashboard row polls the VP for
              // `needsWotsKey` and would keep offering "Submit WOTS Key" until
              // the daemon advances. App-scoped, so it survives this modal.
              markWotsSubmitted(result.vaultId);
              setPerVaultSteps((prev) =>
                prev.map((step, index) =>
                  index === result.vaultIndex
                    ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
                    : step,
                ),
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
              recordWarning({
                vaultId: result.vaultId,
                stage: "wots",
                terminal: false,
                message: COPY.deposit.warnings.wotsSubmissionFailed(
                  result.vaultIndex + 1,
                  errorMsg,
                ),
              });
              logger.error(
                error instanceof Error ? error : new Error(String(error)),
                {
                  // Tagged so the Sentry-side cancellation drop keeps it: the
                  // loop continues to the next vault, so a rejected prompt here
                  // leaves THIS vault without its WOTS key while the deposit
                  // proceeds. That partial state is the reportable event even
                  // though the cause is a user cancellation.
                  tags: { partialFailure: "multi-vault" },
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

        baseStep = DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS;
        advanceStep(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS);
        setCurrentVaultIndex(null);

        const payoutCandidateResults = broadcastedResults.filter(
          (result) => !wotsFailedVaultIds.has(result.vaultId),
        );

        setPerVaultSteps((prev) =>
          prev.map((step, index) =>
            payoutCandidateResults.some((result) => result.vaultIndex === index)
              ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
              : step,
          ),
        );

        const {
          readyVaultIds: payoutReadyVaultIds,
          terminalVaultIds: payoutTerminalVaultIds,
        } = await waitForPayoutReadiness({
          vaults: payoutCandidateResults.map((result) => ({
            vaultId: result.vaultId,
          })),
          providerAddress: provider.id,
          signal,
        });

        for (let vi = 0; vi < broadcastedResults.length; vi++) {
          const result = broadcastedResults[vi];

          signal.throwIfAborted();

          // A settled user cancel stops the loop: the next iteration would
          // re-run the full device ceremony (requireFreshDeviceCeremony)
          // seconds after the user asked to stop. Remaining vaults are left
          // unattempted (no warning), not failed. Backstop only: the settle
          // rejects into the catch below, whose break is the operative stop.
          if (deviceCancelSettledRef.current) break;

          // Skip vaults whose WOTS key submission failed — the VP won't have
          // the keys needed, so payout signing would timeout.
          if (wotsFailedVaultIds.has(result.vaultId)) continue;

          if (!payoutReadyVaultIds.has(result.vaultId)) {
            if (payoutTerminalVaultIds.has(result.vaultId)) {
              recordWarning({
                vaultId: result.vaultId,
                stage: "payout",
                terminal: true,
                message: COPY.deposit.warnings.payoutReadinessTerminal(
                  result.vaultIndex + 1,
                ),
              });
            }
            setPerVaultSteps((prev) =>
              prev.map((step, index) =>
                index === vi ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS : step,
              ),
            );
            continue;
          }

          try {
            setCurrentVaultIndex(vi);
            advanceStep(DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS);
            setPerVaultSteps((prev) =>
              prev.map((step, index) =>
                index === vi ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS : step,
              ),
            );
            setIsWaiting(true);
            payoutClaimersDoneRef.current = false;

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
              depositTerms: batchResult.depositTerms,
              signal,
              onProgress: (p) => {
                if (!p) return;
                setPayoutSigningProgress(p);
                const nextStep = payoutSigningStep(p.phase);
                advanceStep(nextStep);
                setPerVaultSteps((prev) =>
                  prev.map((step, index) => (index === vi ? nextStep : step)),
                );
                payoutClaimersDoneRef.current =
                  p.total > 0 && p.completed >= p.total;
              },
            });

            advanceStep(DepositFlowStep.AWAIT_VP_VERIFICATION);
            setPerVaultSteps((prev) =>
              prev.map((step, index) =>
                index === vi ? DepositFlowStep.AWAIT_VP_VERIFICATION : step,
              ),
            );
          } catch (error) {
            // If the user cancelled, stop immediately — don't continue with other vaults
            if (signal.aborted) throw error;

            // A settled self-cancel is a stop, not a per-vault failure: mark
            // THIS vault cancelled and end the loop. Routine drop-off — no
            // partial-failure telemetry.
            if (deviceCancelSettledRef.current) {
              // ResumeSignContent reads this to withhold its mount auto-run —
              // the handoff must not re-prompt the device after the cancel.
              markPayoutSignCanceled(result.vaultId);
              recordWarning({
                vaultId: result.vaultId,
                stage: "payout",
                terminal: false,
                message: COPY.deposit.warnings.payoutSigningCanceled(
                  result.vaultIndex + 1,
                ),
              });
              // Post-loop invariant: unsigned vaults rest at the payout wait,
              // not the mid-signing step onProgress last set.
              setPerVaultSteps((prev) =>
                prev.map((step, index) =>
                  index === vi
                    ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
                    : step,
                ),
              );
              break;
            }

            if (isPayoutReadinessTimeout(error)) {
              setPerVaultSteps((prev) =>
                prev.map((step, index) =>
                  index === vi
                    ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS
                    : step,
                ),
              );
              continue;
            }

            const errorMsg =
              error instanceof Error ? error.message : String(error);
            recordWarning({
              vaultId: result.vaultId,
              stage: "payout",
              terminal: false,
              message: COPY.deposit.warnings.payoutSigningFailed(
                result.vaultIndex + 1,
                errorMsg,
              ),
            });
            logger.error(
              error instanceof Error ? error : new Error(String(error)),
              {
                // See the WOTS site above: the loop continues, so a rejected
                // prompt leaves this vault under-signed while the deposit
                // proceeds. Exempt from the cancellation drop.
                tags: { partialFailure: "multi-vault" },
                data: {
                  context:
                    "[Multi-Vault] Failed to sign or submit payouts for vault",
                  vaultId: result.vaultId,
                  providerAddress: provider.id,
                },
              },
            );
            // Post-loop invariant: unsigned vaults rest at the payout wait,
            // not the mid-signing step onProgress last set.
            setPerVaultSteps((prev) =>
              prev.map((step, index) =>
                index === vi ? DepositFlowStep.AWAIT_PAYOUT_TRANSACTIONS : step,
              ),
            );
            // Continue with other vaults
          }
        }

        setPayoutSigningProgress(null);
        setCurrentVaultIndex(null);

        // Inline payout signing is best-effort. Signed vaults are left at
        // AWAIT_VP_VERIFICATION, while vaults still waiting on payout prep stay
        // at AWAIT_PAYOUT_TRANSACTIONS. The in-modal continuation view polls
        // each vault and drives any remaining payout signing + activation.
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
          // A settled self-cancel gets its own copy: the generic mapper reads
          // the wallet's CONNECTION_REJECTED as "You rejected the request in
          // your wallet. Click Retry" — misattributed, and naming a button
          // this surface doesn't render. Post-registration cancels get the
          // variant pointing at the resume path — vaults are already on-chain.
          setError(
            deviceCancelSettledRef.current && isUserCancellation(err)
              ? registeredOnEth
                ? {
                    title:
                      COPY.deposit.errors.signingCanceledAfterRegistration
                        .title,
                    body: COPY.deposit.errors.signingCanceledAfterRegistration
                      .body,
                  }
                : {
                    title: COPY.deposit.errors.signingCanceled.title,
                    body: COPY.deposit.errors.signingCanceled.body,
                  }
              : mapDepositError(err),
          );
          logger.error(err instanceof Error ? err : new Error(String(err)), {
            tags: { depositStep: DepositFlowStep[currentStepRef.current] },
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
      advanceStep,
      runCancellableSign,
      gate,
      vaultAmounts,
      mempoolFeeRate,
      btcWalletProvider,
      btcConnector?.connectedWallet?.id,
      depositorEthAddress,
      selectedApplication,
      selectedProviders,
      quotedCommissionBps,
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

  const cancelDeviceSign = useCallback(() => {
    // Cancel the ceremony on the provider that started it — never the live
    // prop, which a mid-prompt wallet swap can replace.
    const provider = deviceSignProviderRef.current;
    if (!deviceSignActiveRef.current) return;
    if (!supportsCancelSigning(provider)) return;
    deviceCancelRequestedRef.current = true;
    setDeviceCancelRequested(true);
    // Device-only cancel (aborting the flow controller reads as a closed
    // modal). Settles at the next device exchange boundary: pre-broadcast =
    // "Signing canceled" callout; post-broadcast payout stage = cancelled
    // warning and the loop stops.
    provider.cancelSigning();
  }, []);

  // The ref is only ever set/cleared together with the `deviceSignActive`
  // state, so this render read stays in sync.
  const canCancelDeviceSign =
    deviceSignActive && supportsCancelSigning(deviceSignProviderRef.current);

  return {
    executeDeposit,
    abort,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    /** Soft warnings from the most recent flow (empty until completion). */
    lastWarnings,
    isWaiting,
    payoutSigningProgress,
    peginSigningProgress,
    perVaultSteps,
    btcConfirmationDetail,
    ethConfirmationDetail,
    canCancelDeviceSign,
    deviceCancelRequested,
    cancelDeviceSign,
  };
}
