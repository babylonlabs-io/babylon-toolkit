import { beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcClient } from "../../json-rpc-client";
import { ServerIdentityError } from "../serverIdentity";
import {
  type CreateDepositorTokenResponse,
  VpTokenProvider,
} from "../tokenProvider";

import {
  GOLDEN_CWT_AUDIENCE_XONLY,
  GOLDEN_CWT_EXP,
  GOLDEN_CWT_SHORT_EXP,
  GOLDEN_CWT_TOKEN_GRPC,
  GOLDEN_CWT_TOKEN_JSONRPC,
  GOLDEN_CWT_TOKEN_JSONRPC_SHORT,
  GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
  GOLDEN_EXPIRES_AT,
  GOLDEN_SIGNATURE_HEX,
  GOLDEN_SIGNING_KEY_XONLY,
} from "./goldenVectors";

const PEGIN_TXID = "a".repeat(64);
const AUTH_ANCHOR = "b".repeat(64);
// Must be a real curve point so BIP-322 verify inside verifyServerIdentity
// can succeed on the happy-path tests below.
// `OnChainBtcPubkey` is brand-only — production callers receive it
// from the on-chain reader. Tests mint it via cast at the boundary.
const PINNED_PUBKEY =
  GOLDEN_SIGNING_KEY_XONLY as unknown as import("../../../eth").OnChainBtcPubkey;
const TEST_BASE_URL = "https://vp.example.com/rpc";
// NOW is the pinned wall-clock the tests inject. Chosen relative to the
// golden proof's expires_at so the proof is still valid.
const NOW = GOLDEN_EXPIRES_AT - 3600;

const AUTH_GATED_METHODS = new Set(["vaultProvider_submitDepositorWotsKey"]);
const GRPC_GATED_METHODS = new Set([
  "vaultProvider_requestDepositorClaimerArtifacts",
]);

