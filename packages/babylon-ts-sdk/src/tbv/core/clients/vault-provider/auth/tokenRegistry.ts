/**
 * In-memory registry of {@link VpTokenProvider} instances keyed by
 * the per-vault depositor-signed PegIn tx hash. Module-level
 * singleton, per-tab, never persisted.
 *
 * @module tbv/core/clients/vault-provider/auth/tokenRegistry
 */

import type { OnChainBtcPubkey } from "../../eth/types";
import type { JsonRpcClient } from "../json-rpc-client";

import { AUTH_GATED_METHODS } from "./gatedMethods";
import { VpTokenProvider } from "./tokenProvider";

export interface VpTokenRegistryInput {
  client: JsonRpcClient;
  peginTxid: string;
  authAnchorHex: string;
  pinnedServerPubkey: OnChainBtcPubkey;
}

interface RegistryEntry {
  provider: VpTokenProvider;
  authAnchorHex: string;
  pinnedServerPubkey: OnChainBtcPubkey;
}

export class VpTokenRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /**
   * Return the cached `VpTokenProvider` for `peginTxid` if one exists
   * with matching `authAnchorHex` and `pinnedServerPubkey`, otherwise
   * construct and cache a fresh provider. A mismatch on either field
   * throws — silent overwrite would mask derivation drift or VP
   * pubkey rotation.
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
      // Refresh the inner transport on every reuse so a VP URL
      // change between calls doesn't leave the cached provider
      // pinned to a dead URL for token refresh.
      existing.provider.setClient(input.client);
      return existing.provider;
    }

    const provider = new VpTokenProvider({
      client: input.client,
      peginTxid: input.peginTxid,
      authAnchorHex: input.authAnchorHex,
      pinnedServerPubkey: input.pinnedServerPubkey,
      authGatedMethods: AUTH_GATED_METHODS,
    });
    this.entries.set(input.peginTxid, {
      provider,
      authAnchorHex: input.authAnchorHex,
      pinnedServerPubkey: input.pinnedServerPubkey,
    });
    return provider;
  }

  /** Return the cached provider, or `undefined` if none. */
  peek(peginTxid: string): VpTokenProvider | undefined {
    return this.entries.get(peginTxid)?.provider;
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
  peek(peginTxid: string): VpTokenProvider | undefined;
  release(peginTxid: string): void;
  readonly size: number;
}

export const vpTokenRegistry: VpTokenRegistryPublic = new VpTokenRegistry();
