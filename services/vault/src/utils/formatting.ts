/**
 * Formatting utilities for displaying values in the UI
 */

import { getNetworkConfigBTC } from "@/config";
import { MINS_PER_DAY, MINS_PER_HOUR } from "@/constants";
import { truncateAddress } from "@/utils/addressUtils";

const btcConfig = getNetworkConfigBTC();

/**
 * Format a provider's display name for UI.
 * Determines if the provider has a "real" name (not address-based) and formats accordingly.
 *
 * @param name - The provider's name (may be undefined or address-based like "0x..." or "Provider 0x...")
 * @param id - The provider's ID (used for address fallback)
 * @param options.includeAddress - If true, appends truncated address for real names (e.g., "Lombard (0x1234...5678)")
 * @returns Formatted display name
 */
export function formatProviderDisplayName(
  name: string | undefined,
  id: string,
  options?: { includeAddress?: boolean },
): string {
  const isRealName =
    name && !name.startsWith("0x") && !name.startsWith("Provider ");

  if (isRealName) {
    return options?.includeAddress ? `${name} (${truncateAddress(id)})` : name;
  }

  return name || truncateAddress(id);
}

/**
 * Format BTC amount as a number string (without suffix)
 * @param btcAmount - Amount in BTC (not satoshis). Zero or negative values return "0".
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted number string with trailing zeros removed (e.g., "1.23" or "0")
 */
export function formatBtcValue(btcAmount: number, decimals = 8): string {
  if (btcAmount <= 0) return "0";
  const fixed = btcAmount.toFixed(decimals);
  return fixed.replace(/\.?0+$/, "");
}

/**
 * Format BTC amount for display with suffix
 * Uses network-aware coin symbol (BTC for mainnet, sBTC for signet)
 * @param btcAmount - Amount in BTC (not satoshis). Zero or negative values return "0 BTC/sBTC".
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted string with trailing zeros removed (e.g., "1.23 BTC" or "0 sBTC")
 */
export function formatBtcAmount(btcAmount: number, decimals = 8): string {
  return `${formatBtcValue(btcAmount, decimals)} ${btcConfig.coinSymbol}`;
}

const SATS_PER_BTC = 100_000_000n;
/** Fractional digits in a BTC representation — derived from SATS_PER_BTC so
 * the two stay in lockstep (e.g. "100000000" → 8 zeros). */
const BTC_FRACTIONAL_DIGITS = SATS_PER_BTC.toString().length - 1;

/**
 * Format a satoshi-denominated bigint as a BTC string with suffix.
 * Performs the conversion in bigint arithmetic so totals near or above the
 * JS-safe-integer range stay exact (i.e. no `Number()` round-trip).
 * Trailing zeros are trimmed from the fractional part.
 *
 * @param sats - Total in satoshis. Zero or negative returns "0 BTC/sBTC".
 */
export function formatBtcFromSats(sats: bigint): string {
  if (sats <= 0n) return `0 ${btcConfig.coinSymbol}`;
  const whole = sats / SATS_PER_BTC;
  const remainder = sats % SATS_PER_BTC;
  const fractional = remainder.toString().padStart(BTC_FRACTIONAL_DIGITS, "0");
  const trimmed = fractional.replace(/0+$/, "");
  const display = trimmed ? `${whole}.${trimmed}` : `${whole}`;
  return `${display} ${btcConfig.coinSymbol}`;
}

/** 1% = 100 basis points (1 bps = 0.01%). */
const BPS_PER_PERCENT = 100;
/** Two decimals matches the indexer's commission resolution (1 bps = 0.01%). */
const COMMISSION_DECIMALS = 2;

/**
 * Format a basis-points value as a percentage string for display.
 * 1 bps = 0.01%. Renders up to two decimals with trailing zeros trimmed
 * (e.g. 50 -> "0.5%", 9999 -> "99.99%", 100 -> "1%").
 *
 * @param bps - Value in basis points.
 */
export function formatBasisPointsAsPercent(bps: number): string {
  const percent = parseFloat(
    (bps / BPS_PER_PERCENT).toFixed(COMMISSION_DECIMALS),
  );
  return `${percent}%`;
}