function createJsonRpcSuccessResponse(result: unknown, id: number = 1) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", result, id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildResponse(
  overrides: Partial<CreateDepositorTokenResponse> = {},
): CreateDepositorTokenResponse {
  return {
    // A genuine Rust-issued CWT whose iss/ephemeral match the server
    // identity fixtures below and whose exp equals `expires_at`, so the
    // provider's new CWT verification accepts it on the happy path.
    token: GOLDEN_CWT_TOKEN_JSONRPC,
    expires_at: GOLDEN_CWT_EXP,
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
    vi.fn().mockResolvedValueOnce(createJsonRpcSuccessResponse(response)),
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
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: new Set([
        "vaultProvider_submitDepositorWotsKey",
        "auth_createDepositorToken",
      ]),
      grpcGatedMethods: new Set(),
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
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
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
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
      now: () => NOW,
    });

    const first = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(first).toBe(GOLDEN_CWT_TOKEN_JSONRPC);

    // No fetch mock was queued for a second call — cache must serve this.
    const second = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(second).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(
      (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(1);
  });

  it("re-acquires after invalidate()", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createJsonRpcSuccessResponse(buildResponse()))
      .mockResolvedValueOnce(createJsonRpcSuccessResponse(buildResponse(), 2));
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
      now: () => NOW,
    });

    const first = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(first).toBe(GOLDEN_CWT_TOKEN_JSONRPC);

    provider.invalidate();

    // After invalidate the cache is empty, so this must hit the network
    // again rather than serve the evicted token.
    const second = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(second).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("refreshes when cached token is within refreshSkewSecs of expiry", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          createJsonRpcSuccessResponse(
            // Short-lived token: exp = GOLDEN_CWT_SHORT_EXP = NOW + 40.
            buildResponse({
              token: GOLDEN_CWT_TOKEN_JSONRPC_SHORT,
              expires_at: GOLDEN_CWT_SHORT_EXP,
            }),
          ),
        )
        .mockResolvedValueOnce(
          createJsonRpcSuccessResponse(buildResponse(), 2),
        ),
    );

    const client = createClient();
    let fakeNow = NOW;
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
      refreshSkewSecs: 30,
      now: () => fakeNow,
    });

    const first = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(first).toBe(GOLDEN_CWT_TOKEN_JSONRPC_SHORT);

    // Advance clock past (expires_at - skew) = NOW + 10
    fakeNow = NOW + 11;

    const second = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(second).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
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
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
      now: () => NOW,
    });

    await expect(
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
    ).rejects.toBeInstanceOf(ServerIdentityError);
  });

  it("single-flights concurrent acquires", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(createJsonRpcSuccessResponse(buildResponse()));
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
      now: () => NOW,
    });

    const [a, b, c] = await Promise.all([
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
      provider.getToken("vaultProvider_submitDepositorWotsKey"),
    ]);

    expect(a).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(b).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(c).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
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
        .mockResolvedValueOnce(
          createJsonRpcSuccessResponse(
            buildResponse({
              server_identity: {
                server_pubkey: "f".repeat(64), // mismatch → ServerIdentityError
                ephemeral_pubkey: "02" + "d".repeat(64),
                expires_at: NOW + 3600,
                signature: "e".repeat(128),
              },
            }),
          ),
        )
        // Second acquire: server returns a valid response.
        .mockResolvedValueOnce(
          createJsonRpcSuccessResponse(buildResponse(), 2),
        ),
    );

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
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
    expect(recovered).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
  });

  // Strictly mid-await invalidate. The earlier test sequences
  // [await reject → invalidate → next acquire]; this one inserts
  // invalidate() *while* the in-flight is still suspended at the
  // network await, then lets the in-flight reject. Models the realistic
  // race where a concurrent auth-gated RPC hits auth_expired and calls
  // invalidate() on the provider while a token acquire is still
  // pending. End state must remain consistent: cached null, inFlight
  // null, next acquire succeeds.
  it("survives invalidate() fired while the in-flight acquire is still pending", async () => {
    let rejectFirst: ((reason: unknown) => void) | undefined;
    const firstResponse = new Promise<Response>((_resolve, reject) => {
      rejectFirst = reject;
    });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(firstResponse)
        .mockResolvedValueOnce(
          createJsonRpcSuccessResponse(buildResponse()),
        ),
    );

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set(),
      now: () => NOW,
    });

    // Kick off the acquire. Don't await — it parks at the fetch promise.
    const inFlightAwait = provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );

    // Yield once so the IIFE actually reaches `await this.client.call(...)`.
    await Promise.resolve();
    await Promise.resolve();

    // While in-flight is still suspended, fire invalidate(). This is
    // the precise timing the prior test couldn't exercise.
    provider.invalidate();

    // Now reject the pending fetch, surfacing the in-flight failure.
    rejectFirst?.(new TypeError("Failed to fetch"));

    await expect(inFlightAwait).rejects.toThrow();

    // Subsequent acquire must succeed cleanly.
    const recovered = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    expect(recovered).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
  });

  // --- gRPC bootstrap path ---

  it("routes grpc-gated methods through auth_createDepositorTokenGrpc", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonRpcSuccessResponse(
          buildResponse({ token: GOLDEN_CWT_TOKEN_GRPC }),
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: GRPC_GATED_METHODS,
      now: () => NOW,
    });

    const token = await provider.getToken(
      "vaultProvider_requestDepositorClaimerArtifacts",
    );
    expect(token).toBe(GOLDEN_CWT_TOKEN_GRPC);

    // The bootstrap RPC must be the gRPC variant — bearer subject is what
    // distinguishes the two paths server-side.
    const body = JSON.parse(
      String(mockFetch.mock.calls[0]![1]!.body),
    ) as Record<string, unknown>;
    expect(body.method).toBe("auth_createDepositorTokenGrpc");
  });

  it("caches jsonrpc and grpc tokens in independent slots", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createJsonRpcSuccessResponse(buildResponse()))
      .mockResolvedValueOnce(
        createJsonRpcSuccessResponse(
          buildResponse({ token: GOLDEN_CWT_TOKEN_GRPC }),
          2,
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: GRPC_GATED_METHODS,
      now: () => NOW,
    });

    const jsonRpcToken = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    const grpcToken = await provider.getToken(
      "vaultProvider_requestDepositorClaimerArtifacts",
    );
    expect(jsonRpcToken).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(grpcToken).toBe(GOLDEN_CWT_TOKEN_GRPC);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Re-asking for each must hit cache (no third fetch).
    const jsonRpcAgain = await provider.getToken(
      "vaultProvider_submitDepositorWotsKey",
    );
    const grpcAgain = await provider.getToken(
      "vaultProvider_requestDepositorClaimerArtifacts",
    );
    expect(jsonRpcAgain).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(grpcAgain).toBe(GOLDEN_CWT_TOKEN_GRPC);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("invalidate() clears both slots", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(createJsonRpcSuccessResponse(buildResponse()))
      .mockResolvedValueOnce(
        createJsonRpcSuccessResponse(
          buildResponse({ token: GOLDEN_CWT_TOKEN_GRPC }),
          2,
        ),
      )
      .mockResolvedValueOnce(
        createJsonRpcSuccessResponse(buildResponse(), 3),
      )
      .mockResolvedValueOnce(
        createJsonRpcSuccessResponse(
          buildResponse({ token: GOLDEN_CWT_TOKEN_GRPC }),
          4,
        ),
      );
    vi.stubGlobal("fetch", mockFetch);

    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: GRPC_GATED_METHODS,
      now: () => NOW,
    });

    expect(
      await provider.getToken("vaultProvider_submitDepositorWotsKey"),
    ).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(
      await provider.getToken("vaultProvider_requestDepositorClaimerArtifacts"),
    ).toBe(GOLDEN_CWT_TOKEN_GRPC);

    // One invalidate must evict both slots (the client doesn't tell us
    // which subject expired, so we stay correct by clearing both). Each
    // re-acquire hits the network again (4 fetches total).
    provider.invalidate();

    expect(
      await provider.getToken("vaultProvider_submitDepositorWotsKey"),
    ).toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expect(
      await provider.getToken("vaultProvider_requestDepositorClaimerArtifacts"),
    ).toBe(GOLDEN_CWT_TOKEN_GRPC);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("returns null for the gRPC token-issuing method even if misconfigured", async () => {
    // Symmetric guard to the JSON-RPC token-issue exemption.
    const client = createClient();
    const provider = new VpTokenProvider({
      client,
      peginTxid: PEGIN_TXID,
      authAnchorHex: AUTH_ANCHOR,
      pinnedServerPubkey: PINNED_PUBKEY,
      expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
      authGatedMethods: AUTH_GATED_METHODS,
      grpcGatedMethods: new Set([
        "vaultProvider_requestDepositorClaimerArtifacts",
        "auth_createDepositorTokenGrpc",
      ]),
      now: () => NOW,
    });

    const token = await provider.getToken("auth_createDepositorTokenGrpc");
    expect(token).toBeNull();
  });
});
