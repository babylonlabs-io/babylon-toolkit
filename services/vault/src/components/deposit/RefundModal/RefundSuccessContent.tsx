import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";

const btcConfig = getNetworkConfigBTC();

interface RefundSuccessContentProps {
  refundTxId: string;
  onDone: () => void;
}

export function RefundSuccessContent({
  refundTxId,
  onDone,
}: RefundSuccessContentProps) {
  const explorerUrl = `${btcConfig.mempoolApiUrl}/tx/${refundTxId}`;

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
            Broadcasting Refund
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            Refund transaction broadcast successfully.
          </Text>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full gap-4">
          <Button
            variant="outlined"
            color="primary"
            className="flex-1 whitespace-nowrap"
            onClick={() => {
              window.open(explorerUrl, "_blank", "noopener,noreferrer");
            }}
          >
            View on Blockchain explorer
          </Button>
          <Button
            variant="contained"
            color="secondary"
            className="flex-1 whitespace-nowrap"
            onClick={onDone}
          >
            Done
          </Button>
        </div>
        <Text
          variant="body2"
          className="text-center text-xs text-accent-secondary"
        >
          Do not spend the BTC used for this deposit until the transactions are
          confirmed
        </Text>
      </div>
    </div>
  );
}
