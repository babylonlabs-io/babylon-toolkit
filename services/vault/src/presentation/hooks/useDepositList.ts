import { useCallback, useEffect, useState } from "react";

import {
  DepositDTO,
  DepositFilterDTO,
  PaginatedDepositsDTO,
} from "../../application/dtos/DepositDTO";
import { GetDepositsUseCase } from "../../application/use-cases/GetDepositsUseCase";
import { DepositRepository } from "../../infrastructure/repositories/DepositRepository";

// Singleton instance - in production, use dependency injection
const depositRepository = new DepositRepository();
const getDepositsUseCase = new GetDepositsUseCase(depositRepository);

/**
 * Hook for fetching and managing deposit lists.
 * Handles pagination, filtering, and automatic refetching.
 */
export function useDepositList(depositorAddress?: string) {
  const [deposits, setDeposits] = useState<DepositDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState<{
    total: number;
    hasMore: boolean;
    offset: number;
    limit: number;
  }>({
    total: 0,
    hasMore: false,
    offset: 0,
    limit: 20,
  });

  const fetchDeposits = useCallback(
    async (filter?: DepositFilterDTO) => {
      setIsLoading(true);
      setError(null);

      try {
        let result: PaginatedDepositsDTO;

        if (depositorAddress) {
          // Fetch deposits for specific depositor
          const deposits =
            await getDepositsUseCase.getByDepositor(depositorAddress);
          result = {
            deposits,
            total: deposits.length,
            limit: deposits.length,
            offset: 0,
            hasMore: false,
          };
        } else if (filter) {
          // Fetch with custom filter
          result = await getDepositsUseCase.getWithFilter(filter);
        } else {
          // Fetch all deposits with default pagination
          result = await getDepositsUseCase.getWithFilter({
            limit: 20,
            offset: 0,
          });
        }

        setDeposits(result.deposits);
        setPagination({
          total: result.total,
          hasMore: result.hasMore,
          offset: result.offset,
          limit: result.limit,
        });
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to fetch deposits");
        setError(error);
      } finally {
        setIsLoading(false);
      }
    },
    [depositorAddress],
  );

  const loadMore = useCallback(async () => {
    if (!pagination.hasMore || isLoading) return;

    const nextOffset = pagination.offset + pagination.limit;
    const filter: DepositFilterDTO = {
      depositorAddress,
      offset: nextOffset,
      limit: pagination.limit,
    };

    setIsLoading(true);
    try {
      const result = await getDepositsUseCase.getWithFilter(filter);
      setDeposits((prev) => [...prev, ...result.deposits]);
      setPagination({
        total: result.total,
        hasMore: result.hasMore,
        offset: result.offset,
        limit: result.limit,
      });
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to load more deposits");
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [depositorAddress, pagination, isLoading]);

  const refetch = useCallback(() => {
    return fetchDeposits();
  }, [fetchDeposits]);

  // Initial fetch
  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  return {
    deposits,
    isLoading,
    error,
    pagination,
    loadMore,
    refetch,
  };
}
