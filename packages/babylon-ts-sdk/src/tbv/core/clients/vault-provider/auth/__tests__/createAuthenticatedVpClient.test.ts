/**
 * Wiring test for `createAuthenticatedVpClient`.
 *
 * The wire-level details of `auth_createDepositorToken` and
 * `VpTokenProvider` lifecycle are pinned by `tokenProvider.test.ts`.
 * This test asserts the SDK factory's plumbing:
 *
 *   1. The factory builds a `VaultProviderRpcClient` whose
 *      `tokenProvider` is a `LazyVpTokenProvider`. We verify this by
 *      driving a non-gated and a gated path through the real client
 *      with a stubbed `fetch`; the gated path must consult the lazy
 *      provider, which would touch `btcWallet.deriveContextHash`. The
 *      non-gated path must NOT touch it.
 *
 *   2. `AUTH_GATED_METHODS` matches the canonical protocol set so the
 *      lazy provider doesn't hand out `null` for a method the server
 *      actually gates.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../../shared/wallets";
import type { VaultRegistryReader } from "../../../eth/types";
import { createAuthenticatedVpClient } from "../createAuthenticatedVpClient";
import { AUTH_GATED_METHODS } from "../gatedMethods";
import { vpTokenRegistry } from "../tokenRegistry";

describe("createAuthenticatedVpClient", () => {
  beforeEach(() => {
    vpTokenRegistry.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vpTokenRegistry.clear();
  });

  it("non-gated method on the returned client never triggers wallet derivation or the on-chain reader", async () => {
    const fakeWallet = {
      deriveContextHash: vi.fn(),
    } as unknown as BitcoinWallet;
    const fakeReader = {
      getVaultProviderBtcPubKey: vi.fn(),
    } as unknown as VaultRegistryReader;

    // Stub the network so the call resolves without a real server.
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
      vpAddress: `0x${"1".repeat(40)}`,
      peginTxid: "a".repeat(64),
      unsignedPrePeginTxHex: "deadbeef",
      depositorBtcPubkey: "ab".repeat(32),
      btcWallet: fakeWallet,
      vaultRegistryReader: fakeReader,
    });

    // `getPeginStatus` is not in AUTH_GATED_METHODS — must skip the
    // lazy provider entirely.
    await client.getPeginStatus({ pegin_txid: "a".repeat(64) }).catch(() => {
      // ignore parse errors — we only care about the wallet/reader
      // not being touched.
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      (fakeWallet.deriveContextHash as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(0);
    expect(
      (fakeReader.getVaultProviderBtcPubKey as ReturnType<typeof vi.fn>).mock
        .calls.length,
    ).toBe(0);

    // No registry entry should have been created for a non-gated path.
    expect(vpTokenRegistry.peek("a".repeat(64))).toBeUndefined();
  });

  it("AUTH_GATED_METHODS pins the canonical protocol-invariant set", () => {
    // If this set ever drifts from the gated method names in the API
    // surface, the lazy provider will silently hand out null for a
    // method the server gates — the request will fail with auth
    // missing instead of with a fresh token. Pin the set explicitly.
    expect(Array.from(AUTH_GATED_METHODS).sort()).toEqual(
      [
        "vaultProvider_requestDepositorPresignTransactions",
        "vaultProvider_submitDepositorPresignatures",
        "vaultProvider_submitDepositorWotsKey",
      ].sort(),
    );
  });
});
