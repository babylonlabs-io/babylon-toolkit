/**
 * Protocol Parameters Hook
 *
 * Provides access to full protocol parameters from the ProtocolParams contract.
 * Parameters are cached for 5 minutes since they rarely change.
 *
 * NOTE: For deposit validation (minDeposit), prefer `useProtocolParamsContext()`
 * which blocks rendering until params are loaded.
 */

import type { TBVProtocolParams } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

export interface UseProtocolParamsResult {
  /** Full protocol parameters */
  params: TBVProtocolParams | undefined;
  /** Whether params are currently being fetched */
  isLoading: boolean;
  /** Error if the fetch failed */
  error: Error | null;
  /** Refetch the params */
  refetch: () => void;
}
