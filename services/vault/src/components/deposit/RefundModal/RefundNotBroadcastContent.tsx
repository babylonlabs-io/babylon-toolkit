import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";

const btcConfig = getNetworkConfigBTC();

interface RefundNotBroadcastContentProps {
  onClose: () => void;
}

/**
 * Shown when an expired vault's Pre-PegIn transaction is not on Bitcoin —
 * there is no HTLC output to spend, so a refund would fail at broadcast.
 * The depositor's BTC was never locked; nothing needs to be recovered.
 */
export function RefundNotBroadcastContent({
  onClose,
}: RefundNotBroadcastContentProps) {
  return (
    <div className="mx-auto flex w-full max-w-[564px] flex-col gap-10 rounded-3xl border border-secondary-strokeLight bg-surface px-6 pb-6 pt-10">
      <div className="flex flex-col items-center gap-6">
        <img
          src={btcConfig.icon}
          alt={btcConfig.name}
          className="h-[100px] w-[100px]"
        />
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <Heading variant="h5" className="text-accent-primary">
            {COPY.deposit.refundNotBroadcast.heading}
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            {COPY.deposit.refundNotBroadcast.body}
          </Text>
        </div>
      </div>

      <Button
        variant="contained"
        color="secondary"
        className="w-full"
        onClick={onClose}
      >
        {COPY.deposit.refundNotBroadcast.doneButton}
      </Button>
    </div>
  );
}
