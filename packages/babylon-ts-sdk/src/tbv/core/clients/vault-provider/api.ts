/**
 * JSON-RPC client for the Vault Provider API.
 *
 * Wraps {@link JsonRpcClient} with typed methods matching the
 * `vaultProvider_*` RPC namespace defined in the btc-vault pegin spec.
 *
 * Implements the narrow service interfaces (PeginStatusReader, WotsKeySubmitter,
 * PresignClient, ClaimerArtifactsReader) so it can be passed directly to
 * any deposit protocol service function.
 *
 * @see https://github.com/babylonlabs-io/btc-vault/blob/main/docs/pegin.md
 */

import type { PeginStatusReader, WotsKeySubmitter, PresignClient, ClaimerArtifactsReader } from "../../services/deposit/interfaces";

import { JsonRpcClient, type JsonRpcClientConfig } from "./json-rpc-client";
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

export interface VaultProviderRpcClientOptions {
  /** Timeout in milliseconds per request (default: 60000) */
  timeout?: number;
  /** Number of retry attempts for safe methods (default: 3) */
  retries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Custom retry predicate (default: only retry get* status methods) */
  retryableFor?: (method: string) => boolean;
  /** Custom headers */
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Concrete VP RPC client implementing all service interfaces.
 *
 * Usage:
 * ```ts
 * const client = new VaultProviderRpcClient("https://vp.example.com/rpc");
 * const status = await client.getPeginStatus({ pegin_txid: "abc..." });
 * ```
 */
export class VaultProviderRpcClient
  implements PeginStatusReader, WotsKeySubmitter, PresignClient, ClaimerArtifactsReader
{
  private client: JsonRpcClient;

  constructor(baseUrl: string, options?: VaultProviderRpcClientOptions) {
    const config: JsonRpcClientConfig = {
      baseUrl,
      timeout: options?.timeout ?? DEFAULT_TIMEOUT_MS,
      retries: options?.retries,
      retryDelay: options?.retryDelay,
      retryableFor: options?.retryableFor,
      headers: options?.headers,
    };
    this.client = new JsonRpcClient(config);
  }

  /**
   * Request the payout/claim/assert transactions that the depositor
   * needs to pre-sign before the vault can be activated on Bitcoin.
   */
  async requestDepositorPresignTransactions(
    params: RequestDepositorPresignTransactionsParams,
    signal?: AbortSignal,
  ): Promise<RequestDepositorPresignTransactionsResponse> {
    const response = await this.client.call<
      RequestDepositorPresignTransactionsParams,
      unknown
    >("vaultProvider_requestDepositorPresignTransactions", params, signal);
    validateRequestDepositorPresignTransactionsResponse(response);
    return response;
  }

  /**
   * Submit the depositor's pre-signatures for the payout transactions
   * and the depositor-as-claimer graph.
   */
  async submitDepositorPresignatures(
    params: SubmitDepositorPresignaturesParams,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.client.call<SubmitDepositorPresignaturesParams, void>(
      "vaultProvider_submitDepositorPresignatures",
      params,
      signal,
    );
  }

  /**
   * Submit the depositor's WOTS public key to the vault provider.
   * Called after the pegin is finalized on Ethereum, when the VP is in
   * `PendingDepositorWotsPK` status.
   */
  async submitDepositorWotsKey(
    params: SubmitDepositorWotsKeyParams,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.client.call<SubmitDepositorWotsKeyParams, void>(
      "vaultProvider_submitDepositorWotsKey",
      params,
      signal,
    );
  }

  /**
   * Request the BaBe DecryptorArtifacts needed for the depositor to
   * independently evaluate garbled circuits during a challenge.
   */
  async requestDepositorClaimerArtifacts(
    params: RequestDepositorClaimerArtifactsParams,
    signal?: AbortSignal,
  ): Promise<RequestDepositorClaimerArtifactsResponse> {
    const response = await this.client.call<
      RequestDepositorClaimerArtifactsParams,
      unknown
    >("vaultProvider_requestDepositorClaimerArtifacts", params, signal);
    validateRequestDepositorClaimerArtifactsResponse(response);
    return response;
  }

  /** Get the current pegin status from the vault provider daemon. */
  async getPeginStatus(
    params: GetPeginStatusParams,
    signal?: AbortSignal,
  ): Promise<GetPeginStatusResponse> {
    const response = await this.client.call<GetPeginStatusParams, unknown>(
      "vaultProvider_getPeginStatus",
      params,
      signal,
    );
    validateGetPeginStatusResponse(response);
    return response;
  }

  /** Get the current pegout status from the vault provider daemon. */
  async getPegoutStatus(
    params: GetPegoutStatusParams,
    signal?: AbortSignal,
  ): Promise<GetPegoutStatusResponse> {
    const response = await this.client.call<GetPegoutStatusParams, unknown>(
      "vaultProvider_getPegoutStatus",
      params,
      signal,
    );
    validateGetPegoutStatusResponse(response);
    return response;
  }
}
