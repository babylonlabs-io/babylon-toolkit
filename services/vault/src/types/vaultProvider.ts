/**
 * Provider domain types
 *
 * Represents vault providers, vault keepers, and universal challengers in the system.
 */

/**
 * Vault keeper information (per-application)
 */
export interface VaultKeeper {
  /** Vault keeper's Ethereum address */
  id: string;
  /** Vault keeper's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btcPubKey: string;
}

/**
 * Raw vault keeper item from GraphQL, includes version info.
 * Callers decide how to filter by version.
 */
export interface VaultKeeperItem {
  /** Vault keeper's Ethereum address */
  id: string;
  /** Vault keeper's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btcPubKey: string;
  /** Keeper application version */
  version: number;
}

/**
 * Universal challenger information (system-wide)
 */
export interface UniversalChallenger {
  /** Universal challenger's Ethereum address */
  id: string;
  /** Universal challenger's BTC public key (x-only, 32 bytes hex with 0x prefix) */
  btcPubKey: string;
}

/**
 * Static rpcUrl validation status from the indexer (mirrors the
 * pre-DNS rules in vault-provider-proxy). DNS-based checks still
 * happen at the proxy at request time.
 */
export type VaultProviderMetadataStatus =
  | "ok"
  | "missing"
  | "invalid_url"
  | "unsupported_scheme"
  | "private_host"
  | "ipv6_literal_unsupported";

/**
 * Vault provider information
 *
 * Note: Providers are immediately active upon registration (no pending state).
 */
export interface VaultProvider {
  /** Provider's Ethereum address */
  id: string;
  /** Provider's BTC public key (hex with 0x prefix) */
  btcPubKey: string;
  /** Provider's display name (from registry, optional) */
  name?: string;
  /** Provider's RPC URL (from registry) */
  url: string;
  /** Provider's icon URL (from icon service, optional) */
  iconUrl?: string;
  /** Whether the provider is verified (from registry, optional) */
  verified?: boolean;
  /** Static rpcUrl validation outcome from the indexer */
  metadataStatus: VaultProviderMetadataStatus;
  /** Human-readable reason when metadataStatus !== "ok" */
  metadataRejectionReason?: string;
}

/**
 * A vault provider as rendered in the deposit picker — the base registry
 * fields enriched with the runtime data shown in the list (health,
 * commission, total active BTC) and pre-computed sort/link metadata.
 *
 * Commission and totalActiveSats are `undefined` while their async source
 * (on-chain read / indexer query) is still loading or has failed; the
 * picker renders a placeholder in that case. These are display-only values
 * and never feed transaction construction.
 */
export interface VaultProviderListItem {
  /** Provider's Ethereum address */
  id: string;
  /** Formatted display name */
  name: string;
  /** Provider's BTC public key (hex), needed for downstream challenger math */
  btcPubkey: string;
  /** Provider's icon URL, if known */
  iconUrl?: string;
  /** True when the provider's registered rpcUrl was rejected by the indexer */
  unavailable: boolean;
  /** Tooltip explaining the metadata rejection, when `unavailable` is true */
  unavailableReason?: string;
  /** True when the VP is runtime-unhealthy per the `/vp-health` proxy */
  unhealthy: boolean;
  /** VP commission in basis points (on-chain). `undefined` while loading/unavailable. */
  commissionBps?: number;
  /** Total satoshis in active (status `available`) vaults via this VP. `undefined` while loading/unavailable. */
  totalActiveSats?: bigint;
  /** ms timestamp of this VP's most recently activated vault; `undefined` if none. */
  lastSuccessfulPeginAt?: number;
  /**
   * Babylon BTC Vault explorer URL for the VP's provider page. `undefined`
   * when `NEXT_PUBLIC_TBV_VP_EXPLORER_URL` is unset — the picker omits the
   * link in that case rather than rendering a broken one.
   */
  explorerUrl?: string;
}

/**
 * Response from fetchAppProviders containing per-application data only.
 * Includes pre-computed latest-version keepers for the common case,
 * plus raw items with version info for callers that need historical data.
 */
export interface AppProvidersResponse {
  /** Vault providers for the application */
  vaultProviders: VaultProvider[];
  /** Vault keepers filtered to the latest version (most common use case) */
  vaultKeepers: VaultKeeper[];
  /** Raw vault keeper items with version info, if needed */
  vaultKeeperItems?: VaultKeeperItem[];
}
