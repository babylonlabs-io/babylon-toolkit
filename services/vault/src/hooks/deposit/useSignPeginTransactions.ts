/**
 * Hook to sign peg-in payout transactions
 *
 * Provides React state management for signing payout transactions and submitting
 * signatures to the vault provider. The actual business logic is delegated to
 * the peginPayoutSignatureService for reusability.
 */

import { useCallback, useState } from "react";
import type { Hex } from "viem";

import { signAndSubmitPayoutSignatures } from "../../services/vault";
import type { ClaimerTransactions } from "../../types";

import { useVaultProviders } from "./useVaultProviders";

export interface SignPeginTransactionsParams {
  /** Peg-in transaction ID */
  peginTxId: string;
  /** Vault provider Ethereum address */
  vaultProviderAddress: Hex;
  /** Depositor's BTC public key (32-byte x-only, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Transactions to sign from vault provider */
  transactions: ClaimerTransactions[];
  /** BTC wallet provider for signing */
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };
}

export interface UseSignPeginTransactionsResult {
  /** Sign payout transactions and submit signatures to vault provider */
  signPayoutsAndSubmit: (params: SignPeginTransactionsParams) => Promise<void>;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Success state */
  success: boolean;
}

/**
 * Hook to sign peg-in payout transactions and submit signatures
 *
 * This hook provides React state management (loading, error, success) and:
 * 1. Gets vault provider URL from globally cached providers (via useVaultProviders)
 * 2. Delegates business logic to peginPayoutSignatureService
 * 3. Manages state updates based on success/failure
 *
 * @param applicationController - Application controller address for fetching providers
 * @returns Hook result with signPayoutsAndSubmit function and state
 */
export function useSignPeginTransactions(
  applicationController?: string,
): UseSignPeginTransactionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState(false);

  // Get cached vault providers and liquidators for the specific application
  const { findProvider, liquidators } = useVaultProviders(
    applicationController,
  );

  const signPayoutsAndSubmit = useCallback(
    async (params: SignPeginTransactionsParams) => {
      setLoading(true);
      setError(null);
      setSuccess(false);

      try {
        // Get vault provider information from cached data
        const provider = findProvider(params.vaultProviderAddress);

        if (!provider) {
          throw new Error(
            `Vault provider ${params.vaultProviderAddress} not found in indexer`,
          );
        }

        if (!provider.url) {
          throw new Error(
            `Vault provider ${params.vaultProviderAddress} has no RPC URL`,
          );
        }

        // Delegate to service layer (state-unaware, reusable business logic)
        await signAndSubmitPayoutSignatures({
          peginTxId: params.peginTxId,
          depositorBtcPubkey: params.depositorBtcPubkey,
          claimerTransactions: params.transactions,
          providers: {
            vaultProvider: {
              address: params.vaultProviderAddress,
              url: provider.url,
              btcPubKey: provider.btcPubKey,
            },
            liquidators,
          },
          btcWalletProvider: params.btcWalletProvider,
        });

        setSuccess(true);
        setError(null);
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("Failed to sign and submit payout signatures");
        setError(error);
        setSuccess(false);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [findProvider, liquidators],
  );

  return {
    signPayoutsAndSubmit,
    loading,
    error,
    success,
  };
}
