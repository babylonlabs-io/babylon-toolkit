/**
 * Pre-populate {@link vpTokenRegistry} when the caller already has
 * both the auth-anchor preimage and the on-chain VP pubkey. Seeds
 * the cache for a `peginTxid` so a later `createAuthenticatedVpClient`
 * call reuses the cached `VpTokenProvider` instead of rebuilding it.
 *
 * @module tbv/core/clients/vault-provider/auth/primeVpAuth
 */

import { processPublicKeyToXOnly } from "../../../primitives/utils/bitcoin";
import type { OnChainBtcPubkey } from "../../eth/types";

import { buildInnerTokenClient } from "./innerTokenClient";
import { vpTokenRegistry } from "./tokenRegistry";

export interface PrimeVpAuthInput {
  baseUrl: string;
  peginTxid: string;
  authAnchorHex: string;
  pinnedServerPubkey: OnChainBtcPubkey;
  /**
   * Depositor BTC pubkey (x-only or compressed hex). Normalized to
   * x-only and asserted against every issued token's CWT `aud` claim.
   */
  depositorBtcPubkey: string;
  /** Optional headers forwarded to the inner token client (e.g. gateway auth). */
  headers?: Record<string, string>;
  /**
   * Opt into gRPC-subject auth for the artifact stream. Defaults to
   * `false`. Must match the value passed to a later
   * `createAuthenticatedVpClient` for the same `peginTxid` —
   * `VpTokenRegistry.getOrCreate` throws on a mismatch rather than
   * serve the wrong-subject token from the primed provider.
   */
  enableGrpcArtifactAuth?: boolean;
}

export function primeVpTokenRegistry(input: PrimeVpAuthInput): void {
  vpTokenRegistry.getOrCreate({
    client: buildInnerTokenClient(input.baseUrl, input.headers),
    peginTxid: input.peginTxid,
    authAnchorHex: input.authAnchorHex,
    pinnedServerPubkey: input.pinnedServerPubkey,
    expectedAudienceXOnlyPubkey: processPublicKeyToXOnly(
      input.depositorBtcPubkey,
    ),
    enableGrpcArtifactAuth: input.enableGrpcArtifactAuth,
  });
}
