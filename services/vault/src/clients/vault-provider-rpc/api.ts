/**
 * High-level API methods for vault provider RPC service
 */

import { JsonRpcClient } from "../../utils/rpc";

import type {
  GetPeginStatusParams,
  GetPeginStatusResponse,
  RequestDepositorPresignTransactionsParams,
  RequestDepositorPresignTransactionsResponse,
  SubmitPayoutSignaturesParams,
} from "./types";

export class VaultProviderRpcApi {
  private client: JsonRpcClient;

  constructor(baseUrl: string, timeout: number) {
    this.client = new JsonRpcClient({
      baseUrl,
      timeout,
    });
  }

  /**
   * Request transactions for depositor to presign
   *
   * Depositors call this method to get the transactions that they need to sign
   * for the PegIn flow. Returns 4 transactions per claimer:
   * - Claim (for reference)
   * - PayoutOptimistic (depositor signs)
   * - Assert (for reference)
   * - Payout (depositor signs)
   *
   * @param params - PegIn transaction ID and depositor's 32-byte x-only public key
   * @returns List of transaction sets for each claimer (VP and VKs)
   */
  async requestDepositorPresignTransactions(
    params: RequestDepositorPresignTransactionsParams,
  ): Promise<RequestDepositorPresignTransactionsResponse> {
    return this.client.call<
      RequestDepositorPresignTransactionsParams,
      RequestDepositorPresignTransactionsResponse
    >("vaultProvider_requestDepositorPresignTransactions", params);
  }

  /**
   * Submit depositor signatures for PayoutOptimistic and Payout transactions
   *
   * After the depositor receives transactions via `requestDepositorPresignTransactions`,
   * they sign both PayoutOptimistic and Payout transactions and submit their signatures
   * through this API. The vault provider will store these signatures and use them to
   * finalize the PegIn flow.
   *
   * @param params - PegIn TX ID, depositor's 32-byte x-only public key, and signatures
   *                 (both PayoutOptimistic and Payout signatures for each claimer)
   * @returns void on success
   */
  async submitPayoutSignatures(
    params: SubmitPayoutSignaturesParams,
  ): Promise<void> {
    return this.client.call<SubmitPayoutSignaturesParams, void>(
      "vaultProvider_submitPayoutSignatures",
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
      "vaultProvider_getPeginStatus",
      params,
    );
  }
}
