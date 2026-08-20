/**
 * The USD sub-line under an activity row's amount, priced at the CURRENT
 * price. Its own module so both the standalone row and the liquidation group's
 * child rows price their amounts the same way.
 */

import type { ActivityAmount } from "@/types/activityLog";
import { formatUsdValue } from "@/utils/formatting";

/**
 * Null when the amount cannot be priced — no numeric amount, no price for the
 * symbol, or a non-positive product. Null renders no sub-line at all, never a
 * "$0 USD" one.
 */
export function getUsdSubLine(
  amount: ActivityAmount,
  prices: Record<string, number> | undefined,
): string | null {
  const price = prices?.[amount.symbol];
  if (amount.numeric === undefined || price === undefined) return null;
  const usd = amount.numeric * price;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return formatUsdValue(usd);
}
