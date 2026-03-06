/**
 * Verified Vault Provider Registry
 *
 * Trusted vault provider entries whose RPC URLs, names, and icons are overridden
 * in the indexer database. This provides a security boundary: the frontend uses
 * the trusted URL from here instead of the on-chain URL which could be arbitrary.
 *
 * To add or remove a verified provider:
 * 1. Add/remove the entry in VERIFIED_PROVIDERS below
 * 2. Reindex from scratch (`pnpm dev:clean`) to apply changes
 *
 * Changes to this file require a full reindex because enrichment happens
 * at provider-registration time (VaultProviderRegistered event).
 */

export interface VerifiedProviderEntry {
  /** Ethereum address (lowercase, 0x-prefixed) */
  address: string;
  /** Trusted display name */
  name: string;
  /** Trusted RPC URL — used by the frontend instead of on-chain URL */
  rpcUrl: string;
  /** Optional trusted icon URL */
  iconUrl?: string;
}

const VERIFIED_PROVIDERS: VerifiedProviderEntry[] = [
  {
    address: "0x7c310c9e42b2e1e4b5dee2e702f83d5667f2d3d3",
    name: "Babylon Labs",
    rpcUrl: "https://vault-provider.testnet.babylonlabs.io",
  },
];

/** Case-insensitive lookup map built once at startup */
const verifiedMap = new Map<string, VerifiedProviderEntry>(
  VERIFIED_PROVIDERS.map((entry) => [entry.address.toLowerCase(), entry]),
);

/**
 * Look up a verified provider by Ethereum address.
 * Returns undefined if the address is not in the registry.
 */
export function getVerifiedProvider(
  address: string,
): VerifiedProviderEntry | undefined {
  return verifiedMap.get(address.toLowerCase());
}
