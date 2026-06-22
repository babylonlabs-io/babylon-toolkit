import { getPositionSizeParams } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { CONTRACTS } from "@/config/contracts";
import { ContractStatus } from "@/models/peginStateMachine";
import type { Vault } from "@/types/vault";

import { useVaults } from "./useVaults";

const VAULT_COUNT_CAP_KEY = "vaultCountCap";
const STALE_TIME_MS = 60_000;
const REFETCH_INTERVAL_MS = 60_000;

export interface VaultCountCapResult {
  maxVaults: number | null;
  currentCount: number;
  isAtCap: boolean;
  remaining: number;
  isLoading: boolean;
}

async function fetchMaxVaultsPerPosition(): Promise<number> {
  const publicClient = ethClient.getPublicClient();
  const { maxVaultsPerPosition } = await getPositionSizeParams(
    publicClient,
    CONTRACTS.AAVE_ADAPTER,
  );
  return Number(maxVaultsPerPosition);
}

const COLLATERALIZABLE_STATUSES = new Set([
  ContractStatus.ACTIVE,
  ContractStatus.PENDING,
  ContractStatus.VERIFIED,
]);

export function countCollateralizableVaults(
  vaults: Vault[],
  adapterAddress: string,
): number {
  const normalized = adapterAddress.toLowerCase();
  return vaults.filter(
    (v) =>
      COLLATERALIZABLE_STATUSES.has(v.status) &&
      v.applicationEntryPoint.toLowerCase() === normalized,
  ).length;
}

export function useVaultCountCap(
  depositorAddress: string | undefined,
): VaultCountCapResult {
  const address = depositorAddress as Address | undefined;

  const { data: maxVaults, isLoading: isLoadingCap } = useQuery({
    queryKey: [VAULT_COUNT_CAP_KEY, CONTRACTS.AAVE_ADAPTER],
    queryFn: fetchMaxVaultsPerPosition,
    staleTime: STALE_TIME_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  const { data: vaults, isLoading: isLoadingVaults } = useVaults(address);

  const currentCount = useMemo(
    () =>
      vaults ? countCollateralizableVaults(vaults, CONTRACTS.AAVE_ADAPTER) : 0,
    [vaults],
  );

  const resolved = maxVaults !== undefined;
  const isAtCap = resolved && maxVaults > 0 && currentCount >= maxVaults;
  const remaining =
    resolved && maxVaults > 0 ? Math.max(0, maxVaults - currentCount) : 0;

  return {
    maxVaults: maxVaults ?? null,
    currentCount,
    isAtCap,
    remaining,
    isLoading: isLoadingCap || (!!address && isLoadingVaults),
  };
}
