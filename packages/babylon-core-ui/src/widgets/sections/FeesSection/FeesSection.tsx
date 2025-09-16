import { twMerge } from "tailwind-merge";

import { SubSection } from "../../../components/SubSection";
import { BTCFeeRate } from "./BTCFeeRate";
import { BTCFeeAmount } from "./BTCFeeAmount";
import { BBNFeeAmount } from "./BBNFeeAmount";
import { Total } from "./Total";

interface FeesSectionProps {
  className?: string;
  feeRate?: number | string;
  onFeeRateEdit?: () => void;
  feeAmount?: number | string;
  coinSymbol?: string;
  feeAmountHint?: string;
  total?: number | string;
  totalHint?: string;
  bbnFeeAmount?: number | string;
  bbnCoinSymbol?: string;
  bbnFeeAmountHint?: string;
  bbnFeeDecimals?: number;
}

export function FeesSection({
  className,
  feeRate,
  onFeeRateEdit,
  feeAmount,
  coinSymbol,
  feeAmountHint,
  total,
  totalHint,
  bbnFeeAmount,
  bbnCoinSymbol,
  bbnFeeAmountHint,
  bbnFeeDecimals,
}: FeesSectionProps) {
  return (
    <SubSection className={twMerge("flex w-full flex-col content-center justify-between gap-4", className)}>
      <div className="flex flex-col gap-6">
        {feeRate !== undefined && <BTCFeeRate value={feeRate} onEdit={onFeeRateEdit} />}

        {feeAmount !== undefined && coinSymbol !== undefined && (
          <BTCFeeAmount amount={feeAmount} coinSymbol={coinSymbol} hint={feeAmountHint} />
        )}

        {bbnFeeAmount !== undefined && bbnCoinSymbol ? (
          <BBNFeeAmount
            amount={bbnFeeAmount}
            coinSymbol={bbnCoinSymbol}
            hint={bbnFeeAmountHint}
            decimals={bbnFeeDecimals}
          />
        ) : null}

        {total !== undefined && coinSymbol !== undefined && <div className="divider my-1" />}

        {total !== undefined && coinSymbol !== undefined && <Total total={total} coinSymbol={coinSymbol} hint={totalHint} />}
      </div>
    </SubSection>
  );
}
