import {
  Button,
  Heading,
  Stepper,
  Text,
  type StepperItem,
} from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

/** Average Bitcoin block time in minutes */
const BTC_BLOCK_TIME_MINS = 10;
const MINS_PER_HOUR = 60;

/**
 * Number of payout transactions that need signing.
 * Corresponds to the depositor graph outputs: claim, challenge-response,
 * no-payout, payout-optimistic, payout-challenge, and payout-default.
 */
const PAYOUT_TX_COUNT = 6;

/** Approximate wait for Bitcoin confirmation after broadcast */
const CONFIRMATION_WAIT_MINS = 5;

interface WithdrawProgressViewProps {
  onClose: () => void;
}

export function WithdrawProgressView({ onClose }: WithdrawProgressViewProps) {
  const { timelockPegin } = useProtocolParamsContext();

  // Derive CSV wait from on-chain timelockPegin (in blocks) * avg block time
  const csvWaitHours = Math.ceil(
    (timelockPegin * BTC_BLOCK_TIME_MINS) / MINS_PER_HOUR,
  );

  const withdrawSteps: StepperItem[] = useMemo(
    () => [
      { label: "Wait", description: `(~ ${csvWaitHours} hrs)` },
      {
        label: "Sign transactions",
        description: `(0 of ${PAYOUT_TX_COUNT})`,
      },
      { label: "Wait", description: `(~ ${CONFIRMATION_WAIT_MINS} mins)` },
    ],
    [csvWaitHours],
  );

  return (
    <div className="w-full">
      <Heading variant="h5" className="text-accent-primary">
        Withdraw Progress
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <Stepper steps={withdrawSteps} currentStep={1} />

        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={onClose}
        >
          Done
        </Button>

        <Text
          variant="body2"
          className="text-center text-xs text-accent-secondary"
        >
          Your withdraw has been initiated. The process will take approximately{" "}
          {csvWaitHours} hours to complete.
        </Text>
      </div>
    </div>
  );
}
