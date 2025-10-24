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
   *
   * Depositors call this method to get the claim and payout transactions
   * that they need to sign for the PegIn claim flow.
   *
   * @param params - PegIn transaction ID and depositor's 32-byte x-only public key
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
   * Submit depositor signatures for payout transactions
   *
   * After the depositor receives unsigned claim/payout transactions via
   * requestClaimAndPayoutTransactions, they sign the transactions and submit
   * their signatures through this API. The vault provider will store these
   * signatures and use them to finalize the PegIn claim process.
   *
   * @param params - PegIn TX ID, depositor's 32-byte x-only public key, and Schnorr signatures
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
