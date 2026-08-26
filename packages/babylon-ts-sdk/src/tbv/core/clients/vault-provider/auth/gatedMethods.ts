/**
 * VP RPC methods that require `Authorization: Bearer <token>`.
 * Protocol invariant — must be kept in sync with the VP server.
 *
 * Split into two sets by the CWT subject the VP demands:
 *
 * - {@link AUTH_GATED_METHODS} — bearer minted by
 *   `auth_createDepositorToken` (Subject::VaultdJsonRpc). These run
 *   through the proxy's plain JSON-RPC forward path.
 * - {@link GRPC_AUTH_GATED_METHODS} — bearer minted by
 *   `auth_createDepositorTokenGrpc` (Subject::VaultdGrpc). The proxy
 *   translates these into gRPC calls to vaultd's daemon gRPC server,
 *   so a JSON-RPC-subject token would be rejected by
 *   `GrpcAuthInterceptor`.
 *
 * @stability frozen
 *
 * @module tbv/core/clients/vault-provider/auth/gatedMethods
 */

export const AUTH_GATED_METHODS: ReadonlySet<string> = new Set([
  "vaultProvider_submitDepositorWotsKey",
  "vaultProvider_submitDepositorPresignatures",
  "vaultProvider_requestDepositorPresignTransactions",
]);

export const GRPC_AUTH_GATED_METHODS: ReadonlySet<string> = new Set([
  "vaultProvider_requestDepositorClaimerArtifacts",
]);
