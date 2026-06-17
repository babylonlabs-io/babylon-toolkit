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
  /** On-chain VP pubkey, branded so it can only come from the registry reader. */
  pinnedServerPubkey: OnChainBtcPubkey;
  /**
   * Depositor BTC pubkey (x-only or compressed hex). Normalized to
   * x-only and asserted against every issued token's CWT `aud` claim.
   */
  depositorBtcPubkey: string;
  /**
   * Opt into gRPC-subject auth for the artifact stream. Defaults to
   * `false` (JSON-RPC bearer). Only enable against a proxy running with
   * `ENABLE_GRPC_ARTIFACTS`. Forwarded to {@link vpTokenRegistry}.
   */
  enableGrpcArtifactAuth?: boolean;
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
    expectedAudienceXOnlyPubkey: processPublicKeyToXOnly(
      config.depositorBtcPubkey,
    ),
    enableGrpcArtifactAuth: config.enableGrpcArtifactAuth,
  });

  return new VaultProviderRpcClient(config.baseUrl, {
    ...config.options,
    tokenProvider,
  });
}
