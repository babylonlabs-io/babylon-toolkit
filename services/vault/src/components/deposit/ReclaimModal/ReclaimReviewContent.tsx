import { Button, Callout, Heading, Loader } from "@babylonlabs-io/core-ui";
import { estimateReclaimFeeSats } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import {
  RECLAIM_MAX_FEE_FRACTION_DENOMINATOR,
  RECLAIM_MAX_FEE_FRACTION_NUMERATOR,
  RECLAIM_MAX_FEE_RATE_SATS_VB,
  RECLAIM_WARN_FEE_FRACTION_NUMERATOR,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { useEffect, useState } from "react";

import { ReviewDetailRow } from "@/components/shared/DetailRow";
import { FALLBACK_FEE_RATE_SATS_VB } from "@/constants";
import { useBTCWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { usePrice } from "@/hooks/usePrices";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import {
  formatBtcValue,
  formatSats,
  formatUsd,
  getBtcSymbol,
} from "@/utils/formatting";

import { FeeRateField } from "../RefundModal/FeeRateField";

// Bitcoin policy dust limit, matching the SDK builder's floor.
const DUST_LIMIT_SATS = 546n;

/** A single reclaim sweeps one reserve. */
const RECLAIM_INPUT_COUNT = 1;

interface ReclaimReviewContentProps {
  /** Gross reserve value at PegIn vout 1. */
  amountSats: bigint | null;
  defaultFeeRateSatsVb: number | null;
  previewError: string | null;
  reclaiming: boolean;
  error: string | null;
  onConfirm: (feeRate: number) => void;
}

export function ReclaimReviewContent({
  amountSats,
  defaultFeeRateSatsVb,
  previewError,
  reclaiming,
  error,
  onConfirm,
}: ReclaimReviewContentProps) {
  const btcPriceUSD = usePrice("BTC");
  const symbol = getBtcSymbol();
  // Signing a BTC transaction, so a silently locked wallet must block confirm.
  // This full-screen modal covers the navbar's unlock affordance.
  const { locked: walletLocked } = useBTCWallet();

  const [feeRate, setFeeRate] = useState<number | null>(null);
  // True while the seeded rate came from the hard-coded floor because the
  // mempool fetch failed. Confirm stays gated until the user edits the field
  // or the real rate arrives.
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    if (defaultFeeRateSatsVb && defaultFeeRateSatsVb > 0) {
      // The real rate can arrive later than the first render — the preview
      // refetches on window focus, so a failed fetch can succeed on a second
      // pass. Adopt it then, and clear the gate. Returning early whenever
      // `feeRate` was set would strand the fallback warning on screen with
      // Confirm disabled until the depositor edited the field by hand.
      //
      // Only overwrite the field while it still holds the fallback seed; a
      // rate the depositor typed is theirs to keep.
      setUsingFallback((wasFallback) => {
        if (wasFallback || feeRate === null) setFeeRate(defaultFeeRateSatsVb);
        return false;
      });
      return;
    }
    if (feeRate !== null) return;
    setFeeRate(FALLBACK_FEE_RATE_SATS_VB);
    setUsingFallback(true);
  }, [defaultFeeRateSatsVb, feeRate]);

  const handleFeeRateChange = (next: number) => {
    setFeeRate(next);
    setUsingFallback(false);
  };

  const amountBtc = amountSats !== null ? satoshiToBtcNumber(amountSats) : null;
  const networkFeeSats =
    feeRate !== null && feeRate > 0
      ? estimateReclaimFeeSats(feeRate, RECLAIM_INPUT_COUNT)
      : null;
  const networkFeeBtc =
    networkFeeSats !== null ? satoshiToBtcNumber(networkFeeSats) : null;
  const youReceiveSats =
    amountSats !== null && networkFeeSats !== null
      ? amountSats - networkFeeSats
      : null;
  // Clamped so a fee above the reserve doesn't render a negative figure;
  // confirm is gated by the dust check below.
  const youReceiveBtc =
    youReceiveSats !== null
      ? satoshiToBtcNumber(youReceiveSats > 0n ? youReceiveSats : 0n)
      : null;

  const isDust = youReceiveSats !== null && youReceiveSats <= DUST_LIMIT_SATS;

  // Mirror the SDK's two caps so the user can never confirm a fee the SDK is
  // about to reject, which would dead-end the modal after a wallet prompt.
  //
  // > The fee-fraction basis here is the swept reserve itself, not the vault
  // > deposit. That is why these constants differ from the refund's — a 10%
  // > cap on ~33k sats would block every reclaim above roughly 25 sat/vB. The
  // > matching note is on the SDK constants; do not align the two.
  const exceedsRateCap =
    feeRate !== null && feeRate > RECLAIM_MAX_FEE_RATE_SATS_VB;
  const maxFeeByFractionSats =
    amountSats !== null
      ? (amountSats * RECLAIM_MAX_FEE_FRACTION_NUMERATOR) /
        RECLAIM_MAX_FEE_FRACTION_DENOMINATOR
      : null;
  const exceedsFractionCap =
    networkFeeSats !== null &&
    maxFeeByFractionSats !== null &&
    networkFeeSats > maxFeeByFractionSats;

  // Between the warn and block thresholds the reclaim still goes through — the
  // depositor may reasonably prefer paying now over waiting for cheaper fees.
  const warnFeeThresholdSats =
    amountSats !== null
      ? (amountSats * RECLAIM_WARN_FEE_FRACTION_NUMERATOR) /
        RECLAIM_MAX_FEE_FRACTION_DENOMINATOR
      : null;
  const isExpensive =
    !exceedsFractionCap &&
    networkFeeSats !== null &&
    warnFeeThresholdSats !== null &&
    networkFeeSats > warnFeeThresholdSats;

  const canConfirm =
    !reclaiming &&
    !walletLocked &&
    feeRate !== null &&
    feeRate > 0 &&
    youReceiveSats !== null &&
    !isDust &&
    !exceedsRateCap &&
    !exceedsFractionCap &&
    !usingFallback;

  const capPercent = Number(
    (RECLAIM_MAX_FEE_FRACTION_NUMERATOR * 100n) /
      RECLAIM_MAX_FEE_FRACTION_DENOMINATOR,
  );
  const warnPercent = Number(
    (RECLAIM_WARN_FEE_FRACTION_NUMERATOR * 100n) /
      RECLAIM_MAX_FEE_FRACTION_DENOMINATOR,
  );

  const feeCapMessage = exceedsRateCap
    ? COPY.reclaim.review.feeRateCapError(RECLAIM_MAX_FEE_RATE_SATS_VB)
    : exceedsFractionCap
      ? COPY.reclaim.review.feeFractionCapError(capPercent)
      : null;

  const handleConfirmClick = () => {
    if (feeRate === null || feeRate <= 0) return;
    onConfirm(feeRate);
  };

  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="rounded-t-2xl border border-b-0 border-secondary-strokeLight bg-surface p-6">
        <div className="flex flex-col gap-2">
          <Heading variant="h5" className="text-accent-primary">
            {COPY.reclaim.review.heading}
          </Heading>
          <p className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
            {COPY.reclaim.review.description}
          </p>
        </div>
      </div>

      <div className="rounded-b-2xl border border-secondary-strokeLight bg-surface p-6">
        <div className="flex flex-col gap-6">
          <ReviewDetailRow
            label={COPY.reclaim.review.reclaimAmount}
            // Whole sats, matching the row: ~33k sats reads as "0.00033 BTC"
            // and loses all shape.
            value={
              amountSats !== null
                ? COPY.reclaim.rowAmount(formatSats(amountSats))
                : "—"
            }
            secondaryValue={
              amountBtc !== null && btcPriceUSD > 0
                ? `${formatUsd(amountBtc * btcPriceUSD)} USD`
                : undefined
            }
          />

          <ReviewDetailRow
            label={COPY.reclaim.review.networkFeeRate}
            value={
              feeRate !== null ? (
                <FeeRateField
                  value={feeRate}
                  onChange={handleFeeRateChange}
                  disabled={reclaiming}
                />
              ) : (
                <span className="text-base text-accent-secondary">—</span>
              )
            }
          />

          <ReviewDetailRow
            label={COPY.reclaim.review.btcNetworkFee}
            value={
              networkFeeSats !== null
                ? COPY.reclaim.rowAmount(formatSats(networkFeeSats))
                : "—"
            }
            secondaryValue={
              networkFeeBtc !== null && btcPriceUSD > 0
                ? `${formatUsd(networkFeeBtc * btcPriceUSD)} USD`
                : undefined
            }
          />

          <div className="my-1 border-t border-secondary-strokeLight" />

          <ReviewDetailRow
            label={COPY.reclaim.review.youReceive}
            value={
              youReceiveBtc !== null
                ? `${formatBtcValue(youReceiveBtc)} ${symbol}`
                : "—"
            }
            secondaryValue={
              youReceiveBtc !== null && btcPriceUSD > 0
                ? `${formatUsd(youReceiveBtc * btcPriceUSD)} USD`
                : undefined
            }
          />

          {walletLocked && (
            <Callout variant="error" title={COPY.wallet.locked.title}>
              {COPY.wallet.locked.description}
            </Callout>
          )}
          {previewError && <Callout variant="error">{previewError}</Callout>}
          {!error && !isDust && usingFallback && (
            <Callout variant="warning">
              {COPY.reclaim.review.fallbackFeeWarning}
            </Callout>
          )}
          {!error && isDust && (
            <Callout variant="error">{COPY.reclaim.review.dustError}</Callout>
          )}
          {!error && !isDust && feeCapMessage && (
            <Callout variant="error">{feeCapMessage}</Callout>
          )}
          {!error && !isDust && !feeCapMessage && isExpensive && (
            <Callout variant="warning">
              {COPY.reclaim.review.feeFractionWarning(warnPercent)}
            </Callout>
          )}
          {error && <Callout variant="error">{error}</Callout>}

          <Button
            variant="contained"
            color="secondary"
            className="w-full"
            onClick={handleConfirmClick}
            disabled={!canConfirm}
            data-testid="reclaim-confirm-button"
          >
            {reclaiming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={16} className="text-accent-contrast" />
                <span>{COPY.common.confirming}</span>
              </span>
            ) : error ? (
              COPY.reclaim.review.retryButton
            ) : (
              COPY.reclaim.review.confirmButton
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
