import { Button, Heading, Loader, Text } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";

import { DetailsCard, type DetailRow } from "@/components/shared";
import { useProtocolParamsContext } from "@/context/ProtocolParamsContext";
import { useNetworkFees } from "@/hooks/useNetworkFees";
import { formatBtcAmount, formatUsdValue } from "@/utils/formatting";

interface WithdrawReviewContentProps {
  totalAmountBtc: number;
  totalAmountUsd: number;
  isProcessing: boolean;
  onConfirm: () => void;
}

export function WithdrawReviewContent({
  totalAmountBtc,
  totalAmountUsd,
  isProcessing,
  onConfirm,
}: WithdrawReviewContentProps) {
  const { defaultFeeRate } = useNetworkFees();
  const { vpCommissionBps } = useProtocolParamsContext();

  const rows: DetailRow[] = useMemo(() => {
    const protocolFeeBtc = totalAmountBtc * (vpCommissionBps / 10_000);
    const protocolFeeUsd = totalAmountUsd * (vpCommissionBps / 10_000);

    return [
      {
        label: "Withdraw Amount",
        value: (
          <span>
            {formatBtcAmount(totalAmountBtc)}{" "}
            <span className="text-accent-secondary">
              {formatUsdValue(totalAmountUsd)}
            </span>
          </span>
        ),
      },
      {
        label: "Network Fee Rate",
        value: defaultFeeRate > 0 ? `${defaultFeeRate} sats/vB` : "Loading...",
      },
      {
        label: "Protocol Fee",
        value: (
          <span>
            {formatBtcAmount(protocolFeeBtc)}{" "}
            <span className="text-accent-secondary">
              {formatUsdValue(protocolFeeUsd)}
            </span>
          </span>
        ),
      },
    ];
  }, [totalAmountBtc, totalAmountUsd, defaultFeeRate, vpCommissionBps]);

  return (
    <div className="w-full">
      <Heading variant="h5" className="text-accent-primary">
        Review Withdraw
      </Heading>

      <div className="mt-6 flex flex-col gap-6">
        <DetailsCard rows={rows} />

        <Button
          variant="contained"
          color="secondary"
          className="w-full"
          disabled={isProcessing}
          onClick={onConfirm}
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader size={16} className="text-accent-contrast" />
              <Text as="span" variant="body2" className="text-accent-contrast">
                Processing
              </Text>
            </span>
          ) : (
            "Confirm"
          )}
        </Button>
      </div>
    </div>
  );
}
