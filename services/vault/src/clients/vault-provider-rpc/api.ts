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
    return this.client.call<
      RequestDepositorPresignTransactionsParams,
      RequestDepositorPresignTransactionsResponse
    >("vaultProvider_requestDepositorPresignTransactions", params);
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
    return this.client.call<
      RequestDepositorClaimerArtifactsParams,
      RequestDepositorClaimerArtifactsResponse
    >("vaultProvider_requestDepositorClaimerArtifacts", params);
  }

  /** Get the current pegin status from the vault provider daemon. */
  async getPeginStatus(
    params: GetPeginStatusParams,
  ): Promise<GetPeginStatusResponse> {
    return this.client.call<GetPeginStatusParams, GetPeginStatusResponse>(
      "vaultProvider_getPeginStatus",
      params,
    );
  }

  /** Get the current pegout status from the vault provider daemon. */
  async getPegoutStatus(
    params: GetPegoutStatusParams,
  ): Promise<GetPegoutStatusResponse> {
    return this.client.call<GetPegoutStatusParams, GetPegoutStatusResponse>(
      "vaultProvider_getPegoutStatus",
      params,
    );
  }
}
