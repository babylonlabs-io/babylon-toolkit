import { Network } from "@/core/types";

/**
 * Maps a wallet {@link Network} to the canonical Bitcoin network name
 * required by the `deriveContextHash` specification (`docs/specs/
 * derive-context-hash.md` §2.2). The wallet injects
 * `SHA-256(UTF8(canonicalNetworkName))` into the HKDF `info`, so these
 * strings are part of the on-chain-binding derivation and must match the
 * spec table exactly.
 */
const CANONICAL_NETWORK_NAME: Record<Network, string> = {
  [Network.MAINNET]: "bitcoin-mainnet",
  [Network.TESTNET]: "bitcoin-testnet",
  [Network.SIGNET]: "bitcoin-signet",
};

export const canonicalNetworkName = (network: Network): string => CANONICAL_NETWORK_NAME[network];
