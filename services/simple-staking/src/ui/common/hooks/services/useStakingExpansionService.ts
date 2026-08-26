import { useCallback } from "react";

import { getDelegationV2 } from "@/ui/common/api/getDelegationsV2";
import { ONE_SECOND } from "@/ui/common/constants";
import { useError } from "@/ui/common/context/Error/ErrorProvider";
import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { ClientError, ERROR_CODES } from "@/ui/common/errors";
import { useLogger } from "@/ui/common/hooks/useLogger";
import { useAppState } from "@/ui/common/state";
import { useStakingExpansionState } from "@/ui/common/state/StakingExpansionState";
import {
  StakingExpansionStep,
  type StakingExpansionFormData,
} from "@/ui/common/state/StakingExpansionTypes";
import {
  DelegationV2StakingState as DelegationState,
  DelegationV2,
} from "@/ui/common/types/delegationsV2";
import { retry } from "@/ui/common/utils";
import { markExpansionAsBroadcasted } from "@/ui/common/utils/local_storage/expansionStorage";
import { getTxHex } from "@/ui/common/utils/mempool_api";
import { validateExpansionFormData } from "@/ui/common/utils/stakingExpansionValidation";

import { useBbnTransaction } from "../client/rpc/mutation/useBbnTransaction";

import {
  useTransactionService,
  type BtcStakingExpansionInputs,
} from "./useTransactionService";

/**
 * Helper function to extract covenant expansion signatures from delegation data.
 * These signatures are available after the expansion EOI is verified by Babylon.
 */
const getCovenantExpansionSignatures = (delegation: DelegationV2) => {
  if (!delegation?.covenantUnbondingSignatures) {
    return [];
  }

  return delegation.covenantUnbondingSignatures
    .filter((sig) => sig.stakeExpansionSignatureHex)
    .map((sig) => ({
      btcPkHex: sig.covenantBtcPkHex,
      sigHex: sig.stakeExpansionSignatureHex as string,
    }));
};

/**
 * Combines existing finality providers with newly selected BSN+FP pairs.
 */
const combineProviders = (
  existingProviders: string[],
  selectedBsnFps: Record<string, string>,
): string[] => {
  const newProviders = Object.values(selectedBsnFps);
  return [...existingProviders, ...newProviders];
};

/**
 * Fetches and validates transaction hex from mempool API.
 */
const fetchAndValidateTxHex = async (
  stakingTxHashHex: string,
): Promise<string> => {
  const txHex = await getTxHex(stakingTxHashHex);

  if (!txHex || typeof txHex !== "string" || txHex.length === 0) {
    throw new Error(`Failed to fetch transaction hex for ${stakingTxHashHex}`);
  }

  return txHex;
};

/**
 * Builds the standardized expansion input object for transaction operations.
 */
const buildExpansionInput = (
  formData: StakingExpansionFormData,
  allProviders: string[],
  previousStakingTxHex: string,
): BtcStakingExpansionInputs => ({
  finalityProviderPksNoCoordHex: allProviders,
  stakingAmountSat: formData.originalDelegation.stakingAmount,
  stakingTimelock: formData.stakingTimelock,
  previousStakingTxHex,
  previousStakingParamsVersion: formData.originalDelegation.paramsVersion,
  previousStakingInput: {
    finalityProviderPksNoCoordHex:
      formData.originalDelegation.finalityProviderBtcPksHex,
    stakingAmountSat: formData.originalDelegation.stakingAmount,
    stakingTimelock: formData.originalDelegation.stakingTimelock,
  },
});

/**
 * Hook providing staking expansion services and business logic.
 * Handles the complete expansion workflow from fee calculation to transaction submission.
 */
