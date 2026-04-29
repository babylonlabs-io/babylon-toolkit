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
  private readonly inFlight = new Map<string, Promise<VpTokenProvider>>();

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
          `VpTokenRegistry: peginTxid ${input.peginTxid} is already bound to a different authAnchorHex`,
        );
      }
      if (existing.pinnedServerPubkey !== input.pinnedServerPubkey) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} is already bound to a different pinnedServerPubkey`,
        );
      }
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
   * Return either the resolved provider or an in-flight derivation
   * promise. Lazy callers use this to share a single wallet popup
   * across concurrent first-call gated methods for the same vault.
   */
  peekOrPending(
    peginTxid: string,
  ): VpTokenProvider | Promise<VpTokenProvider> | undefined {
    const resolved = this.entries.get(peginTxid)?.provider;
    if (resolved) return resolved;
    return this.inFlight.get(peginTxid);
  }

  /**
   * Track an in-flight derivation so concurrent `peekOrPending` callers
   * await the same promise. First registration wins; the slot
   * auto-clears when the promise settles.
   */
  registerInFlight(
    peginTxid: string,
    promise: Promise<VpTokenProvider>,
  ): void {
    if (this.inFlight.has(peginTxid)) return;
    this.inFlight.set(peginTxid, promise);
    // Swallow the rejection on this internal chain — the producing
    // caller has its own consumer that propagates the error. Without
    // the explicit `.catch`, a `void promise.finally(...)` chain
    // would surface as an unhandled rejection if no other consumer
    // is attached at the moment the promise rejects.
    promise
      .finally(() => {
        if (this.inFlight.get(peginTxid) === promise) {
          this.inFlight.delete(peginTxid);
        }
      })
      .catch(() => {});
  }

  /**
   * Evict the entry for `peginTxid`. Idempotent. Vault flows call this
   * after activation so `authAnchorHex` doesn't outlive the session.
   */
  release(peginTxid: string): void {
    this.entries.delete(peginTxid);
  }

  /** Test-only. */
  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const vpTokenRegistry = new VpTokenRegistry();
