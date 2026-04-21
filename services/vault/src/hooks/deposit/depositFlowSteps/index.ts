/**
 * Deposit flow step functions
 *
 * These functions contain the business logic for each step of the deposit flow.
 * They are pure (no React state) and can be easily tested.
 * The deposit flow hook orchestrates these functions and manages state.
 *
 * Flow steps:
 * 0. Validation - validateMultiVaultDepositInputs
 * 1. Get ETH wallet - getEthWalletClient
 * 2a. Prepare pegin - preparePegin (build + fund BTC tx)
 * 2b. Register pegin batch - registerPeginBatchAndWait (PoP + single ETH tx)
 * 2.5. WOTS key RPC submission - submitWotsPublicKey
 * 3. Payout signing - signAndSubmitPayouts
 * 4. Broadcast - waitForContractVerification, broadcastBtcTransaction
 */

// Types and enums
export { DepositFlowStep } from "./types";
export type {
  BroadcastParams,
  DepositUtxo,
  PeginBatchRegisterParams,
  PeginBatchRegisterResult,
  UtxoRef,
  WotsSubmissionParams,
} from "./types";

// Step 0: Validation (from service layer)
export { validateMultiVaultDepositInputs } from "./validation";
export type { VaultMultiVaultDepositInputs } from "./validation";

// Steps 1-2: ETH wallet and pegin submission
export {
  getEthWalletClient,
  registerPeginBatchAndWait,
} from "./ethereumSubmit";

// Step 2.5: WOTS key submission
export { submitWotsPublicKey } from "./wotsSubmission";

// Step 3: Payout signing
export { signAndSubmitPayouts } from "./payoutSigning";
export type { SignAndSubmitPayoutsParams } from "./payoutSigning";

// Step 4: Broadcast
export {
  broadcastBtcTransaction,
  waitForContractVerification,
} from "./broadcast";
