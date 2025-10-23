import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";
import { Bsn } from "@/ui/common/types/bsn";
import {
  FinalityProviderState as FinalityProviderStateEnum,
  type FinalityProvider,
} from "@/ui/common/types/finalityProviders";

const { chainId: BBN_CHAIN_ID } = getNetworkConfigBBN();

/**
 * Normalizes hex string by removing 0x prefix and converting to lowercase
 */
export const normalizeHex = (hex?: string): string =>
  (hex ?? "").trim().toLowerCase().replace(/^0x/, "");

const BSN_CONFIG = {
  [BBN_CHAIN_ID]: {
    filters: {
      active: (fp: FinalityProvider) =>
        fp.state === FinalityProviderStateEnum.ACTIVE,
      inactive: (fp: FinalityProvider) =>
        fp.state === FinalityProviderStateEnum.INACTIVE,
      jailed: (fp: FinalityProvider) =>
        fp.state === FinalityProviderStateEnum.JAILED,
      slashed: (fp: FinalityProvider) =>
        fp.state === FinalityProviderStateEnum.SLASHED,
    },
    priorities: ["active", "inactive", "slashed", "jailed"] as const,
    fallback: "active" as const,
  },
  COSMOS: {
    filters: {
      registered: (fp: FinalityProvider) =>
        fp.state === FinalityProviderStateEnum.INACTIVE,
      slashed: (fp: FinalityProvider) =>
        fp.state === FinalityProviderStateEnum.SLASHED,
    },
    priorities: ["registered", "slashed"] as const,
    fallback: "registered" as const,
  },
  ROLLUP: {
    createFilters: (allowlist: string[] = []) => {
      const allowSet = new Set(allowlist.map(normalizeHex));
      const hasAllowlist = allowlist.length > 0;

      return {
        allowlisted: (fp: FinalityProvider) =>
          hasAllowlist ? allowSet.has(normalizeHex(fp.btcPk)) : false,
        "non-allowlisted": (fp: FinalityProvider) => {
          if (!hasAllowlist) {
            return (
              fp.state === FinalityProviderStateEnum.ACTIVE ||
              fp.state === FinalityProviderStateEnum.INACTIVE
            );
          }
          return !allowSet.has(normalizeHex(fp.btcPk));
        },
        slashed: (fp: FinalityProvider) =>
          fp.state === FinalityProviderStateEnum.SLASHED,
        jailed: (fp: FinalityProvider) =>
          fp.state === FinalityProviderStateEnum.JAILED,
      };
    },
    priorities: [
      "allowlisted",
      "non-allowlisted",
      "slashed",
      "jailed",
    ] as const,
    fallback: "non-allowlisted" as const, // Default to non-allowlisted
  },
} as const;

type BsnConfigKey = keyof typeof BSN_CONFIG;

const getBsnConfigKey = (bsn?: Bsn): BsnConfigKey => {
  if (!bsn || bsn.id === BBN_CHAIN_ID) return BBN_CHAIN_ID;

  // Map BSN types to configuration keys
  switch (bsn.type) {
    case "COSMOS":
      return "COSMOS";
    case "ROLLUP":
      return "ROLLUP";
    default:
      return BBN_CHAIN_ID;
  }
};

/**
 * Gets the BSN configuration for filtering operations
 * Falls back to BBN_CHAIN_ID config if the BSN type is not supported
 */
const getBsnConfig = (bsn?: Bsn) => {
  const key = getBsnConfigKey(bsn);
  return BSN_CONFIG[key] || BSN_CONFIG[BBN_CHAIN_ID];
};

/**
 * Creates filters for a BSN
 */
const createBsnFilters = (bsn?: Bsn) => {
  const config = getBsnConfig(bsn);

  if ("createFilters" in config && typeof config.createFilters === "function") {
    // ROLLUP type with dynamic filters based on allowlist
    return config.createFilters(bsn?.allowlist ?? []);
  }

  // Static filters for BABYLON/COSMOS
  return config.filters;
};

export interface FinalityProviderFilterState {
  searchTerm: string;
  providerStatus:
    | "active"
    | "inactive"
    | "registered"
    | "allowlisted"
    | "non-allowlisted"
    | "slashed"
    | "jailed"
    | "";
  allowlistStatus: "allowlisted" | "non-allowlisted" | "";
}

/**
 * Main filtering function with unified configuration
 */
export const filterFinalityProvidersByBsn = (
  providers: FinalityProvider[],
  filter: FinalityProviderFilterState,
  selectedBsn: Bsn | undefined,
): FinalityProvider[] => {
  let filtered = providers;

  // Apply status filtering using unified configuration
  if (filter.providerStatus) {
    const bsnFilters = createBsnFilters(selectedBsn);
    const statusFilter =
      bsnFilters[filter.providerStatus as keyof typeof bsnFilters];

    if (statusFilter) {
      filtered = filtered.filter(statusFilter);
    }
  }

  // Apply allowlist filtering
  if (filter.allowlistStatus && selectedBsn?.type === "ROLLUP") {
    const bsnFilters = createBsnFilters(selectedBsn);
    const allowlistFilter =
      bsnFilters[filter.allowlistStatus as keyof typeof bsnFilters];

    if (allowlistFilter) {
      filtered = filtered.filter(allowlistFilter);
    }
  }

  return filtered;
};

/**
 * Determines if a finality provider row should be selectable based on status
 * Only jailed and slashed providers are disabled from selection
 */
export const isFinalityProviderRowSelectable = (
  row: FinalityProvider,
): boolean => {
  // Only disable selection for jailed and slashed providers
  return (
    row.state === FinalityProviderStateEnum.ACTIVE ||
    row.state === FinalityProviderStateEnum.INACTIVE
  );
};

/**
 * Finds the filter status based on provider availability using unified configuration
 */
export const getAvailableProviderStatus = (
  providers: FinalityProvider[],
  selectedBsn: Bsn | undefined,
): FinalityProviderFilterState["providerStatus"] => {
  if (!providers?.length) {
    return getDefaultProviderStatus(selectedBsn);
  }

  const config = getBsnConfig(selectedBsn);
  const bsnFilters = createBsnFilters(selectedBsn);

  for (const status of config.priorities) {
    const filterFn = bsnFilters[status as keyof typeof bsnFilters];
    if (filterFn && providers.some(filterFn)) {
      return status;
    }
  }

  return config.fallback;
};

/**
 * Gets default provider status based on BSN type using unified configuration
 */
export const getDefaultProviderStatus = (
  bsn?: Bsn,
): FinalityProviderFilterState["providerStatus"] => {
  const config = getBsnConfig(bsn);

  // For ROLLUP BSNs, check if allowlist exists to determine default
  if (bsn?.type === "ROLLUP") {
    return (bsn.allowlist?.length ?? 0) > 0 ? "allowlisted" : "non-allowlisted";
  }

  return config.fallback;
};
