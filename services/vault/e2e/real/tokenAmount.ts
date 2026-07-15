/**
 * Shared token-amount formatting for the borrow/repay form inputs. Both actions fill a numeric amount
 * into an `AmountSlider` (`inputmode="decimal"`) and must never drift ABOVE the intended value — a
 * borrow default above the max stalls at "Amount exceeds maximum", a repay default above the debt at
 * "Amount exceeds debt". So the value is FLOORED (never rounded up) to the token's precision, capped at
 * MAX_INPUT_DECIMALS (USDC/USDT are 6), then trimmed.
 */

/** Cap the form input at this many decimal places (USDC/USDT are 6) — enough for any test amount. */
export const MAX_INPUT_DECIMALS = 6;

/**
 * Format a token amount for a form's numeric input: floored to min(decimals, MAX_INPUT_DECIMALS) places
 * (never rounded up, so a computed default can't drift above the max/debt), then trimmed.
 */
export function formatTokenAmount(amount: number, decimals: number): string {
  const places = Math.min(decimals, MAX_INPUT_DECIMALS);
  const scale = 10 ** places;
  return (Math.floor(amount * scale) / scale).toString();
}
