/**
 * Narrow interfaces for deposit protocol service functions.
 *
 * Core service functions accept these interfaces instead of concrete client
 * classes, enabling callers to provide any implementation (mock, proxy, etc.).
 *
 * Method signatures match the VP RPC wire format exactly.
 */

import type {
  GetPeginStatusResponse,
  RequestDepositorClaimerArtifactsParams,
  RequestDepositorClaimerArtifactsResponse,
  RequestDepositorPresignTransactionsParams,
  RequestDepositorPresignTransactionsResponse,
  SubmitDepositorPresignaturesParams,
  SubmitDepositorWotsKeyParams,
} from "../../clients/vault-provider/types";

/** Read-only VP operations needed by polling/status functions. */
export interface PeginStatusReader {
  getPeginStatus(
    params: { pegin_txid: string },
    signal?: AbortSignal,
  ): Promise<GetPeginStatusResponse>;
}

/** Write VP operations for WOTS key submission. */
export interface WotsKeySubmitter {
  submitDepositorWotsKey(
    params: SubmitDepositorWotsKeyParams,
    signal?: AbortSignal,
  ): Promise<void>;
}

/** VP operations for the presign transaction flow. */
export interface PresignClient {
  requestDepositorPresignTransactions(
    params: RequestDepositorPresignTransactionsParams,
    signal?: AbortSignal,
  ): Promise<RequestDepositorPresignTransactionsResponse>;
  submitDepositorPresignatures(
    params: SubmitDepositorPresignaturesParams,
    signal?: AbortSignal,
  ): Promise<void>;
}

/** VP operations for depositor-as-claimer artifacts (separate from payout signing). */
export interface ClaimerArtifactsReader {
  requestDepositorClaimerArtifacts(
    params: RequestDepositorClaimerArtifactsParams,
    signal?: AbortSignal,
  ): Promise<RequestDepositorClaimerArtifactsResponse>;
}
