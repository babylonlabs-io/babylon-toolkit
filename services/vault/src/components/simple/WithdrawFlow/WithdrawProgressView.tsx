import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";

/** Average Bitcoin block time in minutes */
const BTC_BLOCK_TIME_MINS = 10;
const MINS_PER_HOUR = 60;

interface WithdrawProgressViewProps {
  onClose: () => void;
}

export function WithdrawProgressView({ onClose }: WithdrawProgressViewProps) {
  const { timelockPegin } = useProtocolParamsContext();

  // Derive estimated wait from on-chain timelockPegin (in blocks) * avg block time
  const estimatedHours = Math.ceil(
    (timelockPegin * BTC_BLOCK_TIME_MINS) / MINS_PER_HOUR,
  );

  return (
    <div className="w-full">
      <Heading variant="h5" className="text-accent-primary">
        Withdraw Initiated
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <Text variant="body1" className="text-accent-primary">
          Your withdrawal transaction has been successfully submitted. The vault
          provider will process your BTC and send it to your nominated address.
        </Text>

        <Text variant="body2" className="text-accent-secondary">
          Estimated time: ~{estimatedHours} hours
        </Text>

        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={onClose}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
