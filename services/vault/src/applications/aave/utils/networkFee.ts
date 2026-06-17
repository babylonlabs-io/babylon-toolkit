/**
 * Pure helpers for the Ethereum network-fee row (borrow / repay).
 *
 * Kept free of React and client dependencies so the wei→ETH conversion and the
 * display formatting can be unit-tested in isolation.
 */

/** 1 ETH expressed in wei. */
const WEI_PER_ETH = 10n ** 18n;

/** Decimal places shown for the ETH portion of the fee (e.g. "0.000123 ETH"). */
const FEE_ETH_DECIMALS = 6;

/**
 * Convert a wei amount to a Number of ETH without BigInt→Number precision loss.
 *
 * `gasUnits * gasPrice` can exceed `Number.MAX_SAFE_INTEGER` at high gas prices,
 * so split into whole-ETH and sub-ETH remainder before the Number cast — the
 * remainder is always < 10^18 and the whole part is small, so neither cast
 * loses precision.
 */
export function weiToEth(wei: bigint): number {
  const whole = wei / WEI_PER_ETH;
  const remainder = wei % WEI_PER_ETH;
  return Number(whole) + Number(remainder) / Number(WEI_PER_ETH);
}

/**
 * Whether a repay gas estimate can run for the given allowance.
 *
 * Repay pulls the debt token via `transferFrom`, so `eth_estimateGas` reverts
 * unless the adapter is already approved for at least the repay amount. Returns
 * false (→ row shows the empty placeholder) rather than estimating a call that
 * is guaranteed to revert pre-approval.
 */
export function canEstimateRepay(allowance: bigint, amount: bigint): boolean {
  return amount > 0n && allowance >= amount;
}

/**
 * Format an estimated fee for the network-fee row.
 *
 * Returns the ETH amount alone when no ETH/USD price is available, otherwise
 * appends the USD value, e.g. `"0.000123 ETH ($0.25 USD)"`.
 */
export function formatNetworkFee(feeEth: number, ethPriceUsd: number): string {
  const eth = `${feeEth.toFixed(FEE_ETH_DECIMALS)} ETH`;
  if (ethPriceUsd <= 0) return eth;

  const usd = (feeEth * ethPriceUsd).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${eth} ($${usd} USD)`;
}
