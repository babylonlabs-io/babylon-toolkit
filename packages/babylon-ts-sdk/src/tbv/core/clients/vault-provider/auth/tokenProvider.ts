/**
 * `VpTokenProvider` — caches CWT bearer tokens issued by the vault
 * provider's `auth_createDepositorToken` RPC, with lazy expiry check
 * and single-flight concurrent acquire.
 *
 * Usage:
 *
 * ```ts
 * const provider = new VpTokenProvider({
 *   client,
 *   peginTxid,
 *   authAnchorHex,
 *   pinnedServerPubkey,
 *   authGatedMethods,
 * });
 * const bearer = await provider.getToken(method); // null if not gated
 * ```
 *
 * The provider implements the `BearerTokenProvider` interface expected
 * by `JsonRpcClient`. Plug directly:
 *
 * ```ts
 * const client = new JsonRpcClient({ ..., tokenProvider: provider });
 * ```
 *
 * @module tbv/core/clients/vault-provider/auth/tokenProvider
 */

import type { OnChainBtcPubkey } from "../../eth/types";
import type { BearerTokenProvider, JsonRpcClient } from "../json-rpc-client";
import {
  GRPC_TOKEN_ISSUE_METHOD,
  TOKEN_ISSUE_METHOD,
} from "./innerTokenClient";
import {
  type ServerIdentityResponse,
  verifyServerIdentity,
} from "./serverIdentity";
import {
  CWT_SUBJECT_GRPC,
  CWT_SUBJECT_JSONRPC,
  verifyDepositorCwt,
} from "./verifyDepositorCwt";

/**
 * Maximum reasonable `expires_at` value (seconds since epoch). Guards
 * against a bogus far-future timestamp that would lock the cache on a
 * bad token forever. Jan 1, 2100 in Unix seconds.
 */
const MAX_EXPIRES_AT_SECS = 4_102_444_800;

/**
 * Default safety margin before `expires_at` — we treat a token as
 * expired this many seconds before its stated expiry so that in-flight
 * requests don't race the expiry boundary.
 */
const DEFAULT_REFRESH_SKEW_SECS = 30;

/**
 * Wire response shape of `auth_createDepositorToken`.
 */
export interface CreateDepositorTokenResponse {
  /** Base64url-encoded COSE Sign1 CWT bearer token. */
  token: string;
  /** Unix timestamp at which the token expires. */
  expires_at: number;
  /** Server identity proof bundled with every token response. */
  server_identity: ServerIdentityResponse;
}

export interface VpTokenProviderConfig {
  client: JsonRpcClient;
  /** Per-vault depositor-signed PegIn tx id. NOT shared across sibling vaults in a batch. */
  peginTxid: string;
  /** 64-char hex of the 32-byte OP_RETURN auth-anchor preimage. */
  authAnchorHex: string;
  /** Pinned VP pubkey from the on-chain registry; branded so indexer mirrors can't substitute. */
  pinnedServerPubkey: OnChainBtcPubkey;
  /**
   * Depositor x-only pubkey (32-byte hex). Asserted against every
   * issued token's CWT `aud` claim so a token minted for a different
   * depositor — or mis-issued by a buggy/compromised VP — is rejected
   * before it can authenticate a mutation.
   */
  expectedAudienceXOnlyPubkey: string;
  /**
   * Methods that need a JSON-RPC-subject bearer (minted via
   * `auth_createDepositorToken`). Forwarded over plain HTTP JSON-RPC by
   * the proxy. `getToken` returns `null` for any method outside this and
   * {@link grpcGatedMethods}.
   */
  authGatedMethods: ReadonlySet<string>;
  /**
   * Methods that need a gRPC-subject bearer (minted via
   * `auth_createDepositorTokenGrpc`). The proxy translates these into
   * gRPC calls to vaultd; the JSON-RPC bearer is rejected with a
   * `Subject` mismatch.
   */
  grpcGatedMethods: ReadonlySet<string>;
  /** Default {@link DEFAULT_REFRESH_SKEW_SECS}. */
  refreshSkewSecs?: number;
  /** Clock source for testability. */
  now?: () => number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Acquire, cache, and refresh VP bearer tokens.
 *
 * Implements {@link BearerTokenProvider}. Safe to pass directly into
 * `JsonRpcClient` as `tokenProvider`.
 */
export class VpTokenProvider implements BearerTokenProvider {
  // `client` is the only mutable field — see `setClient`. The
  // identity-bearing fields (peginTxid/authAnchorHex/pinnedServerPubkey)
  // remain readonly and are checked against re-registration in the
  // registry's `getOrCreate`.
  private client: JsonRpcClient;
  private readonly peginTxid: string;
  private readonly authAnchorHex: string;
  private readonly pinnedServerPubkey: OnChainBtcPubkey;
  private readonly expectedAudienceXOnlyPubkey: string;
  private readonly authGatedMethods: ReadonlySet<string>;
  private readonly grpcGatedMethods: ReadonlySet<string>;
  private readonly refreshSkewSecs: number;
  private readonly now: () => number;

