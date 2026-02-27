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
 * Contract function names for application interactions
 */
export interface ApplicationFunctionNames {
  /** Function to redeem vault back to depositor */
  redeem: string;
}

/**
 * Contract configuration for application interactions
 */
export interface ApplicationContractConfig {
  /** Contract ABI */
  abi: readonly unknown[];
  /** Function names for common operations */
  functionNames: ApplicationFunctionNames;
}

export interface ApplicationRegistration {
  metadata: ApplicationMetadata;
  /** Contract configuration for on-chain interactions */
  contracts: ApplicationContractConfig;
}
