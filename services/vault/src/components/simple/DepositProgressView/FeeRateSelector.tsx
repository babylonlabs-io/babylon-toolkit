/**
 * FeeRateSelector
 *
 * Inline network fee-rate picker rendered in the Deposit Progress view's
 * pre-sign entry state (replaces the old DepositFeeModal). Owns its own
 * selection state, seeded once from the committed `feeRate` prop; a selected
 * mempool tier live-follows its tier value on refetch, while a custom rate is
 * frozen until the user edits it. See the parent spec for the full contract.
 */

import { Input, Text } from "@babylonlabs-io/core-ui";
import { peginOutputCount } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";

import { MIN_RELAY_FEE_RATE_SATS_VB } from "@/constants";
import { useBTCWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useEstimatedBtcFee } from "@/hooks/deposit/useEstimatedBtcFee";
import { useNetworkFees } from "@/hooks/useNetworkFees";
import { useUTXOs } from "@/hooks/useUTXOs";
import { satoshiToBtcNumber } from "@/utils/btcConversion";
import { getFeeRateBounds } from "@/utils/feeRateBounds";
import { formatBtcAmount } from "@/utils/formatting";

const FEE_SELECTOR_COPY = COPY.deposit.feeSelector;

type TierKey = "slow" | "avg" | "fast" | "custom";

interface FeeRateSelectorProps {
  /** Per-vault deposit amounts (satoshis); sum is the total pre-pegin amount. */
  vaultAmounts: bigint[];
  /** Committed fee rate (sat/vB) — the DepositState value the sign flow uses. */
  feeRate: number;
  onFeeRateChange: (rate: number) => void;
  /** False while the fee estimate errors, or custom is selected with no valid value. */
  onValidityChange?: (canSign: boolean) => void;
}

function parseValidCustom(
  value: string,
  minFeeRate: number,
  maxFeeRate: number,
): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < minFeeRate || parsed > maxFeeRate) return null;
  return parsed;
}

