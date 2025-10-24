/**
 * Custom hook for managing vault activity actions
 *
 * Extracts business logic for broadcasting and signing from VaultActivityCard
 * to improve separation of concerns and testability.
 */

import { useState } from 'react';
import type { Hex } from 'viem';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import { broadcastPeginTransaction } from '../services/btc/broadcastService';
import { getPeginRequest } from '../clients/eth-contract/btc-vaults-manager/query';
import { CONTRACTS } from '../config/contracts';
import { useSignPeginTransactions } from './useSignPeginTransactions';
import { PeginStatus, type PendingPegin } from '../state/usePeginStorage';
import type { ClaimerTransactions } from '../clients/vault-provider-rpc/types';
import { stripHexPrefix } from '../utils/btc';

export interface BroadcastPeginParams {
  activityId: string;
  activityAmount: string;
  activityProviders: Array<{ id: string }>;
  pendingPegin?: PendingPegin;
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPegin['status'],
    btcTxHash?: string,
  ) => void;
  addPendingPegin?: (pegin: Omit<PendingPegin, 'timestamp'>) => void;
  onRefetchActivities: () => void;
  onShowSuccessModal: () => void;
}

export interface SignPayoutParams {
  peginTxId: string;
  vaultProviderAddress: Hex;
  depositorBtcPubkey: string;
  transactions: ClaimerTransactions[];
  activityId: string;
  updatePendingPeginStatus?: (
    peginId: string,
    status: PendingPegin['status'],
  ) => void;
  onRefetchActivities?: () => void;
}

export interface UseVaultActivityActionsReturn {
  // Broadcast state
  broadcasting: boolean;
  broadcastError: string | null;
  handleBroadcast: (params: BroadcastPeginParams) => Promise<void>;

  // Sign state
  signing: boolean;
  signError: string | null;
  handleSign: (params: SignPayoutParams) => Promise<void>;
}

/**
 * Custom hook for vault activity actions (broadcast and sign)
 */
export function useVaultActivityActions(): UseVaultActivityActionsReturn {
  // Broadcast state
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Sign state
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Connectors
  const btcConnector = useChainConnector('BTC');
  const { signPayoutsAndSubmit } = useSignPeginTransactions();

  /**
   * Handle broadcasting BTC transaction
   */
  const handleBroadcast = async (params: BroadcastPeginParams) => {
    const {
      activityId,
      activityAmount,
      activityProviders,
      pendingPegin,
      updatePendingPeginStatus,
      addPendingPegin,
      onRefetchActivities,
      onShowSuccessModal,
    } = params;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      // Fetch pegin request from BTCVaultsManager contract (source of truth)
      const peginRequest = await getPeginRequest(
        CONTRACTS.BTC_VAULTS_MANAGER,
        activityId as Hex,
      );

      const unsignedTxHex = peginRequest.unsignedBtcTx;

      if (!unsignedTxHex) {
        throw new Error(
          'Unsigned transaction not found in contract. Please try again.',
        );
      }

      // Get BTC wallet provider
      const btcWalletProvider = btcConnector?.connectedWallet?.provider;
      if (!btcWalletProvider) {
        throw new Error(
          'BTC wallet not connected. Please reconnect your wallet.',
        );
      }

      // Get depositor's BTC public key (needed for Taproot signing)
      // Strip "0x" prefix since it comes from contract (Ethereum-style hex)
      const depositorBtcPubkey = stripHexPrefix(peginRequest.depositorBtcPubkey);
      if (!depositorBtcPubkey) {
        throw new Error(
          'Depositor BTC public key not found. Please try creating the peg-in request again.',
        );
      }

      // Broadcast the transaction (UTXO will be derived from mempool API)
      const txId = await broadcastPeginTransaction({
        unsignedTxHex,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
        depositorBtcPubkey,
      });

      // Update localStorage entry for status tracking
      if (pendingPegin && updatePendingPeginStatus) {
        // Update existing entry - use legacy PeginStatus for now
        updatePendingPeginStatus(activityId, PeginStatus.PENDING_VERIFICATION);
      } else if (addPendingPegin) {
        // Create new entry for cross-device tracking
        addPendingPegin({
          txHash: activityId,
          btcTxid: txId,
          ethTxHash: activityId,
          btcTxHex: '',
          amount: parseFloat(activityAmount) * 100_000_000, // Convert BTC to sats
          providerAddress: activityProviders[0]?.id || '',
          status: PeginStatus.PENDING_VERIFICATION,
          createdAt: Date.now(),
        });
      }

      // Show success modal and refetch
      onShowSuccessModal();
      onRefetchActivities();

      setBroadcasting(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to broadcast transaction';
      setBroadcastError(errorMessage);
      setBroadcasting(false);
    }
  };

  /**
   * Handle signing payout transactions
   */
  const handleSign = async (params: SignPayoutParams) => {
    const {
      peginTxId,
      vaultProviderAddress,
      depositorBtcPubkey,
      transactions,
      activityId,
      updatePendingPeginStatus,
      onRefetchActivities,
    } = params;

    // Get BTC wallet provider
    const btcWalletProvider = btcConnector?.connectedWallet?.provider;
    if (!btcWalletProvider) {
      setSignError('BTC wallet not connected. Please reconnect your wallet.');
      return;
    }

    setSigning(true);
    setSignError(null);

    try {
      await signPayoutsAndSubmit({
        peginTxId,
        vaultProviderAddress,
        depositorBtcPubkey,
        transactions,
        btcWalletProvider: {
          signPsbt: (psbtHex: string) => btcWalletProvider.signPsbt(psbtHex),
        },
      });

      // Update localStorage status
      if (updatePendingPeginStatus) {
        updatePendingPeginStatus(activityId, PeginStatus.VERIFIED);
      }

      // Refetch activities after successful submission
      if (onRefetchActivities) {
        onRefetchActivities();
      }

      setSigning(false);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to sign transactions';
      setSignError(errorMessage);
      setSigning(false);
    }
  };

  return {
    broadcasting,
    broadcastError,
    handleBroadcast,
    signing,
    signError,
    handleSign,
  };
}
