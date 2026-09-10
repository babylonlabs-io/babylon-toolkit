/**
 * Per-vault-provider activity stats, derived from the GraphQL indexer.
 *
 * The deposit picker uses these to:
 * - sort VPs by their most recent successful peg-in, and
 * - show the total active BTC currently locked via each VP.
 *
 * Both are display-only signals: a missing result degrades the UI
 * (placeholder amount, fallback sort order) but never blocks a deposit.
 *
 * All VPs are fetched in one paginated query and grouped client-side, so the
 * result is all-or-nothing: anything that would yield a partial count throws
 * instead. A half-counted total renders as a confident wrong number, which is
 * worse than no number at all. Rejecting is also what lets the caller's
 * react-query retry fire; once it is exhausted every VP falls back to its
 * placeholder. The query cache logs the terminal failure, so nothing is
 * logged here.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/client";

/**
 * GraphQL `status` value for a vault whose peg-in completed and whose BTC is
 * currently locked and usable as collateral. Mirrors `VaultStatus.ACTIVE`.
 */
const ACTIVE_VAULT_STATUS = "available";

/** Seconds → milliseconds, for indexer unix timestamps. */
const MS_PER_SECOND = 1000;

/**
 * Rows per round-trip. Ponder caps a page at `MAX_LIMIT = 1000` and defaults to
 * `DEFAULT_LIMIT = 50` when the query omits `limit`, so asking for the maximum
 * is what keeps a multi-VP batch to a single request in practice.
 */
const PAGE_SIZE = 1000;

/**
 * Sole runaway guard on the cursor walk. Ponder appends the primary key to
 * every ordering, so an honest cursor always advances; this bounds a broken
 * indexer and a batch genuinely larger than `PAGE_SIZE × MAX_PAGES` activated
 * vaults, both of which throw rather than under-report.
 */
const MAX_PAGES = 20;

/** Indexer integers arrive as decimal strings; anything else is a corrupt row. */
const DECIMAL_DIGITS = /^\d+$/;

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

interface VaultItem {
  vaultProvider: string;
  amount: string;
  status: string;
  activatedAt: string;
}

interface VaultProviderVaultsResponse {
  vaults: {
    items: VaultItem[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

/**
 * Only activated vaults contribute to either stat: an `available` vault was
 * activated by definition, and the last peg-in reads `activatedAt`. Filtering
 * server-side keeps pending, expired and never-activated rows out of the walk.
 * Projects only the fields the aggregation needs, plus `vaultProvider` to
 * group by — a lean projection keeps a transient indexer issue on an
 * unrelated field from dropping rows and skewing the totals.
 */
const GET_VAULTS_BY_PROVIDERS = gql`
  query GetVaultsByProviders(
    $vaultProviders: [String]
    $limit: Int
    $after: String
  ) {
    vaults(
      where: { vaultProvider_in: $vaultProviders, activatedAt_not: null }
      limit: $limit
      after: $after
    ) {
      items {
        vaultProvider
        amount
        status
        activatedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

function parseIndexerUint(field: string, value: string): bigint {
  if (!DECIMAL_DIGITS.test(value)) {
    throw new Error(
      `[fetchVaultProviderStats] Indexer returned a non-numeric ${field}: ` +
        JSON.stringify(value),
    );
  }
  return BigInt(value);
}

/**
 * Fold one activated vault into its provider's running totals.
 *
 * `activatedAt` is set once a vault reaches the activated state and is never
 * cleared, so the most recent `activatedAt` across all of a VP's vaults is its
 * most recent successful peg-in — regardless of the vault's later status
 * (redeemed, liquidated, …).
 */
function accumulate(stats: VaultProviderStats, item: VaultItem): void {
  const amount = parseIndexerUint("amount", item.amount);
  if (item.status === ACTIVE_VAULT_STATUS) {
    stats.totalActiveSats += amount;
  }

  const activatedMs =
    Number(parseIndexerUint("activatedAt", item.activatedAt)) * MS_PER_SECOND;
  if (
    stats.lastSuccessfulPeginAt === undefined ||
    activatedMs > stats.lastSuccessfulPeginAt
  ) {
    stats.lastSuccessfulPeginAt = activatedMs;
  }
}

/**
 * Fetch activity stats for the given vault providers.
 *
 * @param vaultProviderIds - VP Ethereum addresses.
 * @param signal - Aborts the remaining pages when the caller unmounts.
 * @returns Map keyed by lowercased VP address. Every requested VP is present;
 *          one with no activated vaults reads as zero, which is the true
 *          total. Rejects rather than returning a partial count — see the
 *          module note.
 */
export async function fetchVaultProviderStats(
  vaultProviderIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, VaultProviderStats>> {
  const ids = vaultProviderIds.map((id) => id.toLowerCase());

  // Seed every requested VP. A VP the indexer returns no rows for genuinely has
  // zero active BTC, which must render as "0" — absence from this map means
  // "unknown" at the call site and renders a placeholder instead.
  const statsById = new Map<string, VaultProviderStats>(
    ids.map((id) => [id, { totalActiveSats: 0n }]),
  );

  if (ids.length === 0) return statsById;

  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    // Annotated because `after` is assigned from `pageInfo` below and also
    // feeds this call's variables; without it TS reports the cycle as TS7022.
    const { items, pageInfo }: VaultProviderVaultsResponse["vaults"] = (
      await graphqlClient.request<VaultProviderVaultsResponse>({
        document: GET_VAULTS_BY_PROVIDERS,
        variables: { vaultProviders: ids, limit: PAGE_SIZE, after },
        signal,
      })
    ).vaults;

    for (const item of items) {
      // Ponder lowercases hex columns on write and on filter, so a row is
      // either exactly one of the requested ids or proof the filter is broken.
      const stats = statsById.get(item.vaultProvider);
      if (!stats) {
        throw new Error(
          `[fetchVaultProviderStats] Indexer returned a vault for unrequested ` +
            `provider ${item.vaultProvider}`,
        );
      }
      accumulate(stats, item);
    }

    if (!pageInfo.hasNextPage) return statsById;

    // `hasNextPage` without a cursor is unpageable. Returning here would ship
    // the pages gathered so far as if they were the whole total.
    if (!pageInfo.endCursor) {
      throw new Error(
        `[fetchVaultProviderStats] Indexer reported another page but no ` +
          `cursor after page ${page + 1}; stats would be under-counted`,
      );
    }
    after = pageInfo.endCursor;
  }

  throw new Error(
    `[fetchVaultProviderStats] More than ${MAX_PAGES * PAGE_SIZE} activated ` +
      `vaults across ${ids.length} vault provider(s); raise MAX_PAGES rather ` +
      `than shipping an under-count`,
  );
}
