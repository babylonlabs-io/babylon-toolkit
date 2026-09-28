/**
 * In-memory registry of {@link VpTokenProvider} instances keyed by
 * the per-vault depositor-signed PegIn tx hash. Module-level
 * singleton, per-tab, never persisted.
 *
 * @module tbv/core/clients/vault-provider/auth/tokenRegistry
 */

import type { OnChainBtcPubkey } from "../../eth/types";
import type { JsonRpcClient } from "../json-rpc-client";

import { AUTH_GATED_METHODS, GRPC_AUTH_GATED_METHODS } from "./gatedMethods";
import { VpTokenProvider } from "./tokenProvider";

export interface VpTokenRegistryInput {
  client: JsonRpcClient;
  peginTxid: string;
  authAnchorHex: string;
  /** Stable provider identity used to prevent cross-provider cache reuse. */
  providerAddress: string;
  pinnedServerPubkey: OnChainBtcPubkey;
  /** Frozen-epoch issuer used only by the gRPC token subject. */
  grpcPinnedServerPubkey: OnChainBtcPubkey;
  /** Frozen VP epoch that selected `grpcPinnedServerPubkey`. */
  grpcKeyEpoch: bigint;
  /** Authoritative live-key resolver for bounded JSON-RPC pin recovery. */
  refreshJsonRpcPinnedServerPubkey?: () => Promise<OnChainBtcPubkey>;
  /** Depositor x-only pubkey (32-byte hex), asserted against each token's CWT `aud`. */
  expectedAudienceXOnlyPubkey: string;
}

export interface VpTokenRegistryLookup {
  peginTxid: string;
  providerAddress: string;
  expectedAudienceXOnlyPubkey: string;
}

interface RegistryEntry {
  provider: VpTokenProvider;
  authAnchorHex: string;
  providerAddress: string;
  grpcKeyEpoch: bigint;
  expectedAudienceXOnlyPubkey: string;
}

export class VpTokenRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /**
   * Return the cached `VpTokenProvider` for `peginTxid` if one exists
   * with matching anchor, provider, audience, and subject-specific issuer
   * bindings, otherwise construct and cache a fresh provider. A mismatch
   * throws — silent overwrite would mask derivation drift or cross-provider
   * cache reuse. A legitimate live JSON-RPC key rotation is handled inside
   * `VpTokenProvider` through its chain-backed refresh callback.
   */
  getOrCreate(input: VpTokenRegistryInput): VpTokenProvider {
    const existing = this.entries.get(input.peginTxid);
    if (existing) {
      if (existing.authAnchorHex !== input.authAnchorHex) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to authAnchorHex ${existing.authAnchorHex.slice(0, 8)}…; got ${input.authAnchorHex.slice(0, 8)}…`,
        );
      }
      if (existing.providerAddress !== input.providerAddress) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to providerAddress ${existing.providerAddress ?? "<unset>"}; got ${input.providerAddress ?? "<unset>"}`,
        );
      }
      if (
        existing.provider.getPinnedServerPubkey("jsonrpc") !==
        input.pinnedServerPubkey
      ) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to JSON-RPC pinnedServerPubkey ${existing.provider.getPinnedServerPubkey("jsonrpc").slice(0, 8)}…; got ${input.pinnedServerPubkey.slice(0, 8)}…`,
        );
      }
      if (
        existing.provider.getPinnedServerPubkey("grpc") !==
        input.grpcPinnedServerPubkey
      ) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to gRPC pinnedServerPubkey ${existing.provider.getPinnedServerPubkey("grpc").slice(0, 8)}…; got ${input.grpcPinnedServerPubkey.slice(0, 8)}…`,
        );
      }
      if (existing.grpcKeyEpoch !== input.grpcKeyEpoch) {
        throw new Error(
          `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to gRPC key epoch ${existing.grpcKeyEpoch.toString()}; got ${input.grpcKeyEpoch.toString()}`,
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
      // pinned to a dead URL for token refresh.
      existing.provider.setClient(input.client);
      return existing.provider;
    }

    const provider = new VpTokenProvider({
      client: input.client,
      peginTxid: input.peginTxid,
      authAnchorHex: input.authAnchorHex,
      pinnedServerPubkey: input.pinnedServerPubkey,
      grpcPinnedServerPubkey: input.grpcPinnedServerPubkey,
      refreshJsonRpcPinnedServerPubkey: input.refreshJsonRpcPinnedServerPubkey,
      expectedAudienceXOnlyPubkey: input.expectedAudienceXOnlyPubkey,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: GRPC_AUTH_GATED_METHODS,
    });
    this.entries.set(input.peginTxid, {
      provider,
      authAnchorHex: input.authAnchorHex,
      providerAddress: input.providerAddress,
      grpcKeyEpoch: input.grpcKeyEpoch,
      expectedAudienceXOnlyPubkey: input.expectedAudienceXOnlyPubkey,
    });
    return provider;
  }

  /**
   * Return the cached provider only when its request-facing identity matches.
   * A missing entry is a normal cold-cache result; a binding mismatch throws
   * so callers cannot attach one provider's bearer to another provider or
   * depositor request.
   */
  peek(input: VpTokenRegistryLookup): VpTokenProvider | undefined {
    const existing = this.entries.get(input.peginTxid);
    if (!existing) return undefined;

    if (
      existing.providerAddress.toLowerCase() !==
      input.providerAddress.toLowerCase()
    ) {
      throw new Error(
        `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to providerAddress ${existing.providerAddress}; got ${input.providerAddress}`,
      );
    }
    if (
      existing.expectedAudienceXOnlyPubkey.toLowerCase() !==
      input.expectedAudienceXOnlyPubkey.toLowerCase()
    ) {
      throw new Error(
        `VpTokenRegistry: peginTxid ${input.peginTxid} already bound to expectedAudienceXOnlyPubkey ${existing.expectedAudienceXOnlyPubkey.slice(0, 8)}…; got ${input.expectedAudienceXOnlyPubkey.slice(0, 8)}…`,
      );
    }

    return existing.provider;
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
  peek(input: VpTokenRegistryLookup): VpTokenProvider | undefined;
  release(peginTxid: string): void;
  readonly size: number;
}

export const vpTokenRegistry: VpTokenRegistryPublic = new VpTokenRegistry();