/** Decimal places shown for borrow APR values on the landing card. */
const APR_DISPLAY_DECIMALS = 2;

/** Smallest APR representable at `APR_DISPLAY_DECIMALS` (0.01% for 2 decimals). */
const APR_MIN_DISPLAYABLE = 10 ** -APR_DISPLAY_DECIMALS;

/**
 * Format a percentage value as an APR display string. Renders up to two
 * decimals with trailing zeros trimmed (e.g. 3.7 -> "3.7%", 5.861 -> "5.86%").
 *
 * A genuinely zero rate shows "0%". A positive rate too small to render at
 * two decimals (e.g. 0.0001%) shows "<0.01%" rather than collapsing to "0%",
 * so a non-zero rate is never displayed as exactly zero.
 *
 * @param percent - APR as a percentage (e.g. 3.7 for 3.7%).
 */
export function formatAprPercent(percent: number): string {
  if (percent <= 0) return "0%";
  const rounded = parseFloat(percent.toFixed(APR_DISPLAY_DECIMALS));
  if (rounded === 0) return `<${APR_MIN_DISPLAYABLE}%`;
  return `${rounded}%`;
}

/** Decimal places shown for the Overview "% to liquidation" figure. */
const LIQUIDATION_DISTANCE_DECIMALS = 1;

/**
 * Format a BTC/USD price for display at whole-dollar resolution, without a
 * currency suffix (e.g. "$88,400"). Used for the Overview liquidation-price
 * and BTC-price stats where the bare "$…" form reads cleanest.
 */
export function formatUsdPrice(usdValue: number): string {
  return `$${Math.round(usdValue).toLocaleString("en-US")}`;
}

/**
 * Format the distance from the current BTC price down to the liquidation price
 * as a percentage (e.g. "19.2%"). A position already at or past its
 * liquidation price has no remaining buffer, so non-positive inputs render as
 * "0%".
 */
export function formatLiquidationDistancePercent(percent: number): string {
  const clamped = Math.max(0, percent);
  return `${clamped.toFixed(LIQUIDATION_DISTANCE_DECIMALS)}%`;
}

/**
 * Get the current BTC coin symbol based on network
 * @returns "BTC" for mainnet, "sBTC" for signet
 */
export function getBtcSymbol(): string {
  return btcConfig.coinSymbol;
}

/**
 * Format USD value for display
 * @param usdValue - Amount in USD. Zero or negative values return "$0 USD".
 * @returns Formatted string (e.g., "$1,234.56 USD" or "$0 USD")
 */
