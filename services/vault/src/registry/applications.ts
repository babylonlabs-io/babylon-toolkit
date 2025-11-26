/**
 * Application Metadata Registry
 *
 * Static registry of application metadata keyed by controller address (lowercase).
 * This supplements GraphQL data with additional details not yet available from the API.
 */

import { CONTRACTS } from "../config/contracts";

export interface ApplicationMetadata {
  name: string;
  type: "Lending" | "Staking" | "DEX";
  description: string;
  logoUrl: string;
  websiteUrl: string;
}

/**
 * Registry of known applications, keyed by lowercase controller address
 */
export const APPLICATION_REGISTRY: Record<string, ApplicationMetadata> = {
  [CONTRACTS.MORPHO_CONTROLLER.toLowerCase()]: {
    name: "Morpho",
    type: "Lending",
    description:
      "Morpho is a lending protocol that optimizes interest rates by matching lenders and borrowers peer-to-peer while maintaining the liquidity of underlying pools.",
    logoUrl:
      "https://assets.coingecko.com/coins/images/31915/standard/morpho.png",
    websiteUrl: "https://morpho.org",
  },
};

/**
 * Get application metadata by controller address
 */
export function getApplicationMetadata(
  controllerAddress: string,
): ApplicationMetadata | undefined {
  return APPLICATION_REGISTRY[controllerAddress.toLowerCase()];
}
