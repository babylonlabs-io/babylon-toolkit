import { JsonRpcClient } from "../../utils/rpc";

import type {
  GetPeginStatusParams,
  GetPeginStatusResponse,
  RequestDepositorClaimerArtifactsParams,
  RequestDepositorClaimerArtifactsResponse,
  RequestDepositorPresignTransactionsParams,
  RequestDepositorPresignTransactionsResponse,
  SubmitDepositorLamportKeyParams,
  SubmitDepositorPresignaturesParams,
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

  async requestDepositorPresignTransactions(
    params: RequestDepositorPresignTransactionsParams,
  ): Promise<RequestDepositorPresignTransactionsResponse> {
    return this.client.call<
      RequestDepositorPresignTransactionsParams,
      RequestDepositorPresignTransactionsResponse
    >("vaultProvider_requestDepositorPresignTransactions", params);
  }

  async submitDepositorPresignatures(
    params: SubmitDepositorPresignaturesParams,
  ): Promise<void> {
    return this.client.call<SubmitDepositorPresignaturesParams, void>(
      "vaultProvider_submitDepositorPresignatures",
      params,
    );
  }

  async submitPayoutSignatures(
    params: SubmitPayoutSignaturesParams,
  ): Promise<void> {
    return this.client.call<SubmitPayoutSignaturesParams, void>(
      "vaultProvider_submitPayoutSignatures",
      params,
    );
  }

  async submitDepositorLamportKey(
    params: SubmitDepositorLamportKeyParams,
  ): Promise<void> {
    return this.client.call<SubmitDepositorLamportKeyParams, void>(
      "vaultProvider_submitDepositorLamportKey",
      params,
    );
  }

  async requestDepositorClaimerArtifacts(
    params: RequestDepositorClaimerArtifactsParams,
  ): Promise<RequestDepositorClaimerArtifactsResponse> {
    return this.client.call<
      RequestDepositorClaimerArtifactsParams,
      RequestDepositorClaimerArtifactsResponse
    >("vaultProvider_requestDepositorClaimerArtifacts", params);
  }

  async getPeginStatus(
    params: GetPeginStatusParams,
  ): Promise<GetPeginStatusResponse> {
    return this.client.call<GetPeginStatusParams, GetPeginStatusResponse>(
      "vaultProvider_getPeginStatus",
      params,
    );
  }
}
