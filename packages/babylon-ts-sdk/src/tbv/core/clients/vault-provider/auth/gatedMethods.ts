/**
 * VP RPC methods that require `Authorization: Bearer <token>`.
 * Protocol invariant — must be kept in sync with the VP server.
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