export function formatUsdValue(usdValue: number): string {
  if (usdValue <= 0) return "$0 USD";
  return `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

/**
 * Format USD value without the "USD" suffix.
 * Always renders two fractional digits (e.g., "$1,234.56" or "$0.00").
 * Use this when the currency is clear from context and the bare "$…" form
 * reads better than formatUsdValue's suffixed variant.
 */
export function formatUsd(usd: number): string {
  return `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format price in USD for compact display (without suffix)
 * Uses no decimals for values >= 1000, 2 decimals otherwise
 * @param priceUsd - Price in USD
 * @returns Formatted price string (e.g., "$1,234" or "$99.50")
 */
export function formatPriceUsd(priceUsd: number): string {
  if (priceUsd >= 1000) {
    return `$${priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `$${priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a USD value in compact notation (e.g., "$63.6k", "$1.2M").
 * Uses one fractional digit for k/M/B magnitudes; for values below 1000
 * falls back to the same formatting as `formatPriceUsd` for consistency.
 * Returns `$0` for zero or negative input.
 */
export function formatCompactUsd(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 1000) return formatPriceUsd(usd);
  const compact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(usd);
  return `$${compact.toLowerCase()}`;
}

/**
 * Intl.NumberFormat caps `maximumFractionDigits` at 20 on the oldest engines we
 * support (newer V8 allows up to 100). Token `decimals` reaches `formatAmount`
 * as an unvalidated uint8 (0–255) from indexer metadata, so clamp to the
 * universally-safe ceiling to avoid a RangeError. No display needs more than
 * 20 fractional digits.
 */
const MAX_DISPLAY_FRACTION_DIGITS = 20;

/**
 * Format a number amount for display with locale-aware formatting
 * @param amount - The numeric amount to format
 * @param maxDecimals - Maximum decimal places (default: 2). Clamped to
 *   [0, 20] before use, since values come from unvalidated token metadata.
 * @returns Formatted number string (e.g., "1,234.56" or "0")
 */
export function formatAmount(amount: number, maxDecimals = 2): string {
  if (amount <= 0) return "0";
  const safeMaxDecimals = Math.min(
    Math.max(maxDecimals, 0),
    MAX_DISPLAY_FRACTION_DIGITS,
  );
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: safeMaxDecimals,
  });
}

/**
 * Amount for display in validation/error copy: thousands-separated, with 2
 * decimals for values >= 1 (stablecoin-friendly, e.g. "8,079.98") and the
 * token's native precision below 1 so small balances don't round to "0".
 *
 * @param amount - The amount to format.
 * @param displayDecimals - The token's display precision (used when < 1).
 */
export function formatDisplayAmount(
  amount: number,
  displayDecimals: number,
): string {
  return formatAmount(amount, amount >= 1 ? 2 : displayDecimals);
}

/**
 * Label for a progress meter whose fill is a 0–1 ratio, guarding the two
 * rounding edges so the text can't contradict a partial bar:
 *  - a non-zero ratio that rounds down to 0%   → `belowOne` (e.g. "<1% …")
 *  - a below-full ratio that rounds up to 100%  → `nearFull` (e.g. ">99% …")
 *  - otherwise the exact rounded percentage.
 */
export function formatMeterLabel(
  ratio: number,
  labels: {
    belowOne: string;
    nearFull: string;
    exact: (percent: number) => string;
  },
): string {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const isPartial = ratio > 0 && ratio < 1;
  if (isPartial && percent === 0) return labels.belowOne;
  if (isPartial && percent === 100) return labels.nearFull;
  return labels.exact(percent);
}

/**
 * Format a date as "YYYY-MM-DD HH:mm:ss"
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format a date as "HH:mm:ss" (local time). Used by the v3 activity rows, whose
 * calendar day lives in the group header, so only the time is shown per row.
 * @param date - The date to format
 * @returns Formatted time string
 */
export function formatActivityTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Label for the v3 activity date-group header the given row belongs to:
 * "Today" / "Yesterday" for the two most recent calendar days, else the
 * explicit "YYYY-MM-DD". Pure and deterministic — the caller passes the
 * reference "now" so it stays testable without touching the real clock.
 * Grouping compares by local calendar day, not elapsed hours.
 * @param date - The row's timestamp
 * @param reference - The current time to compare against
 * @param labels - Localized "Today"/"Yesterday" strings (from COPY)
 */
export function formatActivityDateGroup(
  date: Date,
  reference: Date,
  labels: { today: string; yesterday: string },
): string {
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const dayDiff = Math.round(
    (startOfDay(reference) - startOfDay(date)) / MS_PER_DAY,
  );

  if (dayDiff === 0) return labels.today;
  if (dayDiff === 1) return labels.yesterday;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a timestamp as relative time (e.g., "5 minutes ago", "2 days ago")
 * @param timestamp - Timestamp in milliseconds since epoch. Future timestamps return "just now".
 * @returns Formatted relative time string
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) {
    return "just now";
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  // Note: We intentionally approximate months as 30 days and years as 365 days
  // for a simple, human-friendly relative time display. This does not account
  // for varying month lengths or leap years.
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return years === 1 ? "a year ago" : `${years} years ago`;
  }
  if (months > 0) {
    return months === 1 ? "a month ago" : `${months} months ago`;
  }
  if (days > 0) {
    return days === 1 ? "a day ago" : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  }
  return "just now";
}

