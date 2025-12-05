/**
 * Main deposit flow orchestration hook
 *
 * This hook manages the complete deposit flow from form submission
 * to transaction completion. All business logic for deposits lives here.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { Hex } from "viem";

import { depositService, type DepositFormData } from "../../services/deposit";
import { formatErrorMessage } from "../../utils/errors";

import { useDepositTransaction } from "./useDepositTransaction";
import { useDepositValidation } from "./useDepositValidation";

export type DepositStep =
  | "idle"
  | "form"
  | "validating"
  | "signing"
  | "submitting"
  | "confirming"
  | "complete"
  | "error";

export interface DepositFlowState {
  step: DepositStep;
  formData: DepositFormData | null;
  transactionData: any | null;
  error: string | null;
  warnings: string[];
}

export interface UseDepositFlowResult {
  // State
  state: DepositFlowState;
  isProcessing: boolean;
  canSubmit: boolean;

  // Actions
  startDeposit: () => void;
  submitDeposit: (data: DepositFormData) => Promise<void>;
  cancelDeposit: () => void;
  reset: () => void;

  // Computed values
  estimatedFees: ReturnType<typeof depositService.calculateDepositFees> | null;
  progress: number;
}

/**
 * Hook to orchestrate the complete deposit flow
 *
 * @param btcAddress - User's Bitcoin address
 * @param ethAddress - User's Ethereum address
 * @returns Deposit flow state and actions
 */
export function useDepositFlow(
  btcAddress: string | undefined,
  ethAddress: Hex | undefined,
): UseDepositFlowResult {
  const queryClient = useQueryClient();

  // Flow state management
  const [state, setState] = useState<DepositFlowState>({
    step: "idle",
    formData: null,
    transactionData: null,
    error: null,
    warnings: [],
  });

  // Use validation hook
  const validation = useDepositValidation(btcAddress);

  // Use transaction hook
  const transaction = useDepositTransaction();

  // Step transitions
  const setStep = useCallback((step: DepositStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      error,
      step: error ? "error" : prev.step,
    }));
  }, []);

  // Start deposit flow
  const startDeposit = useCallback(() => {
    setState({
      step: "form",
      formData: null,
      transactionData: null,
      error: null,
      warnings: [],
    });
  }, []);

  // Cancel deposit flow
  const cancelDeposit = useCallback(() => {
    setState({
      step: "idle",
      formData: null,
      transactionData: null,
      error: null,
      warnings: [],
    });
  }, []);

  // Reset entire flow
  const reset = useCallback(() => {
    setState({
      step: "idle",
      formData: null,
      transactionData: null,
      error: null,
      warnings: [],
    });
    transaction.reset();
  }, [transaction]);

  // Submit deposit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: DepositFormData) => {
      if (!btcAddress || !ethAddress) {
        throw new Error("Wallet not connected");
      }

      // Step 1: Validate
      setStep("validating");
      const validationResult = await validation.validateDeposit(data);

      if (!validationResult.valid) {
        throw new Error(validationResult.error);
      }

      if (validationResult.warnings?.length) {
        setState((prev) => ({
          ...prev,
          warnings: validationResult.warnings || [],
        }));
      }

      // Step 2: Create and submit transaction (PeginManager handles everything)
      setStep("signing");
      const txResult = await transaction.createDepositTransaction({
        ...data,
        ethAddress,
      });

      if (!txResult.success) {
        throw new Error(txResult.error);
      }

      // Step 3: Wait for confirmation
      setStep("confirming");
      setState((prev) => ({
        ...prev,
        transactionData: txResult.data,
      }));

      // Simulate confirmation (in real app, would poll for status)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      return txResult.data;
    },
    onSuccess: () => {
      setStep("complete");

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      queryClient.invalidateQueries({ queryKey: ["utxos"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
    },
    onError: (error) => {
      setError(formatErrorMessage(error));
    },
  });

  // Submit deposit handler
  const submitDeposit = useCallback(
    async (data: DepositFormData) => {
      setState((prev) => ({ ...prev, formData: data }));
      await submitMutation.mutateAsync(data);
    },
    [submitMutation],
  );

  // Calculate estimated fees
  const estimatedFees = useMemo(() => {
    if (!state.formData?.amount) return null;

    try {
      const amount = depositService.parseBtcToSatoshis(state.formData.amount);
      return depositService.calculateDepositFees(amount);
    } catch {
      return null;
    }
  }, [state.formData]);

  // Calculate progress
  const progress = useMemo(() => {
    switch (state.step) {
      case "idle":
        return 0;
      case "form":
        return 10;
      case "validating":
        return 25;
      case "signing":
        return 40;
      case "submitting":
        return 60;
      case "confirming":
        return 80;
      case "complete":
        return 100;
      case "error":
        return 0;
      default:
        return 0;
    }
  }, [state.step]);

  // Computed flags
  const isProcessing = submitMutation.isPending;
  const canSubmit =
    state.step === "form" && !isProcessing && !!btcAddress && !!ethAddress;

  return {
    state,
    isProcessing,
    canSubmit,
    startDeposit,
    submitDeposit,
    cancelDeposit,
    reset,
    estimatedFees,
    progress,
  };
}
