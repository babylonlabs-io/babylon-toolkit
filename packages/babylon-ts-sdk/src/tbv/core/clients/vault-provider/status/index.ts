/**
 * Dependency-clean Vault Provider status polling facade.
 *
 * This entry point deliberately excludes `../auth`, whose BIP-322 and CWT
 * verification implementations require Bitcoin cryptography packages. Use it
 * for unauthenticated status reads and polling that must remain usable in an
 * Ethereum-only application session.
 *
 * @module clients/vault-provider/status
 */

export { VaultProviderRpcClient } from "../api";
export type { VaultProviderRpcClientOptions } from "../api";
export type { BatchResultEntry } from "../batchAttribution";
export {
  batchPollByProvider,
  type BatchPollByProviderOptions,
} from "../batchPoll";
export { JSON_RPC_ERROR_CODES, JsonRpcError } from "../json-rpc-client";
export * from "../types";
export { VpResponseValidationError } from "../validators";
