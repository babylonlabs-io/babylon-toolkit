/**
 * DepositSignContent
 *
 * Renders the signing modal content for deposits. Always uses array-based
 * props — single vault is an array of 1. Multi-vault renders the same
 * stepper rows as single-vault; per-vault progress is surfaced via
 * `payoutSigningProgress`.
 */

import { Callout } from "@babylonlabs-io/core-ui";
import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";

import { computeDepositDerivedState } from "@/components/deposit/DepositSignModal/depositStepHelpers";
import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";
import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";
import { useDepositSigningNotification } from "@/hooks/deposit/useDepositSigningNotification";

import { DepositProgressView, DepositSummaryCard } from "./DepositProgressView";
import { PostDepositContinuationContent } from "./PostDepositContinuationContent";

interface DepositSignContentProps {
  vaultAmounts: bigint[];
  mempoolFeeRate: number;
  btcWalletProvider: BitcoinWallet;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  /** VP commission (bps) shown to the depositor for the primary provider. */
  quotedCommissionBps: number | undefined;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  /** Pending-vault overlap count for the predicted selection; null = none. */
  overlappingPendingVaultCount?: number | null;
  onClose: () => void;
  onRefetchActivities?: () => Promise<void>;
}

export function DepositSignContent({
  onClose,
  onRefetchActivities,
  vaultAmounts,
  overlappingPendingVaultCount = null,
  ...flowParams
}: DepositSignContentProps) {
  const {
    executeDeposit,
    abort,
    currentStep,
    currentVaultIndex,
    processing,
    error,
    lastWarnings,
    isWaiting,
    payoutSigningProgress,
    peginSigningProgress,
    perVaultSteps,
    btcConfirmationDetail,
  } = useDepositFlow({
    vaultAmounts,
    ...flowParams,
  });

  const [continuationVaultIds, setContinuationVaultIds] = useState<
    Hex[] | null
  >(null);

  const signingNotifier = useSigningNotificationOptional();

  // The flow no longer auto-starts on mount: the initial screen is a compact
  // summary card and the depositor begins signing by clicking "Sign". Once
  // started, the live stepper (DepositProgressView) takes over.
  const [started, setStarted] = useState(false);

  // Notify the depositor (if they've tabbed away) when the active flow reaches
  // a signing step. Gated on `started` so the initial DERIVE_VAULT_SECRET value
  // can't notify before the user clicks Sign.
  useDepositSigningNotification(currentStep, started);

  // While the flow is running it owns notifications in-modal; tell the
  // pending-deposit observer to stand down so it can't double-notify.
  useEffect(() => {
    signingNotifier?.setActiveFlow(processing);
    return () => signingNotifier?.setActiveFlow(false);
  }, [signingNotifier, processing]);

  const startFlow = useCallback(async () => {
    const result = await executeDeposit();
    if (result) {
      onRefetchActivities?.();
      setContinuationVaultIds(result.pegins.map((pegin) => pegin.vaultId));
    }
  }, [executeDeposit, onRefetchActivities]);

  // `executeDeposit` broadcasts BTC and has no internal re-entrancy guard, and
  // dropping `useRunOnce` removed its exactly-once protection. A fast double
  // click on Sign fires `handleSign` twice before the `started` re-render
  // unmounts the button, which would start (and broadcast) the deposit twice.
  // This ref restores the exactly-once guarantee regardless of click cadence.
  const hasStartedRef = useRef(false);

  const handleSign = useCallback(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    // The Sign click is a user gesture - the right moment to ask for OS
    // notification permission so we can later ping the depositor when a
    // signature is needed and they've switched tabs.
    signingNotifier?.requestPermission();
    setStarted(true);
    void startFlow();
  }, [startFlow, signingNotifier]);

  // Derived state
  const { isComplete, canClose, isProcessing, canContinueInBackground } =
    computeDepositDerivedState(
      currentStep,
      processing,
      isWaiting,
      error != null,
    );

  const handleClose = useCallback(() => {
    abort();
    onClose();
  }, [abort, onClose]);

  // UTXO-overlap banner: informational, user can dismiss for the rest of
  // the session. Hoisted above the success/processing split so it survives
  // the switch to PostDepositContinuation when `continuationVaultIds` is set.
  const [utxoBannerDismissed, setUtxoBannerDismissed] = useState(false);
  const banner = overlappingPendingVaultCount !== null &&
    !utxoBannerDismissed && (
      <div
        className="relative mb-3 rounded-lg bg-amber-100 px-4 py-3 pr-8 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        role="alert"
      >
        {COPY.deposit.warnings.reusesReservedUtxos(
          overlappingPendingVaultCount,
        )}
        <button
          type="button"
          aria-label={COPY.deposit.warnings.dismissReusesReservedUtxos}
          onClick={() => setUtxoBannerDismissed(true)}
          className="absolute right-2 top-2 text-base leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    );
  // Soft deposit-flow warnings from `useDepositFlow`: recoverable issues such
  // as local persistence failures or per-vault WOTS/payout steps that were
  // skipped/failed while the rest of the split deposit kept moving. Rendered
  // unfiltered here: in-progress warnings are final-by-construction (no resume
  // has happened, and there is no polling context to filter against). The
  // continuation branch filters stale ones via `ContinuationWarnings`.
  const warningCallouts = lastWarnings.map((warning) => (
    <Callout
      key={`${warning.vaultId ?? "global"}:${warning.stage}`}
      variant="warning"
    >
      {warning.message}
    </Callout>
  ));

  // Initial screen: compact summary card with a single "Sign" CTA. The flow
  // only begins once the depositor clicks Sign (see `handleSign`).
  if (!started) {
    return (
      <>
        {banner}
        <DepositSummaryCard onSign={handleSign} />
      </>
    );
  }

  if (
    continuationVaultIds &&
    continuationVaultIds.length > 0 &&
    flowParams.depositorEthAddress
  ) {
    return (
      <>
        {banner}
        <PostDepositContinuationContent
          vaultIds={continuationVaultIds}
          depositorEthAddress={flowParams.depositorEthAddress}
          warnings={lastWarnings}
          onClose={onClose}
        />
      </>
    );
  }

  return (
    <>
      {banner}
      {warningCallouts}

      <DepositProgressView
        currentStep={currentStep}
        error={error}
        isComplete={isComplete}
        isProcessing={isProcessing}
        canClose={canClose}
        canContinueInBackground={canContinueInBackground}
        payoutSigningProgress={payoutSigningProgress}
        peginSigningProgress={peginSigningProgress}
        vaultCount={vaultAmounts.length}
        currentVaultIndex={currentVaultIndex}
        perVaultSteps={perVaultSteps}
        onClose={handleClose}
        btcConfirmationDetail={btcConfirmationDetail}
      />
    </>
  );
}
