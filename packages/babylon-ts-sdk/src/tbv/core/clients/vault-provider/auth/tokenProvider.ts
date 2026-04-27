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

import type { BearerTokenProvider, JsonRpcClient } from "../json-rpc-client";
import {
  type ServerIdentityResponse,
  verifyServerIdentity,
} from "./serverIdentity";

/** Method name on the VP that issues depositor tokens (fast path). */
const CREATE_TOKEN_METHOD = "auth_createDepositorToken";

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
  /** VP JSON-RPC client to use for `auth_createDepositorToken` calls. */
  client: JsonRpcClient;
  /** Pre-PegIn transaction id this token is scoped to. */
  peginTxid: string;
  /**
   * 64-char lowercase hex encoding of the 32-byte `auth_anchor`
   * preimage committed in the Pre-PegIn OP_RETURN. Presenting this
   * preimage is what lets the VP issue the token (the "fast path").
   */
  authAnchorHex: string;
  /**
   * 64-char lowercase hex x-only pubkey the FE expects the VP to
   * present as its persistent server identity. Sourced from the
   * on-chain `VaultProvider.btcPubKey` via the vault-registry reader.
   */
  pinnedServerPubkey: string;
  /**
   * Set of method names that require authentication. `getToken()`
   * returns `null` for any method not in this set.
   */
  authGatedMethods: ReadonlySet<string>;
  /**
   * Seconds before `expires_at` to treat a cached token as expired.
   * Default: {@link DEFAULT_REFRESH_SKEW_SECS}.
   */
  refreshSkewSecs?: number;
  /** Clock source (injected for testability). Default: `Date.now() / 1000`. */
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
  private readonly client: JsonRpcClient;
  private readonly peginTxid: string;
  private readonly authAnchorHex: string;
  private readonly pinnedServerPubkey: string;
  private readonly authGatedMethods: ReadonlySet<string>;
  private readonly refreshSkewSecs: number;
  private readonly now: () => number;

  private cached: CachedToken | null = null;
  private inFlight: Promise<CachedToken> | null = null;

  constructor(config: VpTokenProviderConfig) {
    this.client = config.client;
    this.peginTxid = config.peginTxid;
    this.authAnchorHex = config.authAnchorHex;
    this.pinnedServerPubkey = config.pinnedServerPubkey;
    this.authGatedMethods = config.authGatedMethods;
    this.refreshSkewSecs = config.refreshSkewSecs ?? DEFAULT_REFRESH_SKEW_SECS;
    this.now = config.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /**
   * Return a bearer token for `method`, or `null` if `method` is not
   * auth-gated. Triggers a token acquisition if no token is cached or
   * the cached token is within {@link refreshSkewSecs} of expiry.
   *
   * The token-issuing method itself is hard-exempted from the gate —
   * if `auth_createDepositorToken` were ever included in
   * `authGatedMethods` (caller misconfiguration) the provider would
   * recurse into `acquireSingleFlight` from inside the JSON-RPC header
   * builder before `inFlight` is assigned, defeating the single-flight
   * guard. Returning `null` here breaks that recursion deterministically.
   */
  async getToken(method: string): Promise<string | null> {
    if (method === CREATE_TOKEN_METHOD) return null;
    if (!this.authGatedMethods.has(method)) return null;

    const cached = this.cached;
    if (cached && this.now() + this.refreshSkewSecs < cached.expiresAt) {
      return cached.token;
    }

    const fresh = await this.acquireSingleFlight();
    return fresh.token;
  }

  /**
   * Drop the cached token. Next `getToken` call re-acquires.
   * Called by `JsonRpcClient` on wire `auth_expired` responses.
   */
  invalidate(): void {
    this.cached = null;
    // Do NOT clear `inFlight` — a concurrent acquire is still valid;
    // the invalidator is saying "the cached token is bad", not "any
    // in-flight acquire is bad". The in-flight acquire will populate
    // a fresh `cached` on completion.
  }

  private acquireSingleFlight(): Promise<CachedToken> {
    const existing = this.inFlight;
    if (existing) return existing;

    const p = (async () => {
      try {
        const response = await this.client.call<
          { pegin_txid: string; auth_anchor: string },
          CreateDepositorTokenResponse
        >(CREATE_TOKEN_METHOD, {
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

        const fresh: CachedToken = {
          token: response.token,
          expiresAt: response.expires_at,
        };
        this.cached = fresh;
        return fresh;
      } finally {
        this.inFlight = null;
      }
    })();

    this.inFlight = p;
    return p;
  }
}
