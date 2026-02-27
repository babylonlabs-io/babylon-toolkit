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
   * Submit the depositor's payout transaction signatures
   * (payout + payout-optimistic per claimer).
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
   * Submit the depositor's Lamport public key to the vault provider.
   * Called after the pegin is finalized on Ethereum, when the VP is in
   * `PendingDepositorLamportPK` status.
   */
  async submitDepositorLamportKey(
    params: SubmitDepositorLamportKeyParams,
  ): Promise<void> {
    return this.client.call<SubmitDepositorLamportKeyParams, void>(
      "vaultProvider_submitDepositorLamportKey",
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
}