function pluralizeUnit(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/** Humanize a duration in the largest unit ("5 days", not "114 hours"):
 *  < 60 → minutes, < 1440 → hours, else days; < 1 → "less than a minute". */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 1) {
    return "less than a minute";
  }
  if (totalMinutes < MINS_PER_HOUR) {
    return pluralizeUnit(totalMinutes, "minute");
  }
  if (totalMinutes < MINS_PER_DAY) {
    return pluralizeUnit(Math.round(totalMinutes / MINS_PER_HOUR), "hour");
  }
  return pluralizeUnit(Math.round(totalMinutes / MINS_PER_DAY), "day");
}

/** Below this (after rounding), a short duration reads better in minutes. */
const SHORT_DURATION_HOURS_FROM_MINS = 90;
/** Minute estimates snap to 5-minute steps; hour estimates to half hours. */
const SHORT_DURATION_MINUTE_STEP = 5;
const SHORT_DURATION_HALF_HOUR_MINS = 30;

/** Compact approximate duration for headline estimates: "70 min", "1.5 h",
 *  "2 h". Rounds to 5-minute steps under 90 minutes, half hours above. */
export function formatDurationShort(totalMinutes: number): string {
  const roundedMinutes =
    Math.round(totalMinutes / SHORT_DURATION_MINUTE_STEP) *
    SHORT_DURATION_MINUTE_STEP;
  if (roundedMinutes < SHORT_DURATION_HOURS_FROM_MINS) {
    return `${roundedMinutes} min`;
  }
  // Hours deliberately re-round from the raw value — snapping twice compounds
  // error (103 min is nearest 1.5 h, but 103→105 would round to 2 h) — while
  // the snapped branch base is what keeps "90 min" from ever rendering.
  const halfHours = Math.round(totalMinutes / SHORT_DURATION_HALF_HOUR_MINS);
  return `${halfHours / 2} h`;
}

/**
 * Format a 1-based position as an ordinal string (1st, 2nd, 3rd, 4th, etc.)
 * @param n - 1-based position number
 * @returns Ordinal string (e.g., "1st", "2nd", "3rd", "11th", "21st")
 */
export function formatOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;

  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Format token amount for display with appropriate precision.
 * Shows minimum 2 decimals, up to maxDecimals, trimming trailing zeros.
 *
 * @param amount - Token amount to format
 * @param maxDecimals - Maximum decimal places (default: 6 for stablecoins)
 * @returns Formatted string (e.g., "4.75" or "4.748593")
 */
export function formatTokenAmount(amount: number, maxDecimals = 6): string {
  if (amount === 0) return "0";

  // Format with max decimals, then trim trailing zeros
  const formatted = amount.toFixed(maxDecimals);
  // Remove trailing zeros but keep at least 2 decimal places
  const trimmed = formatted.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");

  // Ensure at least 2 decimal places for consistency
  const parts = trimmed.split(".");
  if (parts.length === 1) {
    return `${parts[0]}.00`;
  }
  if (parts[1].length === 1) {
    return `${parts[0]}.${parts[1]}0`;
  }
  return trimmed;
}

/** At/above this magnitude a token amount renders in compact K/M/B notation. */
const COMPACT_NOTATION_THRESHOLD = 1000;

/**
 * Format a token amount for compact display. Figures of one thousand or more
 * collapse to grouped magnitude suffixes (45_200 → "45.2K", 1_234_567 →
 * "1.23M", 1.5e9 → "1.5B"); smaller amounts render in full (grouped, up to two
 * decimals). The token symbol, if any, is appended by the caller. Returns "0"
 * for zero or negative input.
 *
 * Sibling of `formatCompactUsd` for bare token quantities (no "$" prefix,
 * uppercase suffix).
 */
export function formatCompactTokenAmount(amount: number): string {
  if (amount <= 0) return "0";
  // Round to the two decimals shown before testing the compact threshold, so a
  // value that rounds up to 1,000 (e.g. 999.995) renders as "1K" rather than
  // the full "1,000" — keeping the boundary consistent and not overstating.
  const rounded = Number(amount.toFixed(2));
  if (rounded >= COMPACT_NOTATION_THRESHOLD) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(rounded);
  }
  return formatAmount(amount, 2);
}