export function useStakingExpansionService() {
  const {
    setFormData,
    goToStep,
    setProcessing,
    setVerifiedDelegation,
    reset,
    addPendingExpansion,
    updateExpansionStatus,
    refetchExpansions,
  } = useStakingExpansionState();
  const { sendBbnTx } = useBbnTransaction();
  const {
    estimateStakingExpansionFee,
    createStakingExpansionEoi,
    submitStakingExpansionTx,
  } = useTransactionService();
  const { handleError } = useError();
  const { publicKeyNoCoord } = useBTCWallet();
  const logger = useLogger();
  const { isLoading: isUTXOsLoading, availableUTXOs } = useAppState();

  /**
   * Calculate the fee amount for a staking expansion transaction.
   */
  const calculateExpansionFeeAmount = useCallback(
    async (formData: StakingExpansionFormData) => {
      if (!validateExpansionFormData(formData)) {
        throw new ClientError(
          ERROR_CODES.VALIDATION_ERROR,
          "Invalid extension form data provided",
        );
      }

      // Check if UTXOs are still loading
      if (isUTXOsLoading || !availableUTXOs || availableUTXOs.length === 0) {
        throw new ClientError(
          ERROR_CODES.INITIALIZATION_ERROR,
          "Wallet UTXOs are still loading. Please wait a moment and try again.",
        );
      }

      try {
        const previousStakingTxHex = await fetchAndValidateTxHex(
          formData.originalDelegation.stakingTxHashHex,
        );

        const existingProviders =
          formData.originalDelegation.finalityProviderBtcPksHex || [];
        const allProviders = combineProviders(
          existingProviders,
          formData.selectedBsnFps,
        );

        const expansionInput = buildExpansionInput(
          formData,
          allProviders,
          previousStakingTxHex,
        );

        const feeAmount = estimateStakingExpansionFee(
          expansionInput,
          formData.feeRate,
        );

        return feeAmount;
      } catch (error) {
        throw new ClientError(
          ERROR_CODES.STAKING_EXPANSION_FEE_ERROR,
          "Failed to calculate extension fee",
          { cause: error },
        );
      }
    },
    [estimateStakingExpansionFee, isUTXOsLoading, availableUTXOs],
  );

  /**
   * Display the expansion preview with calculated fees and selected BSN+FP pairs.
   * This transitions the user to the preview step before signing.
   */
  const displayExpansionPreview = useCallback(
    (formFields: StakingExpansionFormData) => {
      if (!validateExpansionFormData(formFields)) {
        throw new Error("Cannot display preview with invalid form data");
      }

      setFormData(formFields);
      goToStep(StakingExpansionStep.PREVIEW);
    },
    [setFormData, goToStep],
  );

  const createExpansionEOI = useCallback(
    async (formData: StakingExpansionFormData) => {
      // Check if UTXOs are still loading
      if (isUTXOsLoading || !availableUTXOs || availableUTXOs.length === 0) {
        const clientError = new ClientError(
          ERROR_CODES.INITIALIZATION_ERROR,
          "Wallet UTXOs are still loading. Please wait a moment and try again.",
        );
        handleError({ error: clientError });
        reset();
        return;
      }

      try {
        const previousStakingTxHex = await fetchAndValidateTxHex(
          formData.originalDelegation.stakingTxHashHex,
        );

        const existingProviders =
          formData.originalDelegation.finalityProviderBtcPksHex || [];
        const allProviders = combineProviders(
          existingProviders,
          formData.selectedBsnFps,
        );

        const expansionInput = buildExpansionInput(
          formData,
          allProviders,
          previousStakingTxHex,
        );

        setProcessing(true);
        const { stakingTxHash, signedBabylonTx } =
          await createStakingExpansionEoi(expansionInput, formData.feeRate);
        await sendBbnTx(signedBabylonTx);
        // BBN transaction sent successfully

        // Create pending delegation object and add to state
        const pendingDelegation: DelegationV2 = {
          stakingTxHashHex: stakingTxHash,
          stakerBtcPkHex: publicKeyNoCoord,
          finalityProviderBtcPksHex: allProviders,
          stakingAmount: formData.originalDelegation.stakingAmount,
          stakingTxHex: "", // Will be filled when transaction is confirmed
          bbnInceptionHeight: 0,
          bbnInceptionTime: "",
          startHeight: 0,
          endHeight: 0,
          stakingTimelock: formData.stakingTimelock,
          unbondingTimelock: 0,
          unbondingTxHex: "",
          slashing: {
            stakingSlashingTxHex: "",
            unbondingSlashingTxHex: "",
            spendingHeight: 0,
          },
          state: DelegationState.INTERMEDIATE_PENDING_VERIFICATION,
          paramsVersion: formData.originalDelegation.paramsVersion || 0,
        };

        addPendingExpansion(pendingDelegation);
        goToStep(StakingExpansionStep.VERIFYING);

        // Poll for verification - same as regular staking flow
        const delegation = await retry(
          () => getDelegationV2(stakingTxHash),
          (delegation) => delegation?.state === DelegationState.VERIFIED,
          5 * ONE_SECOND,
        );

        setVerifiedDelegation(delegation as DelegationV2);
        refetchExpansions();
        goToStep(StakingExpansionStep.VERIFIED);
        setProcessing(false);
      } catch (error) {
        setProcessing(false);

        logger.error(error as Error);
        handleError({ error: error as Error });
        reset(); // Close the modal on error
      }
    },
    [
      createStakingExpansionEoi,
      sendBbnTx,
      setProcessing,
      setVerifiedDelegation,
      goToStep,
      addPendingExpansion,
      refetchExpansions,
      publicKeyNoCoord,
      logger,
      handleError,
      reset,
      isUTXOsLoading,
      availableUTXOs,
    ],
  );

  const stakeDelegationExpansion = useCallback(
    async (delegation: DelegationV2) => {
      // Check if UTXOs are still loading before starting
      if (isUTXOsLoading || !availableUTXOs || availableUTXOs.length === 0) {
        const clientError = new ClientError(
          ERROR_CODES.INITIALIZATION_ERROR,
          "Wallet UTXOs are still loading. Please wait a moment and try again.",
        );
        handleError({ error: clientError });
        reset();
        return;
      }

      try {
        setProcessing(true);

        // Validate that we have the required transaction data from the API
        if (!delegation.stakingTxHex) {
          throw new Error(
            "Missing staking_tx_hex from verified delegation. Cannot proceed with extension.",
          );
        }

        if (!delegation.stakingTxHashHex) {
          throw new Error(
            "Missing staking_tx_hash_hex from verified delegation. Cannot proceed with extension.",
          );
        }

        // Extract covenant expansion signatures from the delegation
        const covenantExpansionSignatures =
          getCovenantExpansionSignatures(delegation);

        if (
          !covenantExpansionSignatures ||
          covenantExpansionSignatures.length === 0
        ) {
          throw new Error(
            "No covenant extension signatures found in delegation. Make sure the extension EOI was verified by Babylon.",
          );
        }

        // Get the original delegation data if this is an expansion
        let previousStakingTxHex = delegation.stakingTxHex;
        let previousStakingInput = {
          finalityProviderPksNoCoordHex: delegation.finalityProviderBtcPksHex,
          stakingAmountSat: delegation.stakingAmount,
          stakingTimelock: delegation.stakingTimelock,
        };

        // If this is an expansion, fetch the original delegation data
        if (delegation.previousStakingTxHashHex) {
          const originalDelegation = await getDelegationV2(
            delegation.previousStakingTxHashHex,
          );

          // Critical security check: API failure returns null, which would cause
          // the expansion to proceed with incorrect transaction hex, creating a
          // malformed transaction. We must halt execution on API failure.
          if (!originalDelegation) {
            throw new ClientError(
              ERROR_CODES.DELEGATION_LOGIC_ERROR,
              `Failed to fetch original delegation data for ${delegation.previousStakingTxHashHex}. This is required to build a valid expansion transaction. Cannot proceed with expansion.`,
            );
          }

          // Validate that the original delegation has the required transaction hex
          if (!originalDelegation.stakingTxHex) {
            throw new ClientError(
              ERROR_CODES.MISSING_DATA_ERROR,
              `Original delegation ${delegation.previousStakingTxHashHex} is missing staking_tx_hex. Cannot proceed with expansion.`,
            );
          }

          previousStakingTxHex = originalDelegation.stakingTxHex;
          previousStakingInput = {
            finalityProviderPksNoCoordHex:
              originalDelegation.finalityProviderBtcPksHex,
            stakingAmountSat: originalDelegation.stakingAmount,
            stakingTimelock: originalDelegation.stakingTimelock,
          };

          // Defense-in-depth: Verify that we're not using the same transaction
          // as both the previous and current transaction, which would create
          // an invalid expansion transaction
          if (previousStakingTxHex === delegation.stakingTxHex) {
            throw new ClientError(
              ERROR_CODES.DELEGATION_LOGIC_ERROR,
              `Critical error: Previous and current staking transactions are identical. This would create a malformed expansion transaction. This likely indicates a data integrity issue.`,
            );
          }
        }

        // Create expansion input data
        const expansionInput: BtcStakingExpansionInputs = {
          finalityProviderPksNoCoordHex: delegation.finalityProviderBtcPksHex,
          stakingAmountSat: delegation.stakingAmount,
          stakingTimelock: delegation.stakingTimelock,
          previousStakingTxHex,
          previousStakingParamsVersion: delegation.paramsVersion || 0,
          previousStakingInput,
        };

        // Submit the staking expansion transaction using the verified delegation data
        await submitStakingExpansionTx(
          expansionInput,
          delegation.paramsVersion || 0,
          delegation.stakingTxHashHex,
          delegation.stakingTxHex,
          covenantExpansionSignatures,
        );

        // Update expansion status to pending BTC confirmation
        updateExpansionStatus(
          delegation.stakingTxHashHex,
          DelegationState.INTERMEDIATE_PENDING_BTC_CONFIRMATION,
        );

        // Mark expansion as broadcasted in localStorage for visibility tracking
        markExpansionAsBroadcasted(
          delegation.stakingTxHashHex,
          publicKeyNoCoord,
        );

        // Navigate to success modal
        goToStep(StakingExpansionStep.FEEDBACK_SUCCESS);
        setProcessing(false);
      } catch (error) {
        setProcessing(false);

        logger.error(error as Error);
        handleError({ error: error as Error });
        reset(); // Close the modal on error
      }
    },
    [
      setProcessing,
      goToStep,
      logger,
      handleError,
      submitStakingExpansionTx,
      updateExpansionStatus,
      reset,
      isUTXOsLoading,
      availableUTXOs,
      publicKeyNoCoord,
    ],
  );

  return {
    calculateExpansionFeeAmount,
    displayExpansionPreview,
    createExpansionEOI,
    stakeDelegationExpansion,
  };
}
