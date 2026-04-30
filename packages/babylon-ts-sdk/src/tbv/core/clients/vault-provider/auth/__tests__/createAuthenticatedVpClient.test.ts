/**
 * Wiring test for `createAuthenticatedVpClient`.
 *
 *   1. Constructs a `VaultProviderRpcClient` whose tokenProvider
 *      points at the registry-cached `VpTokenProvider` for the given
 *      `peginTxid`.
 *   2. `AUTH_GATED_METHODS` matches the canonical protocol set so the
 *      provider doesn't hand out null for a method the server gates.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OnChainBtcPubkey } from "../../../eth/types";
import { createAuthenticatedVpClient } from "../createAuthenticatedVpClient";
import { AUTH_GATED_METHODS } from "../gatedMethods";
import { VpTokenRegistry, vpTokenRegistry } from "../tokenRegistry";

const PEGIN_TXID = "a".repeat(64);
const AUTH_ANCHOR = "b".repeat(64);
const PINNED_PUBKEY =
  "ab".repeat(32) as unknown as OnChainBtcPubkey;

describe("createAuthenticatedVpClient", () => {
  beforeEach(() => {
    (vpTokenRegistry as VpTokenRegistry).clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (vpTokenRegistry as VpTokenRegistry).clear();
  });

  it("registers a tokenProvider in the registry and reuses it on subsequent calls", () => {
    createAuthenticatedVpClient({
      baseUrl: "https://vp.test/rpc",
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
    });
    const firstProvider = vpTokenRegistry.peek(PEGIN_TXID);
    expect(firstProvider).toBeDefined();

    createAuthenticatedVpClient({
      baseUrl: "https://vp.test/rpc",
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
    });
    expect(vpTokenRegistry.peek(PEGIN_TXID)).toBe(firstProvider);
  });

  it("non-gated methods skip the tokenProvider — no token request is made", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const client = createAuthenticatedVpClient({
      baseUrl: "https://vp.test/rpc",
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
    });

    await client.getPeginStatus({ pegin_txid: PEGIN_TXID }).catch(() => {
      // Validation error is fine; we only care that fetch ran exactly
      // once and no auth-create call was issued.
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("AUTH_GATED_METHODS pins the canonical protocol-invariant set", () => {
    expect(Array.from(AUTH_GATED_METHODS).sort()).toEqual(
      [
        "vaultProvider_requestDepositorPresignTransactions",
        "vaultProvider_submitDepositorPresignatures",
        "vaultProvider_submitDepositorWotsKey",
      ].sort(),
    );
  });
});
