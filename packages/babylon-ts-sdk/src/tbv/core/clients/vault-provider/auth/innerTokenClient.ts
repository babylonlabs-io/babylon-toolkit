/**
 * Shared internals for the unauthenticated token-issuing JSON-RPC
 * client. The "inner" client is dedicated to `auth_createDepositorToken`
 * — it MUST NOT carry a `tokenProvider`, else the JSON-RPC header
 * builder would recurse into token acquisition.
 *
 * @module tbv/core/clients/vault-provider/auth/innerTokenClient
 */

import { JsonRpcClient } from "../json-rpc-client";

const TOKEN_RPC_TIMEOUT_MS = 60_000;

export const TOKEN_ISSUE_METHOD = "auth_createDepositorToken";
/**
 * gRPC-subject sibling of {@link TOKEN_ISSUE_METHOD}. The proxy bridges
 * this call to vaultd's `VaultProviderDepositorAuthService.CreateDepositorToken`
 * so the resulting CWT is bound to `Subject::VaultdGrpc` — required to
 * pass vaultd's `GrpcAuthInterceptor` on methods the proxy translates to
 * gRPC (currently just the artifact stream).
 */
export const GRPC_TOKEN_ISSUE_METHOD = "auth_createDepositorTokenGrpc";

export function buildInnerTokenClient(
  baseUrl: string,
  headers?: Record<string, string>,
): JsonRpcClient {
  return new JsonRpcClient({
    baseUrl,
    timeout: TOKEN_RPC_TIMEOUT_MS,
    headers,
    retryableFor: (method) =>
      method === TOKEN_ISSUE_METHOD || method === GRPC_TOKEN_ISSUE_METHOD,
  });
}
