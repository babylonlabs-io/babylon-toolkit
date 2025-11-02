import { useCallback, useState } from "react";

import {
  CreateDepositDTO,
  DepositDTO,
} from "../../application/dtos/DepositDTO";
import { CreateDepositUseCase } from "../../application/use-cases/CreateDepositUseCase";
import { DepositRepository } from "../../infrastructure/repositories/DepositRepository";
import { VaultProviderRepository } from "../../infrastructure/repositories/VaultProviderRepository";

// Singleton instances - in production, use dependency injection
const depositRepository = new DepositRepository();
const vaultProviderRepository = new VaultProviderRepository();
const createDepositUseCase = new CreateDepositUseCase(
  depositRepository,
  vaultProviderRepository,
);

/**
 * Hook for creating a new deposit using the clean architecture.
 * Separates business logic from UI concerns.
 */
export function useCreateDeposit() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [deposit, setDeposit] = useState<DepositDTO | null>(null);

  const createDeposit = useCallback(async (data: CreateDepositDTO) => {
    setIsLoading(true);
    setError(null);

    try {
      const newDeposit = await createDepositUseCase.execute(data);
      setDeposit(newDeposit);
      return newDeposit;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to create deposit");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setDeposit(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    createDeposit,
    deposit,
    isLoading,
    error,
    reset,
  };
}