  /** Cached JSON-RPC-subject bearer (auth_createDepositorToken). */
  private cachedJsonRpc: CachedToken | null = null;
  private inFlightJsonRpc: Promise<CachedToken> | null = null;
  /** Cached gRPC-subject bearer (auth_createDepositorTokenGrpc). */
  private cachedGrpc: CachedToken | null = null;
  private inFlightGrpc: Promise<CachedToken> | null = null;

  constructor(config: VpTokenProviderConfig) {
    this.client = config.client;
    this.peginTxid = config.peginTxid;
    this.authAnchorHex = config.authAnchorHex;
    this.pinnedServerPubkey = config.pinnedServerPubkey;
    this.expectedAudienceXOnlyPubkey = config.expectedAudienceXOnlyPubkey;
    this.authGatedMethods = config.authGatedMethods;
    this.grpcGatedMethods = config.grpcGatedMethods;
    this.refreshSkewSecs = config.refreshSkewSecs ?? DEFAULT_REFRESH_SKEW_SECS;
    this.now = config.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /**
   * Return a bearer token for `method`, or `null` if `method` is not
   * auth-gated.
   *
   * Routes by subject: `authGatedMethods` → JSON-RPC bearer (issued via
   * `auth_createDepositorToken`); `grpcGatedMethods` → gRPC bearer
   * (`auth_createDepositorTokenGrpc`). Either path acquires lazily and
   * single-flights concurrent callers; the two cache slots are
   * independent.
   *
   * Both token-issuing methods are hard-exempted from the gate — if
   * either were ever included in the gated sets (caller misconfiguration)
   * the provider would recurse into `acquireSingleFlight` from inside the
   * JSON-RPC header builder before `inFlight` is assigned, defeating the
   * single-flight guard. Returning `null` here breaks that recursion
   * deterministically.
   */
  async getToken(method: string): Promise<string | null> {
    if (method === TOKEN_ISSUE_METHOD || method === GRPC_TOKEN_ISSUE_METHOD) {
      return null;
    }

    if (this.grpcGatedMethods.has(method)) {
      return this.getTokenForSubject("grpc");
    }
    if (this.authGatedMethods.has(method)) {
      return this.getTokenForSubject("jsonrpc");
    }
    return null;
  }

  /**
   * Drop both cached tokens. Next `getToken` call re-acquires the slot
   * that's actually needed. Called by `JsonRpcClient` on wire
   * `auth_expired` responses; the client doesn't tell us which subject
   * expired, so we evict both to stay correct under either.
   *
   * Worst case is one extra round-trip on the slot that was still fresh,
   * which is cheaper than carrying a `Subject` argument through
   * `BearerTokenProvider`.
   */
  invalidate(): void {
    this.cachedJsonRpc = null;
    this.cachedGrpc = null;
    // Do NOT clear `inFlight*` — a concurrent acquire is still valid;
    // the invalidator is saying "the cached token is bad", not "any
    // in-flight acquire is bad". The in-flight acquire will populate
    // a fresh `cached*` on completion.
  }

  private async getTokenForSubject(
    subject: "jsonrpc" | "grpc",
  ): Promise<string> {
    const cached =
      subject === "grpc" ? this.cachedGrpc : this.cachedJsonRpc;
    if (cached && this.now() + this.refreshSkewSecs < cached.expiresAt) {
      return cached.token;
    }
    const fresh = await this.acquireSingleFlight(subject);
    return fresh.token;
  }

  /**
   * Swap in a different transport for subsequent token-issuing calls.
   * Used by the registry when a later caller registers the same
   * `peginTxid` against a different `baseUrl` — the cached token
   * (bound to identity, not transport) stays valid, but future
   * refreshes hit the new URL. An in-flight acquire keeps using the
   * old client (it captured the reference); next call uses the new.
   */
  setClient(client: JsonRpcClient): void {
    this.client = client;
  }

  private acquireSingleFlight(
    subject: "jsonrpc" | "grpc",
  ): Promise<CachedToken> {
    const existing =
      subject === "grpc" ? this.inFlightGrpc : this.inFlightJsonRpc;
    if (existing) return existing;

    const issueMethod =
      subject === "grpc" ? GRPC_TOKEN_ISSUE_METHOD : TOKEN_ISSUE_METHOD;

    const p = (async () => {
      try {
        const response = await this.client.call<
          { pegin_txid: string; auth_anchor: string },
          CreateDepositorTokenResponse
        >(issueMethod, {
          pegin_txid: this.peginTxid,
          auth_anchor: this.authAnchorHex,
        });

        verifyServerIdentity({
          proof: response.server_identity,
          pinnedServerPubkey: this.pinnedServerPubkey,
          now: this.now(),
        });

        // Validate wire payload before caching so a malformed response
        // from a compromised VP or proxy can't poison the cache with
        // unusable values (non-string token, non-integer expiry, etc.).
        if (typeof response.token !== "string" || response.token.length === 0) {
          throw new Error(
            `VpTokenProvider: invalid token in acquire response (expected non-empty string, got ${typeof response.token})`,
          );
        }
        const now = this.now();
        if (
          !Number.isSafeInteger(response.expires_at) ||
          response.expires_at <= now ||
          response.expires_at > MAX_EXPIRES_AT_SECS
        ) {
          throw new Error(
            `VpTokenProvider: invalid expires_at in acquire response (got ${JSON.stringify(response.expires_at)}; must be a safe integer in (${now}, ${MAX_EXPIRES_AT_SECS}])`,
          );
        }

        // Cryptographically verify the token itself — not just the wire
        // envelope. The COSE Sign1 signature is checked against the
        // (server-identity-verified) ephemeral key, and the inner CWT
        // claims are bound to this depositor (`aud`), this VP (`iss`),
        // and this subject. Without this the bearer is an opaque blob the
        // FE would attach to mutations on the VP's word alone.
        verifyDepositorCwt({
          token: response.token,
          ephemeralPubkeyHex: response.server_identity.ephemeral_pubkey,
          expectedIssuerXOnlyPubkey: this.pinnedServerPubkey,
          expectedSubject:
            subject === "grpc" ? CWT_SUBJECT_GRPC : CWT_SUBJECT_JSONRPC,
          expectedAudienceXOnlyPubkey: this.expectedAudienceXOnlyPubkey,
          responseExpiresAt: response.expires_at,
          serverIdentityExpiresAt: response.server_identity.expires_at,
          now,
        });

        const fresh: CachedToken = {
          token: response.token,
          expiresAt: response.expires_at,
        };
        if (subject === "grpc") {
          this.cachedGrpc = fresh;
        } else {
          this.cachedJsonRpc = fresh;
        }
        return fresh;
      } finally {
        if (subject === "grpc") {
          this.inFlightGrpc = null;
        } else {
          this.inFlightJsonRpc = null;
        }
      }
    })();

    if (subject === "grpc") {
      this.inFlightGrpc = p;
    } else {
      this.inFlightJsonRpc = p;
    }
    return p;
  }
}
