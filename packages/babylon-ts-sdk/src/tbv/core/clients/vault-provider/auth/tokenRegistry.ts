/**
 * In-memory registry of {@link VpTokenProvider} instances keyed by
 * the per-vault depositor-signed PegIn tx hash. Module-level
 * singleton, per-tab, never persisted.
 *
 * @module tbv/core/clients/vault-provider/auth/tokenRegistry
 */

import type { OnChainBtcPubkey } from "../../eth/types";
import { type JsonRpcClient, normalizeBaseUrl } from "../json-rpc-client";

import { AUTH_GATED_METHODS, GRPC_AUTH_GATED_METHODS } from "./gatedMethods";
import { VpTokenProvider } from "./tokenProvider";

export interface VpTokenRegistryInput {
  client: JsonRpcClient;
  peginTxid: string;
  authAnchorHex: string;
  pinnedServerPubkey: OnChainBtcPubkey;
  /** Depositor x-only pubkey (32-byte hex), asserted against each token's CWT `aud`. */
  expectedAudienceXOnlyPubkey: string;
}

interface RegistryEntry {
  provider: VpTokenProvider;
  /**
   * Base URL of the VP whose pinned pubkey the entry was last checked
   * against. {@link VpTokenRegistry.peek} hands out the provider only for
   * this URL, so a cached bearer never reaches a VP the pin was not
   * checked for.
   */
  baseUrl: string;
  authAnchorHex: string;
  pinnedServerPubkey: OnChainBtcPubkey;
  expectedAudienceXOnlyPubkey: string;
}

export class VpTokenRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /**
   * Return the cached `VpTokenProvider` for `peginTxid` if one exists
   * with matching `authAnchorHex` and `pinnedServerPubkey`, otherwise
   * construct and cache a fresh provider. A mismatch on either throws —
   * silent overwrite would mask derivation drift or VP pubkey rotation.
   */
  getOrCreate(input: VpTokenRegistryInput): VpTokenProvider {
    const existing = this.entries.get(input.peginTxid);
    if (existing) {
      if (existing.authAnchorHex !== input.authAnchorHex) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to authAnchorHex ${existing.authAnchorHex.slice(0, 8)}…; got ${input.authAnchorHex.slice(0, 8)}…`,
        );
      }
      if (existing.pinnedServerPubkey !== input.pinnedServerPubkey) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to pinnedServerPubkey ${existing.pinnedServerPubkey.slice(0, 8)}…; got ${input.pinnedServerPubkey.slice(0, 8)}…`,
        );
      }
      if (
        existing.expectedAudienceXOnlyPubkey !==
        input.expectedAudienceXOnlyPubkey
      ) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to expectedAudienceXOnlyPubkey ${existing.expectedAudienceXOnlyPubkey.slice(0, 8)}…; got ${input.expectedAudienceXOnlyPubkey.slice(0, 8)}…`,
        );
      }
      // Refresh the inner transport on every reuse so a VP URL
      // change between calls doesn't leave the cached provider
      // pinned to a dead URL for token refresh. peek() then binds to
      // the new URL. That is safe only if the caller resolved the
      // pinned pubkey for the VP behind the new URL, as it matched above.
      existing.provider.setClient(input.client);
      existing.baseUrl = input.client.getBaseUrl();
      return existing.provider;
    }

    const provider = new VpTokenProvider({
      client: input.client,
      peginTxid: input.peginTxid,
      authAnchorHex: input.authAnchorHex,
      pinnedServerPubkey: input.pinnedServerPubkey,
      expectedAudienceXOnlyPubkey: input.expectedAudienceXOnlyPubkey,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: GRPC_AUTH_GATED_METHODS,
    });
    this.entries.set(input.peginTxid, {
      provider,
      baseUrl: input.client.getBaseUrl(),
      authAnchorHex: input.authAnchorHex,
      pinnedServerPubkey: input.pinnedServerPubkey,
      expectedAudienceXOnlyPubkey: input.expectedAudienceXOnlyPubkey,
    });
    return provider;
  }

  /**
   * Return the cached provider for `peginTxid` if its entry is bound to
   * `baseUrl`, otherwise `undefined`. The cache key names the deposit, not
   * the VP, so a caller whose VP URL differs gets a miss and must go
   * through {@link getOrCreate}, which checks the pinned pubkey.
   *
   * @param baseUrl - VP base URL the caller will attach the bearer to.
   *                  Compared with the inner token client's URL after the
   *                  same trailing-slash normalization.
   */
  peek(peginTxid: string, baseUrl: string): VpTokenProvider | undefined {
    const entry = this.entries.get(peginTxid);
    if (!entry || entry.baseUrl !== normalizeBaseUrl(baseUrl)) return undefined;
    return entry.provider;
  }

  /**
   * Evict the entry for `peginTxid`. Idempotent. Called on terminal
   * paths — activation success, user-cancel, or component unmount —
   * so `authAnchorHex` doesn't outlive the deposit session.
   */
  release(peginTxid: string): void {
    this.entries.delete(peginTxid);
  }

  /**
   * Wipe every cached entry. Test-only escape hatch — not exposed on
   * the public {@link VpTokenRegistryPublic} singleton type.
   *
   * @internal
   */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Public surface of the singleton — excludes the test-only `clear`
 * method.
 */
export interface VpTokenRegistryPublic {
  getOrCreate(input: VpTokenRegistryInput): VpTokenProvider;
  peek(peginTxid: string, baseUrl: string): VpTokenProvider | undefined;
  release(peginTxid: string): void;
  readonly size: number;
}

export const vpTokenRegistry: VpTokenRegistryPublic = new VpTokenRegistry();
