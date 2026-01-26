/**
 * Deposit flow step functions
 *
 * These functions contain the business logic for each step of the deposit flow.
 * They are pure (no React state) and can be easily tested.
 * The useDepositFlow hook orchestrates these functions and manages state.
 *
 * Flow steps:
 * 0. Validation - validateDepositInputs
 * 1. Get ETH wallet - getEthWalletClient
 * 2. Submit pegin - submitPeginAndWait, savePendingPegin
 * 3. Payout signing - pollAndPreparePayoutSigning, submitPayoutSignatures
 * 4. Broadcast - waitForContractVerification, broadcastBtcTransaction
 */

// Types and enums
export { DepositStep } from "./types";
export type {
  BroadcastParams,
  DepositFlowResult,
  DepositUtxo,
  PayoutSigningContext,
  PayoutSigningParams,
  PeginSubmitParams,
  PeginSubmitResult,
  SavePendingPeginParams,
  UtxoRef,
} from "./types";

// Step 0: Validation (from service layer)
export { validateDepositInputs } from "./validation";
export type { DepositFlowInputs } from "./validation";

// Steps 1-2: ETH wallet and pegin submission
export {
  getEthWalletClient,
  savePendingPegin,
  submitPeginAndWait,
} from "./ethereumSubmit";

// Step 3: Payout signing
export {
  pollAndPreparePayoutSigning,
  submitPayoutSignatures,
} from "./payoutSigning";

// Step 4: Broadcast
export {
  broadcastBtcTransaction,
  waitForContractVerification,
} from "./broadcast";
