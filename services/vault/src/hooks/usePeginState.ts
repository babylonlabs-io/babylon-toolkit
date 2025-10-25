/**
 * Pegin State Hook
 * 
 * Integrates PeginStateService with usePeginStorage
 * Provides a clean interface for components to manage pegin states
 */

import { useMemo } from 'react';
import { usePeginStorage, type PendingPegin } from '../state/usePeginStorage';
import {
  getPeginState,
  canPerformAction,
  getPrimaryActionButton,
  type PeginState,
  type PeginAction,
  ContractStatus,
  LocalStorageStatus,
} from '../services/state/PeginStateService';

interface PeginWithState extends PendingPegin {
  /** Computed state from state machine */
  state: PeginState;
}

interface UsePeginStateReturn {
  /** Pending pegins with computed states */
  peginsWithState: PeginWithState[];
  /** Add a new pending pegin */
  addPendingPegin: (pegin: PendingPegin) => void;
  /** Update legacy status (deprecated) */
  updatePendingPeginStatus: (txHash: string, status: any) => void;
  /** Update pegin state (contract + local status) */
  updatePeginState: (
    txHash: string,
    contractStatus: ContractStatus,
    localStatus?: LocalStorageStatus,
    transactionsReady?: boolean,
  ) => void;
  /** Remove a pending pegin */
  removePendingPegin: (txHash: string) => void;
  /** Get state for a specific pegin */
  getPeginStateById: (txHash: string) => PeginState | null;
  /** Check if action is available for a pegin */
  canPerformAction: (txHash: string, action: PeginAction) => boolean;
  /** Get primary action button for a pegin */
  getPrimaryAction: (txHash: string) => { label: string; action: PeginAction } | null;
}

/**
 * Hook to manage pegin state with state machine integration
 * 
 * @param storageKey - Unique key for this user's pegins (e.g., based on eth address)
 * @returns Pegin state management interface
 */
export function usePeginState(storageKey: string): UsePeginStateReturn {
  const {
    pendingPegins,
    addPendingPegin,
    updatePendingPeginStatus,
    updatePeginState,
    removePendingPegin,
  } = usePeginStorage(storageKey);

  /**
   * Compute state for each pegin using the state service
   */
  const peginsWithState = useMemo<PeginWithState[]>(() => {
    return pendingPegins.map((pegin) => {
      // Use new state service if contractStatus is available
      const state = pegin.contractStatus !== undefined
        ? getPeginState(
            pegin.contractStatus,
            pegin.localStatus,
            pegin.transactionsReady,
          )
        : // Fallback to default pending state for legacy data
          {
            contractStatus: ContractStatus.PENDING,
            displayLabel: 'Pending',
            displayVariant: 'pending' as const,
            availableActions: [],
            message: 'Waiting for confirmation',
          };

      return {
        ...pegin,
        state,
      };
    });
  }, [pendingPegins]);

  /**
   * Get state for a specific pegin by txHash
   */
  const getPeginStateById = (txHash: string): PeginState | null => {
    const peginWithState = peginsWithState.find((p) => p.txHash === txHash);
    return peginWithState?.state || null;
  };

  /**
   * Check if a specific action is available for a pegin
   */
  const canPerformActionForPegin = (txHash: string, action: PeginAction): boolean => {
    const state = getPeginStateById(txHash);
    return state ? canPerformAction(state, action) : false;
  };

  /**
   * Get the primary action button for a pegin
   */
  const getPrimaryActionForPegin = (
    txHash: string,
  ): { label: string; action: PeginAction } | null => {
    const state = getPeginStateById(txHash);
    return state ? getPrimaryActionButton(state) : null;
  };

  return {
    peginsWithState,
    addPendingPegin,
    updatePendingPeginStatus,
    updatePeginState,
    removePendingPegin,
    getPeginStateById,
    canPerformAction: canPerformActionForPegin,
    getPrimaryAction: getPrimaryActionForPegin,
  };
}

// Re-export types and utilities for convenience
export {
  ContractStatus,
  LocalStorageStatus,
  PeginAction,
  type PeginState,
  getPeginState,
  shouldRemoveFromLocalStorage,
} from '../services/state/PeginStateService';

export type { PeginWithState };

