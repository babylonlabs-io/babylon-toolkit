/**
 * Per-vault-provider activity stats, derived from the GraphQL indexer.
 *
 * The deposit picker uses these to:
 * - sort VPs by their most recent successful peg-in, and
 * - show the total active BTC currently locked via each VP.
 *
 * Both are display-only signals: a partial or missing result degrades the
 * UI (placeholder amount, fallback sort order) but never blocks a deposit.
 * One VP's query failing therefore does not fail the others.
 */

import { gql } from "graphql-request";

import { logger } from "@/infrastructure";

import { graphqlClient } from "../../clients/graphql/client";

/**
 * GraphQL `status` value for a vault whose peg-in completed and whose BTC is
 * currently locked and usable as collateral. Mirrors `VaultStatus.ACTIVE`.
 */
const ACTIVE_VAULT_STATUS = "available";

/** Seconds → milliseconds, for indexer unix timestamps. */
const MS_PER_SECOND = 1000;

/**
 * Activity stats for a single vault provider.
 */
export interface VaultProviderStats {
  /** Total satoshis across this VP's vaults that are currently active. */
  totalActiveSats: bigint;
  /**
   * ms timestamp of this VP's most recently activated vault, or `undefined`
   * when the VP has never had a vault reach the activated state.
   */
  lastSuccessfulPeginAt?: number;
}

interface VaultProviderVaultsResponse {
  vaults: {
    items: Array<{
      amount: string;
      status: string;
      activatedAt: string | null;
    }>;
    totalCount: number;
  };
}

/**
 * Projects only the three fields the stats aggregation needs. A lean
 * projection keeps a transient indexer issue on an unrelated field from
 * dropping rows and skewing the totals.
 */
const GET_VAULTS_BY_PROVIDER = gql`
  query GetVaultsByProvider($vaultProvider: String!) {
    vaults(where: { vaultProvider: $vaultProvider }) {
      items {
        amount
        status
        activatedAt
      }
      totalCount
    }
  }
`;

/**
 * Aggregate one VP's vaults into {@link VaultProviderStats}.
 *
 * `activatedAt` is set once a vault reaches the activated state and is never
 * cleared, so the most recent `activatedAt` across all of a VP's vaults is
 * its most recent successful peg-in — regardless of the vault's later status
 * (redeemed, liquidated, …).
 */
function aggregateStats(
  items: VaultProviderVaultsResponse["vaults"]["items"],
): VaultProviderStats {
  let totalActiveSats = 0n;
  let lastSuccessfulPeginAt: number | undefined;

  for (const item of items) {
    if (item.status === ACTIVE_VAULT_STATUS) {
      totalActiveSats += BigInt(item.amount);
    }

    if (item.activatedAt != null) {
      const activatedMs = Number.parseInt(item.activatedAt, 10) * MS_PER_SECOND;
      if (
        Number.isFinite(activatedMs) &&
        (lastSuccessfulPeginAt === undefined ||
          activatedMs > lastSuccessfulPeginAt)
      ) {
        lastSuccessfulPeginAt = activatedMs;
      }
    }
  }

  return { totalActiveSats, lastSuccessfulPeginAt };
}

/**
 * Fetch activity stats for the given vault providers.
 *
 * @param vaultProviderIds - VP Ethereum addresses.
 * @returns Map keyed by lowercased VP address. VPs whose query failed are
 *          absent from the map (the caller renders a placeholder for them).
 *
 * TODO(perf): N+1 — one GraphQL round-trip per VP. The registry is small
 * enough today that this is acceptable, but once the indexer schema gains a
 * `vaultProvider_in` (or similar) filter, collapse this into a single query
 * that returns all VPs' vaults at once and group client-side. That also
 * removes the FIFO-ordering assumption the failure-isolation test relies on.
 */
export async function fetchVaultProviderStats(
  vaultProviderIds: string[],
): Promise<Map<string, VaultProviderStats>> {
  const results = await Promise.allSettled(
    vaultProviderIds.map(async (id) => {
      const data = await graphqlClient.request<VaultProviderVaultsResponse>(
        GET_VAULTS_BY_PROVIDER,
        { vaultProvider: id.toLowerCase() },
      );

      const { items, totalCount } = data.vaults;
      if (items.length !== totalCount) {
        // A page-size cap truncated the result. Aggregating the partial page
        // would silently undercount active BTC and skew the picker's sort by
        // last successful peg-in, with the discrepancy visible only in the
        // console. Throw so the VP is absent from the result map and the
        // picker renders the existing "—" placeholder instead.
        // TODO: paginate (cursor / skip) once the indexer query exposes it,
        // so a high-volume VP still shows real totals instead of a placeholder.
        throw new Error(
          `[fetchVaultProviderStats] VP ${id}: indexer returned ` +
            `${items.length} of ${totalCount} vaults; refusing partial stats`,
        );
      }

      return { id: id.toLowerCase(), stats: aggregateStats(items) };
    }),
  );

  const statsById = new Map<string, VaultProviderStats>();
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      statsById.set(result.value.id, result.value.stats);
      return;
    }
    logger.warn(
      `[fetchVaultProviderStats] Failed to fetch stats for VP ` +
        `${vaultProviderIds[index]}`,
      { data: { error: result.reason } },
    );
  });

  return statsById;
}
