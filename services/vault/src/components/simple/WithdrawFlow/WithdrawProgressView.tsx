import {
  Button,
  Heading,
  Stepper,
  Text,
  type StepperItem,
} from "@babylonlabs-io/core-ui";

const WITHDRAW_STEPS: StepperItem[] = [
  { label: "Wait", description: "(~ 72 hrs)" },
  { label: "Sign transactions", description: "(0 of 6)" },
  { label: "Wait", description: "(~ 5 mins)" },
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
          Your withdraw has been initiated. The process will take approximately
          72 hours to complete.
        </Text>
      </div>
    </div>
  );
}
