import { useCallback, useState } from "react";

import { RedeemDepositDTO } from "../../application/dtos/DepositDTO";
import { RedeemDepositUseCase } from "../../application/use-cases/RedeemDepositUseCase";
import { DepositRepository } from "../../infrastructure/repositories/DepositRepository";

// Singleton instance - in production, use dependency injection
const depositRepository = new DepositRepository();
const redeemDepositUseCase = new RedeemDepositUseCase(depositRepository);

/**
 * Hook for redeeming deposits.
 */
export function useRedeemDeposit() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const redeemDeposits = useCallback(async (data: RedeemDepositDTO) => {
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    try {
      await redeemDepositUseCase.execute(data);
      setIsSuccess(true);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to redeem deposits");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setIsSuccess(false);
    setIsLoading(false);
  }, []);

  return {
    redeemDeposits,
    isLoading,
    error,
    isSuccess,
    reset,
  };
}
