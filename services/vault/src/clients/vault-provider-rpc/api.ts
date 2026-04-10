import { JsonRpcClient } from "../../utils/rpc";

import type {
  GetPeginStatusParams,
  GetPeginStatusResponse,
  GetPegoutStatusParams,
  GetPegoutStatusResponse,
  RequestDepositorClaimerArtifactsParams,
  RequestDepositorClaimerArtifactsResponse,
  RequestDepositorPresignTransactionsParams,
  RequestDepositorPresignTransactionsResponse,
  SubmitDepositorPresignaturesParams,
  SubmitDepositorWotsKeyParams,
} from "./types";
import {
  validateGetPeginStatusResponse,
  validateGetPegoutStatusResponse,
  validateRequestDepositorClaimerArtifactsResponse,
  validateRequestDepositorPresignTransactionsResponse,
} from "./validators";

/**
 * JSON-RPC client for the Vault Provider API.
 *
 * Wraps {@link JsonRpcClient} with typed methods matching the
 * `vaultProvider_*` RPC namespace defined in the btc-vaults pegin spec.
 *
 * @see https://github.com/babylonlabs-io/btc-vaults/blob/main/docs/pegin.md
 */
export class VaultProviderRpcApi {
  private client: JsonRpcClient;

  constructor(baseUrl: string, timeout: number) {
    this.client = new JsonRpcClient({
      baseUrl,
      timeout,
    });
  }

  /**
   * Request the payout/claim/assert transactions that the depositor
   * needs to pre-sign before the vault can be activated on Bitcoin.
   */
  async requestDepositorPresignTransactions(
    params: RequestDepositorPresignTransactionsParams,
  ): Promise<RequestDepositorPresignTransactionsResponse> {
    const response = await this.client.call<
      RequestDepositorPresignTransactionsParams,
      unknown
    >("vaultProvider_requestDepositorPresignTransactions", params);
    validateRequestDepositorPresignTransactionsResponse(response);
    return response;
  }

  /**
   * Submit the depositor's pre-signatures for the depositor-as-claimer
   * challenge/assert transactions (one set per challenger).
   */
  async submitDepositorPresignatures(
    params: SubmitDepositorPresignaturesParams,
  ): Promise<void> {
    return this.client.call<SubmitDepositorPresignaturesParams, void>(
      "vaultProvider_submitDepositorPresignatures",
      params,
    );
  }

  /**
   * Submit the depositor's WOTS public key to the vault provider.
   * Called after the pegin is finalized on Ethereum, when the VP is in
   * `PendingDepositorWotsPK` status.
   */
  async submitDepositorWotsKey(
    params: SubmitDepositorWotsKeyParams,
  ): Promise<void> {
    return this.client.call<SubmitDepositorWotsKeyParams, void>(
      "vaultProvider_submitDepositorWotsKey",
      params,
    );
  }

  /**
   * Request the BaBe DecryptorArtifacts needed for the depositor to
   * independently evaluate garbled circuits during a challenge.
   */
  async requestDepositorClaimerArtifacts(
    params: RequestDepositorClaimerArtifactsParams,
  ): Promise<RequestDepositorClaimerArtifactsResponse> {
    const response = await this.client.call<
      RequestDepositorClaimerArtifactsParams,
      unknown
    >("vaultProvider_requestDepositorClaimerArtifacts", params);
    validateRequestDepositorClaimerArtifactsResponse(response);
    return response;
  }

  /** Get the current pegin status from the vault provider daemon. */
  async getPeginStatus(
    params: GetPeginStatusParams,
  ): Promise<GetPeginStatusResponse> {
    const response = await this.client.call<GetPeginStatusParams, unknown>(
      "vaultProvider_getPeginStatus",
      params,
    );
    validateGetPeginStatusResponse(response);
    return response;
  }

  /** Get the current pegout status from the vault provider daemon. */
  async getPegoutStatus(
    params: GetPegoutStatusParams,
  ): Promise<GetPegoutStatusResponse> {
    const response = await this.client.call<GetPegoutStatusParams, unknown>(
      "vaultProvider_getPegoutStatus",
      params,
    );
    validateGetPegoutStatusResponse(response);
    return response;
  }
}
