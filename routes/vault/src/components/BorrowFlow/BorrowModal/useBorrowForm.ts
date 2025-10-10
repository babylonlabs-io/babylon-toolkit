import { useCallback, useMemo, useState } from "react";

// Fallback values if market data not provided
const FALLBACK_BTC_PRICE_USD = 100000;
const FALLBACK_USDC_PRICE_USD = 1.00;
const FALLBACK_LLTV_PERCENT = 80; // 80%

// Calculate max borrowable amount
function calculateMaxBorrow(btcAmount: number, btcPriceUSD: number, lltvPercent: number): number {
  const collateralValueUSD = btcAmount * btcPriceUSD;
  // LLTV is the max LTV before liquidation, so use it as the max borrow ratio
  const maxBorrowUSD = collateralValueUSD * (lltvPercent / 100);
  return maxBorrowUSD;
}

// Calculate current LTV
function calculateLTV(borrowAmountUSDC: number, btcAmount: number, btcPriceUSD: number): number {
  if (btcAmount === 0) return 0;
  const collateralValueUSD = btcAmount * btcPriceUSD;
  const loanValueUSD = borrowAmountUSDC;
  return (loanValueUSD / collateralValueUSD) * 100;
}

// Validate borrow amount
interface BorrowValidation {
  isValid: boolean;
  errors: {
    amount?: string;
    ltv?: string;
  };
}

function validateBorrowAmount(
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

export function useBorrowForm(
  collateralBTC: number,
  marketData?: { btcPriceUSD: number; lltvPercent: number }
) {
  // Use market data if provided, otherwise fall back to defaults
  const btcPriceUSD = marketData?.btcPriceUSD ?? FALLBACK_BTC_PRICE_USD;
  const lltvPercent = marketData?.lltvPercent ?? FALLBACK_LLTV_PERCENT;
  const [borrowAmount, setBorrowAmount] = useState<string>("");
  const [touched, setTouched] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Parse borrow amount as number
  const borrowAmountNum = useMemo(() => {
    const parsed = parseFloat(borrowAmount || "0");
    return isNaN(parsed) ? 0 : parsed;
  }, [borrowAmount]);

  // Calculate max borrowable amount
  const maxBorrow = useMemo(
    () => calculateMaxBorrow(collateralBTC, btcPriceUSD, lltvPercent),
    [collateralBTC, btcPriceUSD, lltvPercent]
  );

  // Calculate collateral value in USD
  const collateralValueUSD = useMemo(
    () => collateralBTC * btcPriceUSD,
    [collateralBTC, btcPriceUSD]
  );

  // Calculate current LTV
  const currentLTV = useMemo(
    () => calculateLTV(borrowAmountNum, collateralBTC, btcPriceUSD),
    [borrowAmountNum, collateralBTC, btcPriceUSD]
  );

  // Validate borrow amount
  const validation = useMemo(
    () => validateBorrowAmount(borrowAmountNum, collateralBTC, btcPriceUSD, lltvPercent),
    [borrowAmountNum, collateralBTC, btcPriceUSD, lltvPercent]
  );

  // Determine input state
  const inputState: "default" | "error" | "warning" = useMemo(() => {
    if (!touched || borrowAmount === "") return "default";
    if (!validation.isValid) return "error";
    if (currentLTV > 50) return "warning";
    return "default";
  }, [touched, borrowAmount, validation.isValid, currentLTV]);

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setBorrowAmount(value);
      setTouched(true);
    },
    []
  );

  const handleBorrow = useCallback(
    async (amount: number) => {
      if (!validation.isValid || amount === 0) {
        return;
      }

      setProcessing(true);
      try {
        // TODO: Call borrow API

        // Reset form
        setBorrowAmount("");
        setTouched(false);
      } catch (error) {
        // Error handled by caller
      } finally {
        setProcessing(false);
      }
    },
    [validation.isValid]
  );

  const formatUSD = useCallback((value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }, []);

  const formatPercentage = useCallback((value: number) => {
    return `${value.toFixed(2)}%`;
  }, []);

  const hintText = useMemo(() => {
    if (!touched || borrowAmount === "") return undefined;
    if (validation.errors.amount) return validation.errors.amount;
    if (validation.errors.ltv) return validation.errors.ltv;
    if (currentLTV > 50 && currentLTV <= lltvPercent) {
      return `Warning: High LTV (${formatPercentage(currentLTV)})`;
    }
    return undefined;
  }, [touched, borrowAmount, validation, currentLTV, formatPercentage, lltvPercent]);

  return {
    borrowAmount,
    borrowAmountNum,
    touched,
    processing,
    inputState,
    maxBorrow,
    collateralValueUSD,
    currentLTV,
    validation,
    hintText,
    btcPriceUSD,
    usdcPriceUSD: FALLBACK_USDC_PRICE_USD,
    maxLTV: lltvPercent / 100,
    liquidationLTV: lltvPercent / 100,
    handleInputChange,
    handleBorrow,
    setTouched,
    formatUSD,
    formatPercentage,
  };
}
