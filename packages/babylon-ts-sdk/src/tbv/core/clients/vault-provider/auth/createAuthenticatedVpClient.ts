/**
 * Build a {@link VaultProviderRpcClient} that auto-attaches CWT
 * bearer tokens on auth-gated methods. Caller pre-derives both the
 * `authAnchorHex` (from the wallet) and the `pinnedServerPubkey`
 * (from the on-chain registry) and hands them in — the SDK has no
 * notion of wallets here.
 *
 * @module tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient
 */

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
  /** On-chain VP pubkey, branded so it can only come from the registry reader. */
  pinnedServerPubkey: OnChainBtcPubkey;
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
    pinnedServerPubkey: config.pinnedServerPubkey,
  });

  return new VaultProviderRpcClient(config.baseUrl, {
    ...config.options,
    tokenProvider,
  });
}
