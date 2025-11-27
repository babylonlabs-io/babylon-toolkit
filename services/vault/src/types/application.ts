/**
 * Application with enriched metadata from local registry
 * Used by UI components to display application information
 */
export interface Application {
  /** Application controller address */
  id: string;
  /** Application name */
  name: string;
  /** Registration timestamp */
  registeredAt: string;
  /** Block number when registered */
  blockNumber: string;
  /** Transaction hash when registered */
  transactionHash: string;
  /** Application type (e.g., "Lending", "DEX") */
  type: "Lending" | "Staking" | "DEX";
  /** Application description */
  description: string | null;
  /** Logo URL */
  logoUrl: string | null;
  /** Website URL */
  websiteUrl: string | null;
}
