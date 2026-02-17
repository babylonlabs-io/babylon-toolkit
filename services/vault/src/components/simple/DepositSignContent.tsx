import { Button, Heading, Loader, Text } from "@babylonlabs-io/core-ui";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Address } from "viem";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import {
  canCloseModal,
  DepositStep,
} from "@/components/deposit/DepositSignModal/constants";
import { useDepositFlow } from "@/hooks/deposit/useDepositFlow";
import type { PayoutSigningProgress } from "@/services/vault/vaultPayoutSignatureService";

import {
  DepositProgressStepper,
  type ProgressStepItem,
} from "./DepositProgressStepper";

interface DepositSignContentProps {
  amount: bigint;
  feeRate: number;
  btcWalletProvider: any;
  depositorEthAddress: Address | undefined;
  selectedApplication: string;
  selectedProviders: string[];
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
  onSuccess: (
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey: string,
  ) => void;
  onClose: () => void;
  onRefetchActivities?: () => Promise<void>;
}

/**
 * Map the internal DepositStep + isWaiting to a 1-indexed visual step (1-7).
 *
 * Visual steps (from Figma):
 * 1. Split UTXO's
 * 2. Sign proof of possession
 * 3. Submit peg-in requests
 * 4. Wait (~ 15 min)
 * 5. Sign payout transactions
 * 6. Wait (~ 12 mins)
 * 7. Submit peg-in transactions
 */
function getVisualStep(currentStep: DepositStep, isWaiting: boolean): number {
  switch (currentStep) {
    case DepositStep.SIGN_POP:
      return 2;
    case DepositStep.SUBMIT_PEGIN:
      return 3;
    case DepositStep.SIGN_PAYOUTS:
      return isWaiting ? 4 : 5;
    case DepositStep.BROADCAST_BTC:
      return isWaiting ? 6 : 7;
    case DepositStep.COMPLETED:
      return 8; // All 7 steps completed
    default:
      return 1;
  }
}

function buildStepItems(
  progress: PayoutSigningProgress | null,
): ProgressStepItem[] {
  const payoutTotal = progress?.total ?? 0;
  const payoutCompleted = progress?.completed ?? 0;

  return [
    { label: "Split UTXO's" },
    { label: "Sign proof of possession" },
    { label: "Submit peg-in requests" },
    { label: "Wait", description: "(~ 15 min)" },
    {
      label: "Sign payout transactions",
      description:
        payoutTotal > 0 ? `(${payoutCompleted} of ${payoutTotal})` : undefined,
    },
    { label: "Wait", description: "(~ 12 mins)" },
    { label: "Submit peg-in transactions" },
  ];
}

export function DepositSignContent({
  onClose,
  onSuccess,
  onRefetchActivities,
  ...flowParams
}: DepositSignContentProps) {
  const {
    executeDepositFlow,
    abort,
    currentStep,
    processing,
    error,
    isWaiting,
    payoutSigningProgress,
  } = useDepositFlow(flowParams);

  // Auto-start the flow on mount
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const result = await executeDepositFlow();
      if (result) {
        onRefetchActivities?.();
        onSuccess(result.btcTxid, result.ethTxHash, result.depositorBtcPubkey);
      }
    })();
  }, [executeDepositFlow, onRefetchActivities, onSuccess]);

  // Derived state
  const isComplete = currentStep === DepositStep.COMPLETED;
  const canClose = canCloseModal(currentStep, error, isWaiting);
  const isProcessing = (processing || isWaiting) && !error && !isComplete;
  const canContinueInBackground =
    isWaiting && currentStep >= DepositStep.SIGN_PAYOUTS && !error;

  const visualStep = getVisualStep(currentStep, isWaiting);
  const steps = useMemo(
    () => buildStepItems(payoutSigningProgress),
    [payoutSigningProgress],
  );

  const handleClose = useCallback(() => {
    abort();
    onClose();
  }, [abort, onClose]);

  return (
    <div className="w-full max-w-[520px]">
      <Heading variant="h5" className="text-accent-primary">
        Deposit Progress
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <DepositProgressStepper steps={steps} currentStep={visualStep} />

        {error && <StatusBanner variant="error">{error}</StatusBanner>}

        {isComplete && (
          <StatusBanner variant="success">
            Your Bitcoin transaction has been broadcast to the network. It will
            be confirmed after receiving the required number of Bitcoin
            confirmations.
          </StatusBanner>
        )}

        <Button
          disabled={!canClose}
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={handleClose}
        >
          {canContinueInBackground ? (
            "You can close and come back later"
          ) : error ? (
            "Close"
          ) : isComplete ? (
            "Complete"
          ) : isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader size={16} className="text-accent-contrast" />
              <Text as="span" variant="body2" className="text-accent-contrast">
                Sign
              </Text>
            </span>
          ) : (
            "Sign"
          )}
        </Button>
      </div>
    </div>
  );
}
