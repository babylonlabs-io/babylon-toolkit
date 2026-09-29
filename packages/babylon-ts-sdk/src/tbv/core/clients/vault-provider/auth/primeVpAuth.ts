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
  /** Stable vault-provider address used to scope the registry entry. */
  providerAddress: string;
  pinnedServerPubkey: OnChainBtcPubkey;
  /** Frozen-epoch VP pubkey used by the gRPC-subject bootstrap. */
  grpcPinnedServerPubkey: OnChainBtcPubkey;
  /** Vault's frozen VP epoch, paired with `grpcPinnedServerPubkey`. */
  grpcKeyEpoch: bigint;
  /** Re-read the current operation key after a JSON-RPC identity mismatch. */
  refreshJsonRpcPinnedServerPubkey?: () => Promise<OnChainBtcPubkey>;
  /**
   * Depositor BTC pubkey (x-only or compressed hex). Normalized to
   * x-only and asserted against every issued token's CWT `aud` claim.
   */
  depositorBtcPubkey: string;
  /** Optional headers forwarded to the inner token client (e.g. gateway auth). */
  headers?: Record<string, string>;
}

export function primeVpTokenRegistry(input: PrimeVpAuthInput): void {
  vpTokenRegistry.getOrCreate({
    client: buildInnerTokenClient(input.baseUrl, input.headers),
    peginTxid: input.peginTxid,
    authAnchorHex: input.authAnchorHex,
    providerAddress: input.providerAddress,
    pinnedServerPubkey: input.pinnedServerPubkey,
    grpcPinnedServerPubkey: input.grpcPinnedServerPubkey,
    grpcKeyEpoch: input.grpcKeyEpoch,
    refreshJsonRpcPinnedServerPubkey: input.refreshJsonRpcPinnedServerPubkey,
    expectedAudienceXOnlyPubkey: processPublicKeyToXOnly(
      input.depositorBtcPubkey,
    ),
  });
}
