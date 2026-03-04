import {
  Button,
  Heading,
  Stepper,
  Text,
  type StepperItem,
} from "@babylonlabs-io/core-ui";

/** Approximate duration of the CSV (CheckSequenceVerify) lock period */
const CSV_WAIT_HOURS = 72;
/** Number of payout transactions that need signing */
const PAYOUT_TX_COUNT = 6;
/** Approximate wait for Bitcoin confirmation after broadcast */
const CONFIRMATION_WAIT_MINS = 5;

const WITHDRAW_STEPS: StepperItem[] = [
  { label: "Wait", description: `(~ ${CSV_WAIT_HOURS} hrs)` },
  { label: "Sign transactions", description: `(0 of ${PAYOUT_TX_COUNT})` },
  { label: "Wait", description: `(~ ${CONFIRMATION_WAIT_MINS} mins)` },
];

interface WithdrawProgressViewProps {
  onClose: () => void;
}

export function WithdrawProgressView({ onClose }: WithdrawProgressViewProps) {
  return (
    <div className="w-full">
      <Heading variant="h5" className="text-accent-primary">
        Withdraw Progress
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <Stepper steps={WITHDRAW_STEPS} currentStep={1} />

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
          {CSV_WAIT_HOURS} hours to complete.
        </Text>
      </div>
    </div>
  );
}
