/**
 * Hook for polling pegout status from vault providers.
 *
 * Polls `vaultProvider_getPegoutStatus` for each redeemed vault,
 * batching requests by vault provider. Stops polling when all
 * vaults reach a terminal status (PayoutBroadcast or Failed).
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import type { RedeemedVaultInfo } from "@/applications/aave/hooks/useAaveVaults";
import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import type { GetPegoutStatusResponse } from "@/clients/vault-provider-rpc/types";
import {
  POLLING_INTERVAL_MS,
  POLLING_RETRY_COUNT,
  POLLING_RETRY_DELAY_MS,
  RPC_TIMEOUT_MS,
} from "@/config/polling";
import { logger } from "@/infrastructure";
import {
  getPegoutDisplayState,
  PEGOUT_TERMINAL_STATUSES,
  type PegoutDisplayState,
} from "@/models/pegoutStateMachine";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

export interface PegoutPollingResult {
  displayState: PegoutDisplayState;
  response?: GetPegoutStatusResponse;
}

interface VaultToPoll {
  vault: RedeemedVaultInfo;
  providerUrl: string;
}

interface VaultsByProvider {
  providerUrl: string;
  vaults: VaultToPoll[];
}

function groupVaultsByProvider(
  vaults: RedeemedVaultInfo[],
): Map<string, VaultsByProvider> {
  const grouped = new Map<string, VaultsByProvider>();

  for (const vault of vaults) {
    const providerAddress = vault.vaultProviderAddress;
    if (!providerAddress || !providerAddress.startsWith("0x")) {
      logger.warn(
        `Invalid or missing provider address for vault ${vault.id}, skipping pegout poll`,
      );
      continue;
    }
    const providerUrl = getVpProxyUrl(providerAddress);
    const existing = grouped.get(providerAddress);
    const entry: VaultToPoll = { vault, providerUrl };

    if (existing) {
      existing.vaults.push(entry);
    } else {
      grouped.set(providerAddress, {
        providerUrl,
        vaults: [entry],
      });
    }
  }

  return grouped;
}

async function fetchPegoutStatusesFromProvider(
  providerUrl: string,
  vaults: VaultToPoll[],
  results: Map<string, PegoutPollingResult>,
): Promise<void> {
  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  for (const { vault } of vaults) {
    try {
      const response = await rpcClient.getPegoutStatus({
        pegin_txid: stripHexPrefix(vault.id),
      });

      const displayState = getPegoutDisplayState(
        response.claimer?.status,
        response.found,
      );

      results.set(vault.id, { displayState, response });
    } catch (error) {
      logger.warn(`Failed to poll pegout status for ${vault.id}`, {
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      results.set(vault.id, {
        displayState: getPegoutDisplayState(undefined, false),
      });
    }
  }
}

interface UsePegoutPollingParams {
  redeemedVaults: RedeemedVaultInfo[];
}

interface UsePegoutPollingResult {
  pegoutStatuses: Map<string, PegoutPollingResult>;
  isLoading: boolean;
}

export function usePegoutPolling({
  redeemedVaults,
}: UsePegoutPollingParams): UsePegoutPollingResult {
  const vaultsRef = useRef(redeemedVaults);

  useEffect(() => {
    vaultsRef.current = redeemedVaults;
  }, [redeemedVaults]);

  const isEnabled = redeemedVaults.length > 0;

  const queryKey = useMemo(
    () => ["pegoutPolling", redeemedVaults.map((v) => v.id).join(",")],
    [redeemedVaults],
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Map<string, PegoutPollingResult>> => {
      const currentVaults = vaultsRef.current;

      if (currentVaults.length === 0) {
        return new Map();
      }

      const vaultsByProvider = groupVaultsByProvider(currentVaults);

      const results = new Map<string, PegoutPollingResult>();

      const fetchPromises = Array.from(vaultsByProvider.values()).map(
        ({ providerUrl, vaults }) =>
          fetchPegoutStatusesFromProvider(providerUrl, vaults, results),
      );

      await Promise.all(fetchPromises);

      // Seed "Initiating" for vaults whose provider wasn't found (data inconsistency),
      // so they're included in the terminal check and don't cause premature poll stop.
      for (const vault of currentVaults) {
        if (!results.has(vault.id)) {
          results.set(vault.id, {
            displayState: getPegoutDisplayState(undefined, false),
          });
        }
      }

      return results;
    },
    enabled: isEnabled,
    staleTime: 0,
    refetchInterval: (query) => {
      const statusMap = query.state.data;
      if (!statusMap || statusMap.size === 0) return POLLING_INTERVAL_MS;

      // Stop polling when all vaults have reached a terminal status
      const allTerminal = Array.from(statusMap.values()).every((result) => {
        const claimerStatus = result.response?.claimer?.status;
        return claimerStatus && PEGOUT_TERMINAL_STATUSES.has(claimerStatus);
      });

      return allTerminal ? false : POLLING_INTERVAL_MS;
    },
    retry: POLLING_RETRY_COUNT,
    retryDelay: POLLING_RETRY_DELAY_MS,
    placeholderData: keepPreviousData,
  });

  const pegoutStatuses = useMemo(() => {
    if (!data) return new Map<string, PegoutPollingResult>();
    return data;
  }, [data]);

  return { pegoutStatuses, isLoading };
}
