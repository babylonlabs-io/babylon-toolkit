/**
 * High-level API methods for vault provider RPC service
 */

import { JsonRpcClient } from '../../utils/rpc';
import type {
  RequestClaimAndPayoutTransactionsParams,
  RequestClaimAndPayoutTransactionsResponse,
  SubmitPayoutSignaturesParams,
  GetPeginStatusParams,
  GetPeginStatusResponse,
  GetPeginClaimTxGraphParams,
  GetPeginClaimTxGraphResponse,
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

  /**
   * Get the current status of a PegIn transaction
   *
   * @param params - PegIn transaction ID
   * @returns Current status as a string
   */
  async getPeginStatus(
    params: GetPeginStatusParams,
  ): Promise<GetPeginStatusResponse> {
    return this.client.call<GetPeginStatusParams, GetPeginStatusResponse>(
      'vlt_getPeginStatus',
      params,
    );
  }

  /**
   * Get the PegIn claim transaction graph
   *
   * This returns the complete transaction graph including all public keys,
   * which can be used to verify the exact order of liquidators used by the VP.
   *
   * @param params - PegIn transaction ID
   * @returns The PegInClaimTxGraph serialized as JSON
   */
  async getPeginClaimTxGraph(
    params: GetPeginClaimTxGraphParams,
  ): Promise<GetPeginClaimTxGraphResponse> {
    return this.client.call<
      GetPeginClaimTxGraphParams,
      GetPeginClaimTxGraphResponse
    >('vlt_getPeginClaimTxGraph', params);
  }
}
