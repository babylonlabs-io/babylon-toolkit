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
  /** Contract configuration for on-chain interactions */
  contracts: ApplicationContractConfig;
}
