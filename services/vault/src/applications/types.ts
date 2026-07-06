import type { ComponentType } from "react";

export type ApplicationType = "Lending" | "Staking" | "DEX";

export interface ApplicationMetadata {
  id: string;
  name: string;
  type: ApplicationType;
  description: string;
  logoUrl: string;
  websiteUrl: string;
}

/**
 * Contract configuration for application interactions
 */
export interface ApplicationContractConfig {
  /** Contract ABI */
  abi: readonly unknown[];
}

export interface ApplicationRegistration {
  metadata: ApplicationMetadata;
  /**
   * Routes mounted under `app/<id>/*`. Optional: an app whose UI is rendered
   * elsewhere (e.g. Aave's reserve detail, hosted as an overlay by the router)
   * contributes only metadata/contracts and registers no standalone routes.
   */
  Routes?: ComponentType;
  /** Contract configuration for on-chain interactions */
  contracts: ApplicationContractConfig;
}
