import { useCallback, useMemo, useState } from "react";

// TODO: Replace with actual API configuration
const MOCK_BTC_PRICE_USD = 113000;
const MOCK_USDC_PRICE_USD = 1.00;
const MOCK_MAX_LTV = 0.285; // 28.5%
const MOCK_LIQUIDATION_LTV = 0.70; // 70%

// Calculate max borrowable amount
function calculateMaxBorrow(btcAmount: number): number {
  // TODO: Fetch from API
  const collateralValueUSD = btcAmount * MOCK_BTC_PRICE_USD;
  const maxBorrowUSD = collateralValueUSD * MOCK_MAX_LTV;
  return maxBorrowUSD / MOCK_USDC_PRICE_USD;
}

// Calculate current LTV
function calculateLTV(borrowAmountUSDC: number, btcAmount: number): number {
  // TODO: Fetch from API
  if (btcAmount === 0) return 0;
  const collateralValueUSD = btcAmount * MOCK_BTC_PRICE_USD;
  const loanValueUSD = borrowAmountUSDC * MOCK_USDC_PRICE_USD;
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

function validateBorrowAmount(amount: number, btcAmount: number): BorrowValidation {
  // TODO: Fetch validation rules from API
  const errors: BorrowValidation["errors"] = {};
  
  if (amount <= 0) {
    errors.amount = "Amount must be greater than 0";
  }
  
  const maxBorrow = calculateMaxBorrow(btcAmount);
  if (amount > maxBorrow) {
    errors.amount = `Amount exceeds maximum borrowable ${maxBorrow.toFixed(2)} USDC`;
  }
  
  const currentLTV = calculateLTV(amount, btcAmount);
  if (currentLTV > MOCK_LIQUIDATION_LTV * 100) {
    errors.ltv = `LTV (${currentLTV.toFixed(2)}%) exceeds liquidation threshold (${(MOCK_LIQUIDATION_LTV * 100).toFixed(0)}%)`;
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function useBorrowService(collateralBTC: number) {
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
    () => calculateMaxBorrow(collateralBTC),
    [collateralBTC]
  );

  // Calculate collateral value in USD
  const collateralValueUSD = useMemo(
    () => collateralBTC * MOCK_BTC_PRICE_USD,
    [collateralBTC]
  );

  // Calculate current LTV
  const currentLTV = useMemo(
    () => calculateLTV(borrowAmountNum, collateralBTC),
    [borrowAmountNum, collateralBTC]
  );

  // Validate borrow amount
  const validation = useMemo(
    () => validateBorrowAmount(borrowAmountNum, collateralBTC),
    [borrowAmountNum, collateralBTC]
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
    async (amount: number, collateral: number) => {
      if (!validation.isValid || amount === 0) {
        return;
      }

      setProcessing(true);
      try {
        // TODO: Call borrow API
        console.log("Processing borrow:", {
          amount,
          collateral,
          ltv: calculateLTV(amount, collateral),
        });

        // Reset form
        setBorrowAmount("");
        setTouched(false);
      } catch (error) {
        console.error("Borrow failed:", error);
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
    if (currentLTV > 50 && currentLTV <= MOCK_MAX_LTV * 100) {
      return `Warning: High LTV (${formatPercentage(currentLTV)})`;
    }
    return undefined;
  }, [touched, borrowAmount, validation, currentLTV, formatPercentage]);

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
    btcPriceUSD: MOCK_BTC_PRICE_USD,
    usdcPriceUSD: MOCK_USDC_PRICE_USD,
    maxLTV: MOCK_MAX_LTV,
    liquidationLTV: MOCK_LIQUIDATION_LTV,
    handleInputChange,
    handleBorrow,
    setTouched,
    formatUSD,
    formatPercentage,
  };
}
