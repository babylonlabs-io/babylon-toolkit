import logger from "@/infrastructure/logger";
import { getNetworkConfigBBN } from "@/ui/common/config/network/bbn";

import { Bsn, BsnType } from "../types/bsn";
import { getBsnLogoUrl } from "../utils/bsnLogo";

const { chainId: BBN_CHAIN_ID } = getNetworkConfigBBN();

export interface BsnFilterOption {
  value: string;
  label: string;
}

export interface BsnConfig {
  modalTitle: string;
  filterOptions: BsnFilterOption[];
}

export const BSN_CONFIGS: Record<string, BsnConfig> = {
  // Babylon Genesis
  [BBN_CHAIN_ID]: {
    modalTitle: "Select Babylon Genesis Finality Provider",
    filterOptions: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "jailed", label: "Jailed" },
      { value: "slashed", label: "Slashed" },
    ],
  },
  COSMOS: {
    modalTitle: "Select Cosmos Finality Provider",
    filterOptions: [
      { value: "registered", label: "Registered" },
      { value: "slashed", label: "Slashed" },
    ],
  },
  // Roll-up BSN config
  ROLLUP: {
    modalTitle: "Select Roll Up Finality Provider",
    filterOptions: [
      { value: "allowlisted", label: "Allow Listed" },
      { value: "non-allowlisted", label: "Non-Allow Listed" },
      { value: "slashed", label: "Slashed" },
      { value: "jailed", label: "Jailed" },
    ],
  },
};

/**
 * Get BSN configuration based on BSN type
 */
export const getBsnConfig = (bsn?: Bsn): BsnConfig => {
  // If BSN is unknown, fall back to Babylon defaults
  if (!bsn) return BSN_CONFIGS[BBN_CHAIN_ID];

  const isBbnChain = bsn.id === BBN_CHAIN_ID;

  // Resolve base config to determine available filters
  const baseConfig = isBbnChain
    ? BSN_CONFIGS[BBN_CHAIN_ID]
    : (BSN_CONFIGS[bsn.type] ?? BSN_CONFIGS[BBN_CHAIN_ID]);

  if (!BSN_CONFIGS[bsn.type] && !isBbnChain) {
    logger.error(new Error(`BSN config not found for type: ${bsn.type}`), {
      tags: { service: "bsnService", function: "getBsnConfig" },
      data: {
        bsnType: bsn.type,
        bsnId: bsn.id,
        fallback: "Babylon Genesis config",
      },
    });
  }

  // Always make the title BSN-name specific
  return {
    ...baseConfig,
    modalTitle: `Select ${bsn.name} Finality Provider`,
  };
};

export const createBSN = (bsn: {
  id: string;
  name: string;
  description: string;
  active_tvl: number;
  type: BsnType;
  allowlist?: string[];
}): Bsn => ({
  id: bsn.id,
  name: bsn.name,
  description: bsn.description,
  activeTvl: bsn.active_tvl,
  logoUrl: getBsnLogoUrl(bsn.id),
  type: bsn.type,
  allowlist: bsn.allowlist,
});
