// On-chain data the reclaim gate needs, batched across candidate vaults.
//
// Split from the Bitcoin poll deliberately: a settled vault's contract row is
// immutable — its status will not leave Redeemed and its PegIn transaction
// cannot change — so this caches long, while the outspend poll keeps its 60s
// tick. Re-reading the registry every minute for values that cannot move would
// be pure RPC waste.
//
// This is also the *authoritative* source of the PegIn txid. `vaultId` is a
// one-way hash of it, and the indexer's copy is display-grade only.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";

import { getVaultFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { derivePeginTxid } from "@/services/vault/vaultReclaimService";
import { mapWithConcurrency } from "@/utils/concurrency";

// Settled vault rows are immutable; five minutes is well inside a session and
// still re-reads if the user leaves the page open for a long time.
const STALE_TIME_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 4;

export const RECLAIM_CHAIN_DATA_QUERY_KEY = "reclaimVaultChainData";

export interface ReclaimVaultChainData {
  /** PegIn txid derived from the contract's depositor-signed PegIn tx. */
  peginTxid: string;
  /** Live `BTCVaultStatus` enum value from the registry. */
  onChainStatus: number;
}

const EMPTY_CHAIN_DATA = new Map<string, ReclaimVaultChainData>();

export function useReclaimVaultChainData(
  vaultIds: ReadonlyArray<string>,
): Map<string, ReclaimVaultChainData> {
  const stable = useMemo(
    () => Array.from(new Set(vaultIds.map((id) => id.toLowerCase()))).sort(),
    [vaultIds],
  );

  const query = useQuery({
    queryKey: [RECLAIM_CHAIN_DATA_QUERY_KEY, stable.join(",")] as const,
    enabled: stable.length > 0,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const entries = await mapWithConcurrency(
        stable,
        MAX_CONCURRENT_REQUESTS,
        async (vaultId): Promise<[string, ReclaimVaultChainData] | null> => {
          try {
            const vault = await getVaultFromChain(vaultId as Hex);
            return [
              vaultId,
              {
                peginTxid: derivePeginTxid(vault.depositorSignedPeginTx),
                onChainStatus: vault.status,
              },
            ];
          } catch {
            // Fails closed: without the contract read the gate withholds the
            // action rather than trusting the indexer's status.
            return null;
          }
        },
      );
      return new Map<string, ReclaimVaultChainData>(
        entries.filter((e): e is [string, ReclaimVaultChainData] => e !== null),
      );
    },
  });

  return query.data ?? EMPTY_CHAIN_DATA;
}
