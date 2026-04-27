import { beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcClient } from "../../json-rpc-client";
import { ServerIdentityError } from "../serverIdentity";
import {
  type CreateDepositorTokenResponse,
  VpTokenProvider,
} from "../tokenProvider";

import {
  GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
  GOLDEN_EXPIRES_AT,
  GOLDEN_SIGNATURE_HEX,
  GOLDEN_SIGNING_KEY_XONLY,
} from "./goldenVectors";

const PEGIN_TXID = "a".repeat(64);
const AUTH_ANCHOR = "b".repeat(64);
// Must be a real curve point so BIP-322 verify inside verifyServerIdentity
// can succeed on the happy-path tests below.
const PINNED_PUBKEY = GOLDEN_SIGNING_KEY_XONLY;
const TEST_BASE_URL = "https://vp.example.com/rpc";
// NOW is the pinned wall-clock the tests inject. Chosen relative to the
// golden proof's expires_at so the proof is still valid.
const NOW = GOLDEN_EXPIRES_AT - 3600;

const AUTH_GATED_METHODS = new Set(["vaultProvider_submitDepositorWotsKey"]);

function buildResponse(
  overrides: Partial<CreateDepositorTokenResponse> = {},
): CreateDepositorTokenResponse {
  return {
    token: "test-token",
    expires_at: NOW + 300,
    server_identity: {
      server_pubkey: PINNED_PUBKEY,
      ephemeral_pubkey: GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
      expires_at: GOLDEN_EXPIRES_AT,
      signature: GOLDEN_SIGNATURE_HEX,
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

  it("returns null for the token-issuing method even if misconfigured into authGatedMethods", async () => {
    // Caller misconfiguration: `auth_createDepositorToken` accidentally
    // included in the auth-gated set. Without the hard exemption,
    // `getToken("auth_createDepositorToken")` would re-enter
    // `acquireSingleFlight` from inside the JsonRpcClient header
    // builder before `inFlight` is assigned — defeating the
    // single-flight guard and recursing until the stack overflows.
    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      authGatedMethods: new Set([
        "vaultProvider_submitDepositorWotsKey",
        "auth_createDepositorToken",
      ]),
      now: () => NOW,
    });

    const token = await provider.getToken("auth_createDepositorToken");
    expect(token).toBeNull();
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

  // Regression: a rejected in-flight acquire must not leave `cached`
  // pointing at a stale value AND must not prevent the next getToken
  // call from successfully re-acquiring. The invalidate() call during
  // the in-flight failure is a realistic race (e.g. JsonRpcClient
  // invalidates on a concurrent 401 from another auth-gated call).
  it("recovers cleanly after an in-flight acquire rejects mid-invalidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // First acquire: server returns malformed server_identity that
        // trips verifyServerIdentity.
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: buildResponse({
                server_identity: {
                  server_pubkey: "f".repeat(64), // mismatch → ServerIdentityError
                  ephemeral_pubkey: "02" + "d".repeat(64),
                  expires_at: NOW + 3600,
                  signature: "e".repeat(128),
                },
              }),
              id: 1,
            }),
        } as unknown as Response)
        // Second acquire: server returns a valid response.
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: buildResponse({ token: "recovery-token" }),
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

    // First acquire rejects — cached stays null.
    await expect(
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
    ).rejects.toBeInstanceOf(ServerIdentityError);

    // Simulate a concurrent invalidate — should be a no-op since the
    // failed acquire never populated cached, but must not throw or
    // corrupt state.
    provider.invalidate();

    // Next call must successfully acquire a fresh token.
    const recovered = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(recovered).toBe("recovery-token");
  });
});
