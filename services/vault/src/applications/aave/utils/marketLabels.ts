import { COPY } from "@/copy";
import { formatCompactUsd } from "@/utils/formatting";

/** Market USD figures sit beside always-uppercase token amounts ("1.2M USDC"). */
const UPPERCASE_MAGNITUDE_SUFFIX = true;

/**
 * A token amount as compact USD (e.g. "$35.5M"), or the empty placeholder when
 * the amount or its price is missing, never `$0`.
 */
export function compactUsdLabel(
  amount: number | undefined,
  priceUsd: number | null | undefined,
): string {
  return amount === undefined || priceUsd == null
    ? COPY.common.emptyValue
    : formatCompactUsd(amount * priceUsd, UPPERCASE_MAGNITUDE_SUFFIX);
}
