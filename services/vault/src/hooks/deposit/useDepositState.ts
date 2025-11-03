/**
 * Deposit State Hook
 * 
 * Manages the overall deposit flow state using the new architecture.
 * Replaces the old VaultDepositState component.
 */

import { useCallback, useState } from 'react';

export enum DepositStep {
  FORM = 'form',
  REVIEW = 'review',
  SIGN = 'sign',
  SUCCESS = 'success',
}

export interface DepositStateData {
  step?: DepositStep;
  amount: bigint;
  selectedProviders: string[];
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
}

export interface UseDepositStateResult {
  // State
  step?: DepositStep;
  amount: bigint;
  selectedProviders: string[];
  btcTxid: string;
  ethTxHash: string;
  depositorBtcPubkey?: string;
  processing: boolean;
  
  // Actions
  goToStep: (step: DepositStep) => void;
  setDepositData: (amount: bigint, providers: string[]) => void;
  setTransactionHashes: (btcTxid: string, ethTxHash: string, depositorBtcPubkey?: string) => void;
  setProcessing: (processing: boolean) => void;
  reset: () => void;
}

/**
 * Hook to manage deposit flow state
 */
export function useDepositState(): UseDepositStateResult {
  const [state, setState] = useState<DepositStateData>({
    step: undefined,
    amount: 0n,
    selectedProviders: [],
    btcTxid: '',
    ethTxHash: '',
    depositorBtcPubkey: undefined,
  });
  
  const [processing, setProcessing] = useState(false);

  const goToStep = useCallback((step: DepositStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const setDepositData = useCallback((amount: bigint, providers: string[]) => {
    setState(prev => ({
      ...prev,
      amount,
      selectedProviders: providers,
    }));
  }, []);

  const setTransactionHashes = useCallback((
    btcTxid: string,
    ethTxHash: string,
    depositorBtcPubkey?: string
  ) => {
    setState(prev => ({
      ...prev,
      btcTxid,
      ethTxHash,
      depositorBtcPubkey,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      step: undefined,
      amount: 0n,
      selectedProviders: [],
      btcTxid: '',
      ethTxHash: '',
      depositorBtcPubkey: undefined,
    });
    setProcessing(false);
  }, []);

  return {
    // State
    step: state.step,
    amount: state.amount,
    selectedProviders: state.selectedProviders,
    btcTxid: state.btcTxid,
    ethTxHash: state.ethTxHash,
    depositorBtcPubkey: state.depositorBtcPubkey,
    processing,
    
    // Actions
    goToStep,
    setDepositData,
    setTransactionHashes,
    setProcessing,
    reset,
  };
}
