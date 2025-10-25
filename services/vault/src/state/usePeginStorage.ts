/**
 * Pegin Storage Hook
 * 
 * Manages pending pegin transactions in localStorage
 * Integrates with PeginStateService for state management
 * Follows the pattern from simple-staking's useDelegationStorage
 */

import { useCallback, useMemo } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import {
  ContractStatus,
  LocalStorageStatus,
} from '../services/state/PeginStateService';

/**
 * Legacy status enum for backward compatibility
 * @deprecated Use ContractStatus and LocalStorageStatus from PeginStateService instead
 */
export enum PeginStatus {
  PENDING_SUBMISSION = 'pending_submission',
  PENDING_VERIFICATION = 'pending_verification',
  VERIFIED = 'verified',
  AVAILABLE = 'available',
  EXPIRED = 'expired',
}

/**
 * Minimal pegin data structure for localStorage
 */
export interface PendingPegin {
  /** Transaction hash (used as ID) */
  txHash: string;
  /** BTC transaction ID */
  btcTxid: string;
  /** ETH transaction hash */
  ethTxHash: string;
  /** Unsigned BTC transaction hex */
  btcTxHex: string;
  /** Deposit amount in satoshis */
  amount: number;
  /** Selected provider address */
  providerAddress: string;
  /** Current status (legacy - for backward compatibility) */
  status: PeginStatus;
  /** Contract status (source of truth) */
  contractStatus?: ContractStatus;
  /** Local storage status (temporary, off-chain) */
  localStatus?: LocalStorageStatus;
  /** Timestamp when created */
  createdAt: number;
  /** Whether transactions are ready from VP (for state machine) */
  transactionsReady?: boolean;
}

/**
 * Hook to manage pegin storage for a specific user
 * 
 * @param storageKey - Unique key for this user's pegins (e.g., based on eth address)
 * @returns Object with pending pegins and mutation functions
 */
export function usePeginStorage(storageKey: string) {
  const [pendingPegins = {}, setPendingPegins] = useLocalStorage<
    Record<string, PendingPegin>
  >(`${storageKey}_pending_pegins`, {});

  /**
   * Add a new pending pegin to localStorage
   */
  const addPendingPegin = useCallback(
    (pegin: PendingPegin) => {
      setPendingPegins((current: Record<string, PendingPegin>) => ({
        ...current,
        [pegin.txHash]: pegin,
      }));
    },
    [setPendingPegins]
  );

  /**
   * Update the status of a pending pegin
   */
  const updatePendingPeginStatus = useCallback(
    (txHash: string, status: PeginStatus) => {
      setPendingPegins((current: Record<string, PendingPegin>) => {
        const pegin = current[txHash];
        if (!pegin) return current;

        return {
          ...current,
          [txHash]: {
            ...pegin,
            status,
          },
        };
      });
    },
    [setPendingPegins]
  );

  /**
   * Remove a pending pegin (e.g., when it's confirmed on-chain)
   */
  const removePendingPegin = useCallback(
    (txHash: string) => {
      setPendingPegins((current: Record<string, PendingPegin>) => {
        const { [txHash]: _, ...rest } = current;
        return rest;
      });
    },
    [setPendingPegins]
  );

  /**
   * Update contract and local status for a pegin
   */
  const updatePeginState = useCallback(
    (
      txHash: string,
      contractStatus: ContractStatus,
      localStatus?: LocalStorageStatus,
      transactionsReady?: boolean,
    ) => {
      setPendingPegins((current: Record<string, PendingPegin>) => {
        const pegin = current[txHash];
        if (!pegin) return current;

        return {
          ...current,
          [txHash]: {
            ...pegin,
            contractStatus,
            localStatus,
            transactionsReady,
          },
        };
      });
    },
    [setPendingPegins]
  );

  /**
   * Get array of pending pegins sorted by creation time (newest first)
   */
  const pendingPeginsArray = useMemo<PendingPegin[]>(() => {
    return Object.values(pendingPegins).sort(
      (a, b) => (b as PendingPegin).createdAt - (a as PendingPegin).createdAt
    ) as PendingPegin[];
  }, [pendingPegins]);

  return {
    pendingPegins: pendingPeginsArray,
    addPendingPegin,
    updatePendingPeginStatus,
    updatePeginState,
    removePendingPegin,
  };
}

