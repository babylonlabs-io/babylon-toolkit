import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { BTC_BLOCK_TIME_MINS } from "@/constants";
import { COPY } from "@/copy";
import { formatDuration } from "@/utils/formatting";

import { NominatedAddressValue } from "./NominatedAddressValue";

interface WithdrawProgressViewProps {
  /** Deduped payout BTC addresses, snapshotted at submit. */
  payoutAddresses: string[];
  /** Max `timelockAssert` (blocks) across the withdrawn vaults; drives the ETA. */
  assertTimelockBlocks: number;
  onClose: () => void;
}

export function WithdrawProgressView({
  payoutAddresses,
  assertTimelockBlocks,
  onClose,
}: WithdrawProgressViewProps) {
  const copy = COPY.withdraw.initiated;
  const estimatedDuration = formatDuration(
    assertTimelockBlocks * BTC_BLOCK_TIME_MINS,
  );

  return (
    <div className="w-full">
      <Heading variant="h5" className="text-accent-primary">
        {copy.title}
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <Text variant="body1" className="text-accent-primary">
          {copy.body}
        </Text>

        {payoutAddresses.length > 0 && (
          <div className="flex items-center justify-between">
            <Text variant="body2" className="text-accent-secondary">
              {COPY.withdraw.nominatedAddressLabel}
            </Text>
            <Text variant="body2" className="text-accent-primary">
              <NominatedAddressValue addresses={payoutAddresses} />
            </Text>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Text variant="body2" className="text-accent-secondary">
            {COPY.withdraw.estimatedTimeLabel}
          </Text>
          <Text variant="body2" className="text-accent-primary">
            ~{estimatedDuration}
          </Text>
        </div>

        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          onClick={onClose}
        >
          {copy.doneButton}
        </Button>
      </div>
    </div>
  );
}
