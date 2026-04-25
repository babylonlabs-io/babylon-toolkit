import { Button, Heading, Loader, Text } from "@babylonlabs-io/core-ui";
import { useEffect, useState } from "react";
import { MdInfoOutline } from "react-icons/md";

import { StatusBanner } from "@/components/deposit/DepositSignModal/StatusBanner";
import { usePrice } from "@/hooks/usePrices";
import { getRefundNetworkFeeSats } from "@/services/vault/vaultRefundService";
import { formatBtcValue, formatUsd, getBtcSymbol } from "@/utils/formatting";

import { FeeRateField } from "./FeeRateField";

const SATS_PER_BTC = 100_000_000n;
// Bitcoin policy dust limit, set above taproot's ~330-sat floor so it also
// covers P2WPKH refund destinations.
const DUST_LIMIT_SATS = 546n;
const FALLBACK_FEE_RATE_SATS_VB = 1;

function satsToBtc(sats: bigint): number {
  return Number(sats) / Number(SATS_PER_BTC);
}

interface RefundReviewContentProps {
  amountSats: bigint | null;
  defaultFeeRateSatsVb: number | null;
  previewLoading: boolean;
  previewError: string | null;
  refunding: boolean;
  error: string | null;
  onConfirm: (feeRate: number) => void;
}

export function RefundReviewContent({
  amountSats,
  defaultFeeRateSatsVb,
  previewLoading,
  previewError,
  refunding,
  error,
  onConfirm,
}: RefundReviewContentProps) {
  const btcPriceUSD = usePrice("BTC");
  const symbol = getBtcSymbol();

  const [feeRate, setFeeRate] = useState<number | null>(null);

  useEffect(() => {
    if (feeRate !== null) return;
    if (defaultFeeRateSatsVb && defaultFeeRateSatsVb > 0) {
      setFeeRate(defaultFeeRateSatsVb);
      return;
    }
    if (!previewLoading) {
      setFeeRate(FALLBACK_FEE_RATE_SATS_VB);
    }
  }, [defaultFeeRateSatsVb, feeRate, previewLoading]);

  const amountBtc = amountSats !== null ? satsToBtc(amountSats) : null;
  const networkFeeSats =
    feeRate !== null && feeRate > 0 ? getRefundNetworkFeeSats(feeRate) : null;
  const networkFeeBtc =
    networkFeeSats !== null ? satsToBtc(networkFeeSats) : null;
  const youReceiveSats =
    amountSats !== null && networkFeeSats !== null
      ? amountSats - networkFeeSats
      : null;
  const youReceiveBtc =
    youReceiveSats !== null ? satsToBtc(youReceiveSats) : null;

  const isDust = youReceiveSats !== null && youReceiveSats <= DUST_LIMIT_SATS;

  const canConfirm =
    !refunding &&
    !previewLoading &&
    feeRate !== null &&
    feeRate > 0 &&
    youReceiveSats !== null &&
    !isDust;

  const handleConfirmClick = () => {
    if (feeRate === null || feeRate <= 0) return;
    onConfirm(feeRate);
  };

  return (
    <div className="mx-auto w-full max-w-[540px]">
      <div className="rounded-t-2xl border border-b-0 border-secondary-strokeLight bg-surface p-6">
        <Heading variant="h5" className="text-accent-primary">
          Review Refund
        </Heading>
      </div>

      <div className="rounded-b-2xl border border-secondary-strokeLight bg-surface p-6">
        <div className="flex flex-col gap-4">
          <DetailRow
            label="Refund Amount"
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
            label="Network Fee Rate"
            primaryNode={
              feeRate !== null ? (
                <FeeRateField
                  value={feeRate}
                  onChange={setFeeRate}
                  disabled={refunding}
                />
              ) : (
                <span className="text-base text-accent-secondary">—</span>
              )
            }
          />

          <DetailRow
            label="BTC Network Fee"
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
            label="You'll receive"
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

          <div className="flex items-center gap-2 rounded-lg border border-secondary-strokeLight px-4 py-2">
            <MdInfoOutline
              className="shrink-0 text-accent-secondary"
              size={18}
              aria-hidden="true"
            />
            <Text variant="body2" className="text-accent-secondary">
              Refund arrives within the Bitcoin challenge period — approximately
              3 days after the transaction is confirmed.
            </Text>
          </div>

          {previewError && (
            <StatusBanner variant="error">{previewError}</StatusBanner>
          )}
          {!error && isDust && (
            <StatusBanner variant="error">
              Network fee is too high — your refund would be below the Bitcoin
              dust limit. Lower the fee rate to continue.
            </StatusBanner>
          )}
          {error && <StatusBanner variant="error">{error}</StatusBanner>}

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
                <span>Confirming…</span>
              </span>
            ) : error ? (
              "Retry"
            ) : (
              "Confirm"
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
