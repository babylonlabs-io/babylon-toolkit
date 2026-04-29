/**
 * Build a {@link VaultProviderRpcClient} that lazily acquires CWT
 * bearer tokens for auth-gated methods. Wallet popup is deferred
 * until the first gated call.
 *
 * @module tbv/core/clients/vault-provider/auth/createAuthenticatedVpClient
 */

import type { BitcoinWallet } from "../../../../../shared/wallets";
import type { VaultRegistryReader } from "../../eth/types";
import {
  VaultProviderRpcClient,
  type VaultProviderRpcClientOptions,
} from "../api";
import { JsonRpcClient } from "../json-rpc-client";

import { LazyVpTokenProvider } from "./lazyTokenProvider";

const TOKEN_RPC_TIMEOUT_MS = 60_000;

export interface AuthenticatedVpClientConfig {
  /** Base URL of the VP RPC endpoint (already proxied if applicable). */
  baseUrl: string;
  /** ETH address of the vault provider — for the on-chain pubkey lookup. */
  vpAddress: `0x${string}`;
  /** Per-vault depositor-signed PegIn tx id (registry cache key). */
  peginTxid: string;
  /** Funded Pre-PegIn tx hex; parsed for funding outpoints on first gated call. */
  unsignedPrePeginTxHex: string;
  /** Depositor's x-only BTC pubkey (with or without `0x`). */
  depositorBtcPubkey: string;
  /** Wallet supplying `deriveContextHash` (popup-on-demand). */
  btcWallet: BitcoinWallet;
  /** On-chain registry reader. */
  vaultRegistryReader: VaultRegistryReader;
  /** Optional client tunables (timeout, retries, etc.). */
  options?: VaultProviderRpcClientOptions;
}

/**
 * Build a VP RPC client that automatically attaches a CWT bearer
 * token to auth-gated method calls. The wallet popup for deriving
 * the auth anchor is deferred until the first gated call actually
 * fires — pure status-polling consumers never trigger it. Callers
 * supply only the wallet + Pre-PegIn tx hex; the SDK handles
 * derivation, on-chain pubkey lookup, and token caching.
 */
export function createAuthenticatedVpClient(
  config: AuthenticatedVpClientConfig,
): VaultProviderRpcClient {
  // Inner client must NOT carry a tokenProvider: `auth_createDepositorToken`
  // would otherwise recurse into the header builder.
  const innerTokenClient = new JsonRpcClient({
    baseUrl: config.baseUrl,
    timeout: config.options?.timeout ?? TOKEN_RPC_TIMEOUT_MS,
    headers: config.options?.headers,
    retries: config.options?.retries,
    retryDelay: config.options?.retryDelay,
    retryableFor: config.options?.retryableFor,
  });

  const tokenProvider = new LazyVpTokenProvider({
    client: innerTokenClient,
    peginTxid: config.peginTxid,
    unsignedPrePeginTxHex: config.unsignedPrePeginTxHex,
    depositorBtcPubkey: config.depositorBtcPubkey,
    btcWallet: config.btcWallet,
    vaultRegistryReader: config.vaultRegistryReader,
    vpAddress: config.vpAddress,
  });

  return new VaultProviderRpcClient(config.baseUrl, {
    ...config.options,
    tokenProvider,
  });
}
