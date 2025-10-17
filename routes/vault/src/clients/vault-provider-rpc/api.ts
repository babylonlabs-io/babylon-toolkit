/**
 * High-level API methods for vault provider RPC service
 */

import { JsonRpcClient } from '../../utils/rpc';
import type {
  RequestClaimAndPayoutTransactionsParams,
  RequestClaimAndPayoutTransactionsResponse,
  SubmitPayoutSignaturesParams,
} from './types';

export class VaultProviderRpcApi {
  private client: JsonRpcClient;

  constructor(baseUrl: string, timeout: number) {
    this.client = new JsonRpcClient({
      baseUrl,
      timeout,
    });
  }

  /**
   * Request unsigned claim and payout transactions for a PegIn
   * @param params - PegIn transaction hash and depositor public key
   * @returns List of claim/payout transaction pairs for each claimer (VP and L)
   */
  async requestClaimAndPayoutTransactions(
    params: RequestClaimAndPayoutTransactionsParams,
  ): Promise<RequestClaimAndPayoutTransactionsResponse> {
    return this.client.call<
      RequestClaimAndPayoutTransactionsParams,
      RequestClaimAndPayoutTransactionsResponse
    >('vlt_requestClaimAndPayoutTransactions', params);
  }

  /**
   * Submit depositor signatures for claim and payout transactions
   * @param params - PegIn TX ID, depositor public key, and signatures
   * @returns void on success
   */
  async submitPayoutSignatures(
    params: SubmitPayoutSignaturesParams,
  ): Promise<void> {
    return this.client.call<SubmitPayoutSignaturesParams, void>(
      'vlt_submitPayoutSignatures',
      params,
    );
  }
}
