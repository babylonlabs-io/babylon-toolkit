/**
 * Vault Provider RPC Client
 */

import { VaultProviderRpcApi } from './api';
import { RPC_TIMEOUT, getVaultProviderRpcUrl } from './config';

// Export types
export type {
  ClaimerTransactions,
  RequestClaimAndPayoutTransactionsParams,
  RequestClaimAndPayoutTransactionsResponse,
  SubmitPayoutSignaturesParams,
  TransactionData,
} from './types';

// Export error codes
export { RpcErrorCode } from './types';

let apiInstance: VaultProviderRpcApi | null = null;

/**
 * Get the Vault Provider RPC API client (singleton)
 */
export function getVaultProviderRpcApi(): VaultProviderRpcApi {
  if (!apiInstance) {
    apiInstance = new VaultProviderRpcApi(getVaultProviderRpcUrl(), RPC_TIMEOUT);
  }
  return apiInstance;
}
