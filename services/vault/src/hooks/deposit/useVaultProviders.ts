/**
 * Hook to fetch and cache vault providers and vault keepers (per-application)
 *
 * This hook fetches vault providers and vault keepers from the GraphQL indexer.
 * The data is cached per application entryPoint using React Query.
 *
 * Logos are fetched separately via useLogos hook to avoid blocking provider
 * data on the logo API. Providers are available immediately; logos are merged
 * when they arrive.
 *
 * Note: Universal challengers are system-wide and should be accessed via
 * useProtocolParamsContext() instead.
 *
 * Since provider data rarely changes, we use aggressive caching:
 * - Cache for 5 minutes (staleTime)
 * - Keep in cache for 10 minutes (cacheTime)
 * - Fetch once on mount, don't refetch on window focus
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import featureFlags from "@/config/featureFlags";
import { shouldRetry } from "@/config/queryClient";
import { logger } from "@/infrastructure";
import { shortId, TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";

import { useAaveConfig } from "../../applications/aave/context/AaveConfigContext";
import {
  fetchAppProviderMetadata,
  fetchAppProviders,
} from "../../services/providers";
import type {
  AppProvidersResponse,
  VaultKeeper,
  VaultProvider,
} from "../../types";
import { useDisabledVps } from "../useDisabledVps";
import { toIdentity } from "../useLogos";
import { useUnhealthyVps } from "../useUnhealthyVps";
import { useWithLogos } from "../useWithLogos";

const EMPTY_VAULT_PROVIDERS: VaultProvider[] = [];
const EMPTY_VAULT_KEEPERS: VaultKeeper[] = [];
const getProviderIdentity = (p: VaultProvider) => toIdentity(p.btcPubKey);

/**
 * Applications for which the empty-picker event has already been emitted this
 * session. Module-scoped (not per hook instance): the hook mounts in several
 * components at once, and the systemic "picker is empty" condition must be
 * reported once, keyed to the application — not once per mount. Keys are
 * lowercased addresses so checksummed and lowercase mounts of the same
 * application share one entry.
 */
const emittedEmptyPickerFor = new Set<string>();

/**
 * Applications whose unmatched allowlist entries have already been logged
 * this session. Module-scoped for the same reason as emittedEmptyPickerFor.
 */
const warnedUnmatchedAllowlistFor = new Set<string>();

export interface UseVaultProvidersResult {
  /**
   * Every listable vault provider — including runtime-unhealthy and
   * metadata-rejected ones (shown in the picker, sorted to the bottom with a
   * warning) but EXCLUDING proxy-disabled VPs and, when
   * NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS is set, VPs outside that
   * allowlist; both are hidden from the picker entirely. The deposit picker
   * uses this list. To resolve a provider that an existing vault is bound to
   * — which may be disabled or unlisted — use {@link findProvider}, which
   * searches the full unfiltered set.
   */
  allVaultProviders: VaultProvider[];
  /** Lowercased Ethereum addresses of runtime-unhealthy VPs (per `/vp-health`). */
  unhealthyVpIds: ReadonlySet<string>;
  /** Array of vault keepers (per-application) */
  vaultKeepers: VaultKeeper[];
  /** Loading state - true while fetching */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Function to manually refetch */
  refetch: () => Promise<void>;
  /** Find provider by Ethereum address */
  findProvider: (address: string) => VaultProvider | undefined;
}

interface UseVaultProvidersOptions {
  /**
   * Require a complete keeper history. Provider-only recovery and management
   * paths disable this so a keeper pagination outage cannot hide a provider
   * that an existing vault is already bound to.
   */
  requireCompleteKeeperRoster?: boolean;
}

/**
 * Hook to fetch vault providers and vault keepers from the GraphQL indexer
 *
 * Data is cached per application entryPoint and shared across all components.
 * When applicationEntryPoint changes, providers are re-fetched for the new application.
 *
 * Note: For universal challengers (system-wide), use useProtocolParamsContext() instead.
 *
 * @param applicationEntryPoint - Optional override for the application entry point address.
 *                                When omitted, defaults to the Aave config's adapterAddress.
 * @returns Hook result with vaultProviders, vaultKeepers, loading, error states
 */
