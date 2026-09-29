/**
 * Build a {@link VaultProviderRpcClient} that auto-attaches CWT
 * bearer tokens on auth-gated methods. Caller pre-derives both the
 * `authAnchorHex` (from the wallet) and the `pinnedServerPubkey`
 * (from the on-chain registry) and hands them in — the SDK has no
 * notion of wallets here.
 *
 * @module tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient
 */

import { processPublicKeyToXOnly } from "../../../primitives/utils/bitcoin";
import type { OnChainBtcPubkey } from "../../eth/types";
import {
  VaultProviderRpcClient,
  type VaultProviderRpcClientOptions,
} from "../api";

import { buildInnerTokenClient } from "./innerTokenClient";
import { vpTokenRegistry } from "./tokenRegistry";

export interface AuthenticatedVpClientConfig {
  /** Base URL of the VP RPC endpoint (already proxied if applicable). */
  baseUrl: string;
  /** Per-vault depositor-signed PegIn tx id (registry cache key). */
  peginTxid: string;
  /** Already-derived 32-byte auth-anchor preimage (64-char hex, no `0x`). */
  authAnchorHex: string;
  /** Stable vault-provider address used to scope the registry entry. */
  providerAddress: string;
  /** On-chain VP pubkey, branded so it can only come from the registry reader. */
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
  /** Optional outer-client tunables (timeout, retries, headers, etc.). */
  options?: VaultProviderRpcClientOptions;
}

export function createAuthenticatedVpClient(
  config: AuthenticatedVpClientConfig,
): VaultProviderRpcClient {
  const innerTokenClient = buildInnerTokenClient(
    config.baseUrl,
    config.options?.headers,
  );

  const tokenProvider = vpTokenRegistry.getOrCreate({
    client: innerTokenClient,
    peginTxid: config.peginTxid,
    authAnchorHex: config.authAnchorHex,
    providerAddress: config.providerAddress,
    pinnedServerPubkey: config.pinnedServerPubkey,
    grpcPinnedServerPubkey: config.grpcPinnedServerPubkey,
    grpcKeyEpoch: config.grpcKeyEpoch,
    refreshJsonRpcPinnedServerPubkey: config.refreshJsonRpcPinnedServerPubkey,
    expectedAudienceXOnlyPubkey: processPublicKeyToXOnly(
      config.depositorBtcPubkey,
    ),
  });

  return new VaultProviderRpcClient(config.baseUrl, {
    ...config.options,
    tokenProvider,
  });
}
