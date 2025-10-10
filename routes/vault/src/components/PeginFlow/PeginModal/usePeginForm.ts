import { useMemo, useCallback } from 'react';
import { object, number, array, string } from 'yup';
import { SATOSHIS_PER_BTC } from '../../../utils/peginTransformers';

// Helper function to convert satoshis to BTC
const satoshiToBtc = (satoshi: number): number => {
  return satoshi / Number(SATOSHIS_PER_BTC);
};

// Helper function to format number
const formatNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
};

// Helper function to validate decimal points
const validateDecimalPoints = (value: any): boolean => {
  if (!value) return true;
  const str = String(value);
  const decimalIndex = str.indexOf('.');
  if (decimalIndex === -1) return true;
  const decimals = str.slice(decimalIndex + 1).length;
  return decimals <= 8;
};

interface UsePeginFormParams {
  btcBalance: number; // in satoshis
  btcPrice: number;
  coinName?: string;
  displayUSD?: boolean;
}

export function usePeginForm({
  btcBalance,
  btcPrice,
  coinName = 'BTC',
  displayUSD = true,
}: UsePeginFormParams) {
  // Convert balance from satoshis to BTC
  const btcBalanceFormatted = useMemo(
    () => satoshiToBtc(btcBalance),
    [btcBalance]
  );

  // Validation schema (following simple-staking pattern)
  const validationSchema = useMemo(
    () =>
      object().shape({
        amount: number()
          .transform(formatNumber)
          .typeError('Peg-in amount must be a valid number.')
          .required('Peg-in amount is required.')
          .moreThan(0, 'Peg-in amount must be greater than 0.')
          .max(
            btcBalanceFormatted,
            `Peg-in amount exceeds your balance (${satoshiToBtc(btcBalance).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })} ${coinName})!`
          )
          .test(
            'decimal-points',
            'Peg-in amount must have no more than 8 decimal points.',
            validateDecimalPoints
          ),

        selectedProviders: array()
          .of(string().required())
          .required('Please select at least one vault provider.')
          .min(1, 'Please select at least one vault provider.'),
      }),
    [btcBalance, btcBalanceFormatted, coinName]
  );

  // Calculate USD equivalent
  const calculateUsdValue = useCallback(
    (amount: number): string => {
      if (!displayUSD || !btcPrice || amount === 0) return '';
      const usdValue = amount * btcPrice;
      return `$${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },
    [btcPrice, displayUSD]
  );

  // Validate amount
  const validateAmount = useCallback(
    (amount: number): { valid: boolean; error?: string } => {
      if (amount <= 0) {
        return { valid: false, error: 'Peg-in amount must be greater than 0.' };
      }
      if (amount > btcBalanceFormatted) {
        return { valid: false, error: 'Amount exceeds available balance' };
      }
      if (!validateDecimalPoints(amount)) {
        return { valid: false, error: 'Peg-in amount must have no more than 8 decimal points.' };
      }
      return { valid: true };
    },
    [btcBalanceFormatted]
  );

  // Validate providers
  const validateProviders = useCallback(
    (providers: string[]): { valid: boolean; error?: string } => {
      if (providers.length === 0) {
        return { valid: false, error: 'Please select at least one vault provider' };
      }
      return { valid: true };
    },
    []
  );

  // Validate entire form
  const validateForm = useCallback(
    (amount: number, providers: string[]): boolean => {
      const amountValidation = validateAmount(amount);
      const providersValidation = validateProviders(providers);
      return amountValidation.valid && providersValidation.valid;
    },
    [validateAmount, validateProviders]
  );

  // Handler: Auto-fill max balance
  const getMaxBalance = useCallback((): number => {
    return btcBalanceFormatted;
  }, [btcBalanceFormatted]);

  return {
    validationSchema,
    btcBalanceFormatted,
    calculateUsdValue,
    validateAmount,
    validateProviders,
    validateForm,
    getMaxBalance,
    coinName,
  };
}
