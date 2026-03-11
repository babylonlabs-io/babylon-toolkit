/**
 * Verified Vault Provider Registry
 *
 * A client-side registry of trusted vault providers. The frontend uses this
 * to determine provider verification status and to override on-chain metadata
 * (name, RPC URL, icon) with trusted values.
 *
 * To add or remove a verified provider, update verified-providers.json.
 * See the package README.md for contribution guidelines.
 */

import providers from "./verified-providers.json";

export interface VerifiedProviderEntry {
  /** Ethereum address (lowercase, 0x-prefixed) */
  address: string;
  /** Trusted display name */
  name: string;
  /** Trusted RPC URL */
  rpcUrl: string;
  /** Optional trusted icon URL */
  iconUrl?: string;
}

const VERIFIED_PROVIDERS: VerifiedProviderEntry[] = providers;

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