export function useVaultProviders(
  applicationEntryPoint?: string,
  { requireCompleteKeeperRoster = true }: UseVaultProvidersOptions = {},
): UseVaultProvidersResult {
  const { config } = useAaveConfig();
  const entryPoint = applicationEntryPoint ?? config?.adapterAddress;

  const { data, isLoading, error, refetch } = useQuery<AppProvidersResponse>({
    queryKey: [
      "providers",
      entryPoint,
      requireCompleteKeeperRoster ? "complete-roster" : "metadata-only",
    ],
    queryFn: () =>
      requireCompleteKeeperRoster
        ? fetchAppProviders(entryPoint!)
        : fetchAppProviderMetadata(entryPoint!),
    // Only fetch when entryPoint is provided
    enabled: Boolean(entryPoint),
    // Fetch once on mount
    refetchOnMount: false,
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect
    refetchOnReconnect: false,
    // Consider data fresh for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    // Retry transient failures once; incomplete roster errors are deterministic.
    retry: (failureCount, queryError) =>
      failureCount < 1 && shouldRetry(failureCount, queryError),
  });

  const unhealthyVps = useUnhealthyVps();
  const disabledVps = useDisabledVps();

  // All providers with logos (unfiltered) — the source of truth for
  // findProvider. The deposit picker sorts unhealthy / metadata-rejected VPs
  // to the bottom instead of hiding them, and findProvider must resolve any
  // provider that existing vaults are bound to (including ones that are now
  // disabled, or whose rpcUrl later went bad).
  const allProviders = data?.vaultProviders ?? EMPTY_VAULT_PROVIDERS;
  const allProvidersWithLogos = useWithLogos(allProviders, getProviderIdentity);

  // Listable subset shown in the picker: the full set narrowed to the
  // operator allowlist when one is set, minus proxy-disabled VPs. Both hide a
  // VP entirely (it cannot be selected for a new deposit); unhealthy /
  // metadata-rejected VPs remain and are sorted to the bottom by the picker.
  const { listableProviders, allowlistedCount, unmatchedAllowlistEntries } =
    useMemo(() => {
      const allowlist = featureFlags.allowedVaultProviders;
      const allowlisted = allowlist
        ? allProvidersWithLogos.filter((p) => allowlist.has(p.id.toLowerCase()))
        : allProvidersWithLogos;
      const matched = new Set(allowlisted.map((p) => p.id.toLowerCase()));
      return {
        listableProviders: allowlisted.filter(
          (p) => !disabledVps.has(p.id.toLowerCase()),
        ),
        allowlistedCount: allowlisted.length,
        // Shortened past the telemetry scrubber: a raw address is rewritten
        // to [ETH_ADDR] on the way out and lost as a correlation key.
        unmatchedAllowlistEntries: allowlist
          ? [...allowlist].filter((entry) => !matched.has(entry)).map(shortId)
          : [],
      };
    }, [allProvidersWithLogos, disabledVps]);

  // The two signals below describe the deposit picker, which lists the
  // current application's providers. The hook also mounts for a vault's own
  // application (payout signing), which after an adapter redeploy is not the
  // one the picker shows; an empty roster there is not a blocked funnel.
  const isCurrentApplication =
    entryPoint !== undefined &&
    config?.adapterAddress !== undefined &&
    entryPoint.toLowerCase() === config.adapterAddress.toLowerCase();

  // Providers exist but none is listable: the deposit picker renders empty and
  // no deposit can start — a systemic signal, distinct from an application
  // with no providers. The reason says which gate emptied it: an allowlist
  // that matched nobody, or the proxy disabling every match. Once per
  // application per session; the picker's own empty-state copy remains the
  // user-facing surface.
  useEffect(() => {
    if (!entryPoint || !isCurrentApplication) return;
    if (allProvidersWithLogos.length === 0 || listableProviders.length > 0) {
      return;
    }
    const appKey = entryPoint.toLowerCase();
    if (emittedEmptyPickerFor.has(appKey)) return;
    emittedEmptyPickerFor.add(appKey);
    const allowlistEmptied = allowlistedCount === 0;
    logger.event(TELEMETRY_EVENT.ONBOARDING_PROVIDERS_EMPTY, {
      level: "warning",
      category: "onboarding",
      tags: { reason: allowlistEmptied ? "allowlist" : "all_disabled" },
      total: allProvidersWithLogos.length,
      applicationId: shortId(appKey),
      // The warning below is only a breadcrumb and runs after this capture,
      // so the entries travel with the one message that is actually sent.
      ...(allowlistEmptied
        ? { unmatchedAllowlist: unmatchedAllowlistEntries }
        : {}),
    });
  }, [
    entryPoint,
    isCurrentApplication,
    allProvidersWithLogos,
    listableProviders,
    allowlistedCount,
    unmatchedAllowlistEntries,
  ]);

  // An allowlist entry that matches no provider of the current application is
  // most likely a typo or an address registered under another application.
  // Say so once the roster has loaded, so an operator can find it in the logs.
  useEffect(() => {
    if (!entryPoint || !isCurrentApplication || data === undefined) return;
    if (unmatchedAllowlistEntries.length === 0) return;
    const appKey = entryPoint.toLowerCase();
    if (warnedUnmatchedAllowlistFor.has(appKey)) return;
    warnedUnmatchedAllowlistFor.add(appKey);
    logger.warn(
      `[useVaultProviders] NEXT_PUBLIC_TBV_ALLOWED_VAULT_PROVIDERS lists ` +
        `${unmatchedAllowlistEntries.length} address(es) that match no vault ` +
        `provider of application ${shortId(appKey)}: ` +
        unmatchedAllowlistEntries.join(", "),
    );
  }, [entryPoint, isCurrentApplication, data, unmatchedAllowlistEntries]);

  // Find provider by address — searches ALL providers (including disabled,
  // unlisted, unhealthy, and metadata-rejected) so that vault management flows
  // (payout signing, dashboard, refund) still work for existing vaults bound
  // to a provider that was later disabled, left off the allowlist, or whose
  // rpcUrl went bad.
  const findProvider = useCallback(
    (address: string): VaultProvider | undefined => {
      return allProvidersWithLogos.find(
        (p) => p.id.toLowerCase() === address.toLowerCase(),
      );
    },
    [allProvidersWithLogos],
  );

  // Wrap refetch to return Promise<void>
  const wrappedRefetch = async () => {
    await refetch();
  };

  return {
    allVaultProviders: listableProviders,
    unhealthyVpIds: unhealthyVps,
    vaultKeepers: data?.vaultKeepers ?? EMPTY_VAULT_KEEPERS,
    loading: isLoading,
    error: error as Error | null,
    refetch: wrappedRefetch,
    findProvider,
  };
}
