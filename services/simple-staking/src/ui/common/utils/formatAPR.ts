/**
 * Smart APR formatting utilities.
 *
 * Note: APR input is already in percent units (e.g. 5.2 -> 5.2%).
 */

export type APRFormatOptions = {
  /** Decimals for regular values (>= 0.01%). */
  minDecimals: number;
  /** Decimals for small values (0 < APR < 0.01%). */
  smallValueDecimals: number;
  /** Maximum decimals used when adapting to distinguish two values. */
  maxDecimals: number;
  /** Values in (0, threshold) are displayed as <threshold. */
  lessThanThreshold: number;
  /** Floor small values instead of rounding (e.g., 0.0015 -> 0.001). */
  floorSmall: boolean;
};

const DEFAULT_APR_FORMAT_OPTIONS: APRFormatOptions = {
  minDecimals: 2,
  smallValueDecimals: 3,
  maxDecimals: 6,
  lessThanThreshold: 0.001,
  floorSmall: true,
};

// Determine the exact number of fractional digits for a finite decimal.
// Caps at 12 to avoid pathological loops with floating point noise.
const countDecimals = (value: number): number => {
  if (!isFinite(value)) return 0;
  let decimals = 0;
  let scaled = value;
  while (Math.round(scaled) !== scaled && decimals < 12) {
    scaled = scaled * 10;
    decimals++;
  }
  return decimals;
};

/**
 * Format APR as percentage string with smart small-value handling.
 *
 * @param apr - APR value in percent units
 * @param options - Optional formatting options
 * @returns Formatted string without the % symbol (e.g., "5.20")
 */
export const formatAPRPercentage = (
  apr: number | null | undefined,
  options?: Partial<APRFormatOptions>,
): string => {
  const opts: APRFormatOptions = { ...DEFAULT_APR_FORMAT_OPTIONS, ...(options ?? {}) };
  const value = apr ?? 0;

  if (value <= 0) {
    return "0.00";
  }

  if (value > 0 && value < opts.lessThanThreshold) {
    const decimalsForLabel = Math.max(0, countDecimals(opts.lessThanThreshold));
    return `<${opts.lessThanThreshold.toFixed(decimalsForLabel)}`;
  }

  if (value < 0.01) {
    const d = opts.smallValueDecimals;
    if (opts.floorSmall) {
      const factor = Math.pow(10, d);
      const floored = Math.floor(value * factor) / factor;
      return floored.toFixed(d);
    }
    return value.toFixed(d);
  }

  return value.toFixed(opts.minDecimals);
};

/**
 * Format APR with percentage symbol.
 */
export const formatAPRWithSymbol = (
  apr: number | null | undefined,
  options?: Partial<APRFormatOptions>,
): string => {
  return `${formatAPRPercentage(apr, options)}%`;
};

/**
 * Format a pair of APRs with adaptive decimals to avoid identical-looking outputs.
 * Returns strings without the % symbol.
 */
export const formatAPRPairAdaptive = (
  aprA: number | null | undefined,
  aprB: number | null | undefined,
  options?: Partial<APRFormatOptions>,
): { a: string; b: string; decimalsUsed: number } => {
  const opts: APRFormatOptions = { ...DEFAULT_APR_FORMAT_OPTIONS, ...(options ?? {}) };
  const a = aprA ?? 0;
  const b = aprB ?? 0;

  // Start decimals based on whether values are in the "small" range
  let startDecimals = a < 0.01 || b < 0.01 ? opts.smallValueDecimals : opts.minDecimals;

  const toStringWith = (val: number, d: number): string => {
    if (val <= 0) {
      // keep at least two decimals for zero
      return (0).toFixed(Math.max(2, d));
    }
    // For comparison, avoid the "<threshold" shortcut; produce numeric strings
    if (val < 0.01) {
      if (opts.floorSmall) {
        const factor = Math.pow(10, d);
        const floored = Math.floor(val * factor) / factor;
        return floored.toFixed(d);
      }
      return val.toFixed(d);
    }
    return val.toFixed(Math.max(opts.minDecimals, d));
  };

  for (let d = startDecimals; d <= opts.maxDecimals; d++) {
    const aStr = toStringWith(a, d);
    const bStr = toStringWith(b, d);
    if (aStr !== bStr) {
      return { a: aStr, b: bStr, decimalsUsed: d };
    }
  }

  // If they are still identical after max decimals, fall back to single-value formatting
  return {
    a: formatAPRPercentage(a, opts),
    b: formatAPRPercentage(b, opts),
    decimalsUsed: startDecimals,
  };
};
