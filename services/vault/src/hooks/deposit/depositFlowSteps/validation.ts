/**
 * Step 0: Validation for deposit flow
 */

import { depositService } from "@/services/deposit";

import type { DepositValidationParams } from "./types";

/**
 * Validate all deposit inputs before starting the flow.
 * Throws an error if any validation fails.
 */
export function validateDepositInputs(params: DepositValidationParams): void {
  const {
    btcAddress,
    depositorEthAddress,
    amount,
    selectedProviders,
    confirmedUTXOs,
    isUTXOsLoading,
    utxoError,
    vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys,
  } = params;

  if (!btcAddress) {
    throw new Error("BTC wallet not connected");
  }
  if (!depositorEthAddress) {
    throw new Error("ETH wallet not connected");
  }

  // TODO: Min and Max values to be fetched from contract
  const amountValidation = depositService.validateDepositAmount(
    amount,
    10000n, // MIN_DEPOSIT
    21000000_00000000n, // MAX_DEPOSIT
  );
  if (!amountValidation.valid) {
    throw new Error(amountValidation.error);
  }

  if (selectedProviders.length === 0) {
    throw new Error("No providers selected");
  }

  // Validate vault keepers - required for Taproot script construction
  if (!vaultKeeperBtcPubkeys || vaultKeeperBtcPubkeys.length === 0) {
    throw new Error(
      "No vault keepers available. The system requires at least one vault keeper to create a deposit.",
    );
  }

  // Validate universal challengers - required for Taproot script construction
  if (
    !universalChallengerBtcPubkeys ||
    universalChallengerBtcPubkeys.length === 0
  ) {
    throw new Error(
      "No universal challengers available. The system requires at least one universal challenger to create a deposit.",
    );
  }

  if (isUTXOsLoading) {
    throw new Error("Loading UTXOs...");
  }
  if (utxoError) {
    throw new Error(`Failed to load UTXOs: ${utxoError.message}`);
  }
  if (!confirmedUTXOs || confirmedUTXOs.length === 0) {
    throw new Error("No confirmed UTXOs available");
  }
}
