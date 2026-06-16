import {
  Button,
  Callout,
  Heading,
  Loader,
  Text,
} from "@babylonlabs-io/core-ui";
import {
  estimateRefundFeeSats,
  REFUND_MAX_FEE_FRACTION_DENOMINATOR,
  REFUND_MAX_FEE_FRACTION_NUMERATOR,
  REFUND_MAX_FEE_RATE_SATS_VB,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { useEffect, useState } from "react";

import { FALLBACK_FEE_RATE_SATS_VB } from "@/constants";
import { COPY } from "@/copy";
import { usePrice } from "@/hooks/usePrices";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { formatBtcValue, formatUsd, getBtcSymbol } from "@/utils/formatting";

import { FeeRateField } from "./FeeRateField";

// Bitcoin policy dust limit, set above taproot's ~330-sat floor so it also
// covers P2WPKH refund destinations.
const DUST_LIMIT_SATS = 546n;

interface RefundReviewContentProps {
  amountSats: bigint | null;
  defaultFeeRateSatsVb: number | null;
  previewError: string | null;
  refunding: boolean;
  error: string | null;
  onConfirm: (feeRate: number) => void;
}

export function RefundReviewContent({
  amountSats,
  defaultFeeRateSatsVb,
  previewError,
  refunding,
  error,
  onConfirm,
}: RefundReviewContentProps) {
  const btcPriceUSD = usePrice("BTC");
  const symbol = getBtcSymbol();

  const [feeRate, setFeeRate] = useState<number | null>(null);
  // True when the seeded feeRate came from the hard-coded floor because the
  // mempool fee endpoint failed. Confirm is gated until the user either acks
  // by editing the field or the mempool rate arrives.
  const [usingFallback, setUsingFallback] = useState(false);

  // The preview has already resolved before this component renders (the
  // modal holds a loading state until then), so `defaultFeeRateSatsVb` is
  // final — seed from it, or fall back to the floor if the fee fetch failed.
  useEffect(() => {
    if (feeRate !== null) return;
    if (defaultFeeRateSatsVb && defaultFeeRateSatsVb > 0) {
      setFeeRate(defaultFeeRateSatsVb);
      setUsingFallback(false);
      return;
    }
    setFeeRate(FALLBACK_FEE_RATE_SATS_VB);
    setUsingFallback(true);
  }, [defaultFeeRateSatsVb, feeRate]);

  const handleFeeRateChange = (next: number) => {
    setFeeRate(next);
    setUsingFallback(false);
  };

  const amountBtc = amountSats !== null ? satoshiToBtcNumber(amountSats) : null;
  const networkFeeSats =
    feeRate !== null && feeRate > 0 ? estimateRefundFeeSats(feeRate) : null;
  const networkFeeBtc =
    networkFeeSats !== null ? satoshiToBtcNumber(networkFeeSats) : null;
  const youReceiveSats =
    amountSats !== null && networkFeeSats !== null
      ? amountSats - networkFeeSats
      : null;
  // Clamp at zero so a fee rate above the deposit doesn't render a
  // confusing negative BTC value; Confirm is gated below by the dust check.
  const youReceiveBtc =
    youReceiveSats !== null
      ? satoshiToBtcNumber(youReceiveSats > 0n ? youReceiveSats : 0n)
      : null;

  const isDust = youReceiveSats !== null && youReceiveSats <= DUST_LIMIT_SATS;

  // Mirror the SDK's two refund safety caps (see buildAndBroadcastRefund.ts).
  // Sharing the constants prevents UI/SDK drift — without this the user
  // could confirm a fee the SDK is about to throw on, which would leave the
  // refund modal silently dead-ended after the wallet prompt.
  const exceedsRateCap =
    feeRate !== null && feeRate > REFUND_MAX_FEE_RATE_SATS_VB;
  const maxFeeByFractionSats =
    amountSats !== null
      ? (amountSats * REFUND_MAX_FEE_FRACTION_NUMERATOR) /
        REFUND_MAX_FEE_FRACTION_DENOMINATOR
      : null;
  const exceedsFractionCap =
    networkFeeSats !== null &&
    maxFeeByFractionSats !== null &&
    networkFeeSats > maxFeeByFractionSats;

  const canConfirm =
    !refunding &&
    feeRate !== null &&
    feeRate > 0 &&
    youReceiveSats !== null &&
    !isDust &&
    !exceedsRateCap &&
    !exceedsFractionCap &&
    !usingFallback;

  const feeCapMessage = exceedsRateCap
    ? `Network fee rate exceeds the safety cap of ${REFUND_MAX_FEE_RATE_SATS_VB} sat/vB. Lower the fee rate to continue.`
    : exceedsFractionCap
      ? `Network fee exceeds ${(REFUND_MAX_FEE_FRACTION_NUMERATOR * 100n) / REFUND_MAX_FEE_FRACTION_DENOMINATOR}% of the refund amount. Lower the fee rate to continue.`
      : null;

  const handleConfirmClick = () => {
    if (feeRate === null || feeRate <= 0) return;
    onConfirm(feeRate);
  };

  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="rounded-t-2xl border border-b-0 border-secondary-strokeLight bg-surface p-6">
        <Heading variant="h5" className="text-accent-primary">
          {COPY.deposit.refundReview.heading}
        </Heading>
      </div>

      <div className="rounded-b-2xl border border-secondary-strokeLight bg-surface p-6">
        <div className="flex flex-col gap-4">
          <DetailRow
            label={COPY.deposit.refundReview.refundAmount}
            primary={
              amountBtc !== null
                ? `${formatBtcValue(amountBtc)} ${symbol}`
                : "—"
            }
            secondary={
              amountBtc !== null && btcPriceUSD > 0
                ? `${formatUsd(amountBtc * btcPriceUSD)} USD`
                : undefined
            }
          />

          <DetailRow
            label={COPY.deposit.refundReview.networkFeeRate}
            primaryNode={
              feeRate !== null ? (
                <FeeRateField
                  value={feeRate}
                  onChange={handleFeeRateChange}
                  disabled={refunding}
                />
              ) : (
                <span className="text-base text-accent-secondary">—</span>
              )
            }
          />

          <DetailRow
            label={COPY.deposit.refundReview.btcNetworkFee}
            primary={
              networkFeeBtc !== null
                ? `${formatBtcValue(networkFeeBtc)} ${symbol}`
                : "—"
            }
            secondary={
              networkFeeBtc !== null && btcPriceUSD > 0
                ? `${formatUsd(networkFeeBtc * btcPriceUSD)} USD`
                : undefined
            }
          />

          <div className="my-1 border-t border-secondary-strokeLight" />

          <DetailRow
            label={COPY.deposit.refundReview.youReceive}
            primary={
              youReceiveBtc !== null
                ? `${formatBtcValue(youReceiveBtc)} ${symbol}`
                : "—"
            }
            secondary={
              youReceiveBtc !== null && btcPriceUSD > 0
                ? `${formatUsd(youReceiveBtc * btcPriceUSD)} USD`
                : undefined
            }
            emphasis
          />

          {previewError && <Callout variant="error">{previewError}</Callout>}
          {!error && !isDust && usingFallback && (
            <Callout variant="warning">
              {COPY.deposit.refundReview.fallbackFeeWarning}
            </Callout>
          )}
          {!error && isDust && (
            <Callout variant="error">
              {COPY.deposit.refundReview.dustError}
            </Callout>
          )}
          {!error && !isDust && feeCapMessage && (
            <Callout variant="error">{feeCapMessage}</Callout>
          )}
          {error && <Callout variant="error">{error}</Callout>}

          <Button
            variant="contained"
            color="secondary"
            className="w-full"
            onClick={handleConfirmClick}
            disabled={!canConfirm}
          >
            {refunding ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={16} className="text-accent-contrast" />
                <span>{COPY.common.confirming}</span>
              </span>
            ) : error ? (
              COPY.deposit.refundReview.retryButton
            ) : (
              COPY.deposit.refundReview.confirmButton
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  primary?: string;
  primaryNode?: React.ReactNode;
  secondary?: string;
  emphasis?: boolean;
}

function DetailRow({
  label,
  primary,
  primaryNode,
  secondary,
  emphasis = false,
}: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-6">
      <Text
        variant="body1"
        className={emphasis ? "text-accent-primary" : "text-accent-secondary"}
      >
        {label}
      </Text>
      <div className="flex flex-col items-end">
        {primaryNode ?? (
          <Text variant="body1" className="text-right text-accent-primary">
            {primary}
          </Text>
        )}
        {secondary && (
          <Text variant="body2" className="text-right text-accent-disabled">
            {secondary}
          </Text>
        )}
      </div>
    </div>
  );
}