export function FeeRateSelector({
  vaultAmounts,
  feeRate,
  onFeeRateChange,
  onValidityChange,
}: FeeRateSelectorProps) {
  const {
    defaultFeeRate: fastestFee,
    halfHourFeeRate: avgFee,
    hourFeeRate: slowFee,
    isLoading,
  } = useNetworkFees();
  const { address } = useBTCWallet();
  const { spendableMempoolUTXOs } = useUTXOs(address);

  const totalAmountSats = useMemo(
    () => vaultAmounts.reduce((sum, amount) => sum + amount, 0n),
    [vaultAmounts],
  );
  const numOutputs = peginOutputCount(vaultAmounts.length, true);
  const estimatedFee = useEstimatedBtcFee(
    totalAmountSats,
    spendableMempoolUTXOs,
    numOutputs,
    feeRate,
  );

  const [selectedKey, setSelectedKey] = useState<TierKey>("fast");
  const [customValue, setCustomValue] = useState("");
  const seededRef = useRef(false);

  const { minFeeRate, maxFeeRate } = getFeeRateBounds({
    defaultFeeRate: fastestFee,
    hourFeeRate: slowFee,
  });

  // Seed the selection once, when the fee tiers first resolve, from the
  // committed `feeRate` prop. After that this effect only live-follows: a
  // selected tier's committed rate tracks the tier's current mempool value; a
  // custom rate is frozen and only changes on user input. Never re-derive the
  // selection itself from props or fee tiers again.
  useEffect(() => {
    if (isLoading) return;

    let key = selectedKey;
    let custom = customValue;

    if (!seededRef.current) {
      seededRef.current = true;
      if (feeRate === slowFee) {
        key = "slow";
      } else if (feeRate === avgFee) {
        key = "avg";
      } else if (feeRate === fastestFee) {
        key = "fast";
      } else {
        key = "custom";
        custom = String(feeRate);
      }
      setSelectedKey(key);
      setCustomValue(custom);
    }

    const tierRate =
      key === "slow" ? slowFee : key === "avg" ? avgFee : fastestFee;
    const derivedRate =
      key === "custom"
        ? parseValidCustom(custom, minFeeRate, maxFeeRate)
        : tierRate;

    if (derivedRate !== null && derivedRate !== feeRate) {
      onFeeRateChange(derivedRate);
    }
  }, [
    isLoading,
    feeRate,
    slowFee,
    avgFee,
    fastestFee,
    selectedKey,
    customValue,
    minFeeRate,
    maxFeeRate,
    onFeeRateChange,
  ]);

  const lastValidityRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!onValidityChange) return;

    const customInvalid =
      selectedKey === "custom" &&
      parseValidCustom(customValue, minFeeRate, maxFeeRate) === null;
    const canSign = !customInvalid && !estimatedFee.error;

    if (lastValidityRef.current === canSign) return;
    lastValidityRef.current = canSign;
    onValidityChange(canSign);
  }, [
    onValidityChange,
    selectedKey,
    customValue,
    minFeeRate,
    maxFeeRate,
    estimatedFee.error,
  ]);

  const handleClearCustom = () => {
    setCustomValue("");
    setSelectedKey("fast");
    onFeeRateChange(fastestFee);
  };

  const showLowFeeWarning = feeRate < slowFee;

  const tiers: Array<{
    key: TierKey;
    label: string;
    rate: number;
    hint: string;
  }> = [
    {
      key: "slow",
      label: FEE_SELECTOR_COPY.slowLabel,
      rate: slowFee,
      hint: FEE_SELECTOR_COPY.slowHint,
    },
    {
      key: "avg",
      label: FEE_SELECTOR_COPY.avgLabel,
      rate: avgFee,
      hint: FEE_SELECTOR_COPY.avgHint,
    },
    {
      key: "fast",
      label: FEE_SELECTOR_COPY.fastLabel,
      rate: fastestFee,
      hint: FEE_SELECTOR_COPY.fastHint,
    },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-3">
      <div className="flex items-center justify-between">
        <Text variant="body2" className="text-accent-primary">
          {FEE_SELECTOR_COPY.title}
        </Text>
        <Text variant="body2" className="text-accent-primary">
          {feeRate} {FEE_SELECTOR_COPY.headerUnit}
        </Text>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiers.map((tier) => (
          <button
            key={tier.key}
            type="button"
            aria-pressed={selectedKey === tier.key}
            onClick={() => setSelectedKey(tier.key)}
            className={`flex flex-col items-center gap-0.5 rounded border px-1.5 py-1.5 text-center ${
              selectedKey === tier.key
                ? "border-accent-primary bg-accent-primary/10"
                : "border-secondary-strokeLight"
            }`}
          >
            <Text variant="caption" className="font-medium">
              {tier.label}
            </Text>
            <Text variant="caption" className="whitespace-nowrap">
              <span className="text-accent-primary">
                {tier.rate} {FEE_SELECTOR_COPY.cardUnit}
              </span>{" "}
              <span className="text-accent-secondary">{tier.hint}</span>
            </Text>
          </button>
        ))}
        <button
          type="button"
          aria-pressed={selectedKey === "custom"}
          onClick={() => setSelectedKey("custom")}
          className={`flex items-center justify-center rounded border px-2 py-1.5 ${
            selectedKey === "custom"
              ? "border-accent-primary bg-accent-primary/10"
              : "border-secondary-strokeLight"
          }`}
        >
          <Text variant="caption" className="font-medium">
            {FEE_SELECTOR_COPY.customLabel}
          </Text>
        </button>
      </div>

      {selectedKey === "custom" && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MIN_RELAY_FEE_RATE_SATS_VB}
              step={1}
              value={customValue}
              onChange={(e) => setCustomValue(e.currentTarget.value)}
              suffix={
                <Text as="span" variant="body2" className="whitespace-nowrap">
                  {FEE_SELECTOR_COPY.customInputSuffix}
                </Text>
              }
              wrapperClassName="flex-1"
            />
            <button
              type="button"
              aria-label={FEE_SELECTOR_COPY.clearCustomAria}
              onClick={handleClearCustom}
              className="flex size-10 shrink-0 items-center justify-center rounded border border-secondary-strokeLight"
            >
              <IoClose size={20} />
            </button>
          </div>
          {!estimatedFee.error && estimatedFee.fee !== null && (
            <Text variant="caption" className="text-accent-secondary">
              {formatBtcAmount(satoshiToBtcNumber(estimatedFee.fee))}
            </Text>
          )}
        </div>
      )}

      {/* An estimate error blocks Sign for tier rates too, so it must be
          visible regardless of which option is selected. */}
      {estimatedFee.error && (
        <Text variant="caption" className="text-error-main">
          {estimatedFee.error}
        </Text>
      )}

      {showLowFeeWarning && (
        <Text variant="caption" className="text-warning-main">
          {FEE_SELECTOR_COPY.lowFeeWarning}
        </Text>
      )}
    </div>
  );
}
