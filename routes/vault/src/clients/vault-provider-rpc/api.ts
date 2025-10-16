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
   * @param params - PegIn transaction hash and depositor public key
   * @returns List of claim/payout transaction pairs for each claimer (VP and L)
   *
   * @example
   * ```typescript
   * const response = await api.requestClaimAndPayoutTransactions({
   *   pegin_tx_hash: 'abc123...',
   *   depositor_pk: '02ab...'
   * });
   *
   * // response.txs contains transactions from VP and liquidators
   * for (const claimer of response.txs) {
   *   console.log('Claimer:', claimer.claimer_pubkey);
   *   console.log('Claim TX:', claimer.claim_tx.tx_hex);
   *   console.log('Payout TX:', claimer.payout_tx.tx_hex);
   * }
   * ```
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
   *
   * After the depositor receives unsigned claim/payout transactions via
   * `requestClaimAndPayoutTransactions`, they sign the transactions and submit
   * their signatures through this API. The vault provider will store these
   * signatures and use them to finalize the PegIn claim process.
   *
   * @param params - PegIn TX ID, depositor public key, and signatures
   * @returns void on success
   *
   * @example
   * ```typescript
   * await api.submitPayoutSignatures({
   *   pegin_tx_id: 'abc123...',
   *   depositor_pk: '02ab...',
   *   signatures: {
   *     '02claimer_pk_vp...': 'signature_for_vp_payout...',
   *     '03claimer_pk_liquidator...': 'signature_for_liquidator_payout...'
   *   }
   * });
   * ```
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
