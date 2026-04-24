import { beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcClient } from "../../json-rpc-client";
import { ServerIdentityError } from "../serverIdentity";
import {
  type CreateDepositorTokenResponse,
  VpTokenProvider,
} from "../tokenProvider";

const PEGIN_TXID = "a".repeat(64);
const AUTH_ANCHOR = "b".repeat(64);
const PINNED_PUBKEY = "c".repeat(64);
const TEST_BASE_URL = "https://vp.example.com/rpc";
const NOW = 1_700_000_000;

const AUTH_GATED_METHODS = new Set(["vaultProvider_submitDepositorWotsKey"]);

function buildResponse(
  overrides: Partial<CreateDepositorTokenResponse> = {},
): CreateDepositorTokenResponse {
  return {
    token: "test-token",
    expires_at: NOW + 300,
    server_identity: {
      server_pubkey: PINNED_PUBKEY,
      ephemeral_pubkey: "02" + "d".repeat(64),
      expires_at: NOW + 3600,
      signature: "e".repeat(128),
    },
    ...overrides,
  };
}

function createClient(): JsonRpcClient {
  return new JsonRpcClient({
    baseUrl: TEST_BASE_URL,
    timeout: 5000,
    retries: 0,
  });
}

function stubCallOnce(response: CreateDepositorTokenResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ jsonrpc: "2.0", result: response, id: 1 }),
    } as unknown as Response),
  );
}

describe("VpTokenProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for methods not in the auth-gated set", async () => {
    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: AUTH_GATED_METHODS,
      now: () => NOW,
    });

    const token = await provider.getToken("vaultProvider_getPeginStatus");
    expect(token).toBeNull();
  });

  it("acquires and caches a token on first call for auth-gated method", async () => {
    stubCallOnce(buildResponse());

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: AUTH_GATED_METHODS,
      now: () => NOW,
    });

    const first = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(first).toBe("test-token");

    // No fetch mock was queued for a second call — cache must serve this.
    const second = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(second).toBe("test-token");
    expect(
      (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(1);
  });

  it("re-acquires after invalidate()", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: buildResponse({ token: "token-1" }),
              id: 1,
            }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: buildResponse({ token: "token-2" }),
              id: 2,
            }),
        } as unknown as Response),
    );

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: AUTH_GATED_METHODS,
      now: () => NOW,
    });

    const first = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(first).toBe("token-1");

    provider.invalidate();

    const second = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(second).toBe("token-2");
  });

  it("refreshes when cached token is within refreshSkewSecs of expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: buildResponse({
                token: "token-1",
                expires_at: NOW + 40, // close to now
              }),
              id: 1,
            }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: buildResponse({ token: "token-2" }),
              id: 2,
            }),
        } as unknown as Response),
    );

    const client = createClient();
    let fakeNow = NOW;
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: AUTH_GATED_METHODS,
      refreshSkewSecs: 30,
      now: () => fakeNow,
    });

    const first = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(first).toBe("token-1");

    // Advance clock past (expires_at - skew) = NOW + 10
    fakeNow = NOW + 11;

    const second = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(second).toBe("token-2");
  });

  it("propagates server-identity errors from acquire", async () => {
    stubCallOnce(
      buildResponse({
        server_identity: {
          server_pubkey: "f".repeat(64), // mismatch
          ephemeral_pubkey: "02" + "d".repeat(64),
          expires_at: NOW + 3600,
          signature: "e".repeat(128),
        },
      }),
    );

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: AUTH_GATED_METHODS,
      now: () => NOW,
    });

    await expect(
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
    ).rejects.toBeInstanceOf(ServerIdentityError);
  });

  it("single-flights concurrent acquires", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () =>
        Promise.resolve({ jsonrpc: "2.0", result: buildResponse(), id: 1 }),
    } as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: AUTH_GATED_METHODS,
      now: () => NOW,
    });

    const [a, b, c] = await Promise.all([
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
    ]);

    expect(a).toBe("test-token");
    expect(b).toBe("test-token");
    expect(c).toBe("test-token");
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
