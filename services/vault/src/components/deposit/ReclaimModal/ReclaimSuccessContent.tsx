import { Button, Heading, Text } from "@babylonlabs-io/core-ui";

import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { getBtcExplorerTxUrl } from "@/utils/explorer";
import { formatSats } from "@/utils/formatting";

const btcConfig = getNetworkConfigBTC();

interface ReclaimSuccessContentProps {
  reclaimTxId: string;
  /** Gross reserve swept, for the confirmation sentence. */
  amountSats: bigint | null;
  onDone: () => void;
}

export function ReclaimSuccessContent({
  reclaimTxId,
  amountSats,
  onDone,
}: ReclaimSuccessContentProps) {
  const explorerUrl = getBtcExplorerTxUrl(reclaimTxId);

  return (
    <div className="mx-auto flex w-full max-w-[564px] flex-col gap-10 rounded-3xl border border-secondary-strokeLight bg-surface px-6 pb-6 pt-10 dark:border-secondary-strokeDark">
      <div className="flex flex-col items-center gap-6">
        <img
          src={btcConfig.icon}
          alt={btcConfig.name}
          className="h-[100px] w-[100px]"
        />
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <Heading variant="h5" className="text-accent-primary">
            {COPY.reclaim.success.heading}
          </Heading>
          <Text variant="body1" className="text-accent-secondary">
            {COPY.reclaim.success.body(
              amountSats !== null
                ? COPY.reclaim.rowAmount(formatSats(amountSats))
                : COPY.reclaim.success.amountFallback,
            )}
          </Text>
        </div>
      </div>

      <div className="flex w-full gap-4">
        <Button
          variant="outlined"
          color="primary"
          className="flex-1 whitespace-nowrap !border-secondary-strokeLight"
          onClick={() => {
            window.open(explorerUrl, "_blank", "noopener,noreferrer");
          }}
        >
          {COPY.reclaim.success.explorerButton}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          className="flex-1 whitespace-nowrap"
          onClick={onDone}
          data-testid="reclaim-done-button"
        >
          {COPY.reclaim.success.doneButton}
        </Button>
      </div>
    </div>
  );
}
