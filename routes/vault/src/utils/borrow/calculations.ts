/**
 * Borrow Calculations
 *
 * Pure business logic functions for calculating borrowing limits,
 * LTV (Loan-to-Value) ratios, and validating borrow amounts.
 */

/**
 * Calculate maximum borrowable amount based on collateral and LLTV
 *
 * @param btcAmount - Collateral amount in BTC
 * @param btcPriceUSD - Current BTC price in USD
 * @param lltvPercent - Liquidation LTV percentage (e.g., 80 for 80%)
 * @returns Maximum borrowable amount in USD
 */
export function calculateMaxBorrow(
  btcAmount: number,
  btcPriceUSD: number,
  lltvPercent: number
): number {
  const collateralValueUSD = btcAmount * btcPriceUSD;
  // LLTV is the max LTV before liquidation, so use it as the max borrow ratio
  const maxBorrowUSD = collateralValueUSD * (lltvPercent / 100);
  return maxBorrowUSD;
}

/**
 * Calculate current LTV (Loan-to-Value) ratio
 *
 * @param borrowAmountUSDC - Current borrow amount in USDC
 * @param btcAmount - Collateral amount in BTC
 * @param btcPriceUSD - Current BTC price in USD
 * @returns LTV as a percentage (e.g., 65.5 for 65.5%)
 */
export function calculateLTV(
  borrowAmountUSDC: number,
  btcAmount: number,
  btcPriceUSD: number
): number {
  if (btcAmount === 0) return 0;
  const collateralValueUSD = btcAmount * btcPriceUSD;
  const loanValueUSD = borrowAmountUSDC;
  return (loanValueUSD / collateralValueUSD) * 100;
}

/**
 * Validation result for borrow amount
 */
export interface BorrowValidation {
  isValid: boolean;
  errors: {
    amount?: string;
    ltv?: string;
  };
}

/**
 * Validate borrow amount against collateral and LTV limits
 *
 * @param amount - Amount to borrow in USDC
 * @param btcAmount - Collateral amount in BTC
 * @param btcPriceUSD - Current BTC price in USD
 * @param lltvPercent - Liquidation LTV percentage (e.g., 80 for 80%)
 * @returns Validation result with errors if invalid
 */
export function validateBorrowAmount(
  amount: number,
  btcAmount: number,
  btcPriceUSD: number,
  lltvPercent: number
): BorrowValidation {
  const errors: BorrowValidation["errors"] = {};

  if (amount <= 0) {
    errors.amount = "Amount must be greater than 0";
  }

  const maxBorrow = calculateMaxBorrow(btcAmount, btcPriceUSD, lltvPercent);
  if (amount > maxBorrow) {
    errors.amount = `Amount exceeds maximum borrowable ${maxBorrow.toFixed(2)} USDC`;
  }

  const currentLTV = calculateLTV(amount, btcAmount, btcPriceUSD);
  if (currentLTV > lltvPercent) {
    errors.ltv = `LTV (${currentLTV.toFixed(2)}%) exceeds liquidation threshold (${lltvPercent.toFixed(0)}%)`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
