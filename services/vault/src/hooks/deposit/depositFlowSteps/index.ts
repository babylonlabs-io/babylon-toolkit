/**
 * Deposit flow step functions
 *
 * These functions contain the business logic for each step of the deposit flow.
 * They are pure (no React state) and can be easily tested.
 * The deposit flow hook orchestrates these functions and manages state.
 *
 * Flow steps (align with the `DepositFlowStep` enum):
 * 0. Validation - validateMultiVaultDepositInputs
 * 1. Get ETH wallet - getEthWalletClient
 * 2a. Prepare pegin - preparePegin (build + fund BTC tx)
 * 2b. Sign proof of possession - signProofOfPossession (one BIP-322 wallet popup)
 * 2c. Register pegin batch - registerPeginBatchAndWait (single ETH tx for all vaults)
 * 3. Broadcast Pre-PegIn - inlined in useDepositFlow (calls broadcastPrePeginTransaction directly)
 * 3.5. WOTS key RPC submission - submitWotsPublicKey
 * 4. Payout signing - signAndSubmitPayouts
 */

// Types and enums
export { DepositFlowStep } from "./types";
export type {
  DepositUtxo,
  PeginBatchRegisterParams,
  PeginBatchRegisterResult,
  UtxoRef,
  WotsSubmissionParams,
} from "./types";

// Step 0: Validation (from service layer)
export { validateMultiVaultDepositInputs } from "./validation";
export type { VaultMultiVaultDepositInputs } from "./validation";

// Steps 1-3: ETH wallet, proof of possession, pegin submission
export {
  getEthWalletClient,
  registerPeginBatchAndWait,
  signProofOfPossession,
} from "./ethereumSubmit";

// Step 3.5: WOTS key submission (RPC, happens after broadcast + VP indexing)
export { submitWotsPublicKey, waitForWotsReadiness } from "./wotsSubmission";
export type {
  WaitForWotsReadinessParams,
  WotsReadinessResult,
} from "./wotsSubmission";

export {
  isPayoutReadinessTimeout,
  waitForPayoutReadiness,
} from "./payoutReadiness";
export type {
  PayoutReadinessResult,
  WaitForPayoutReadinessParams,
} from "./payoutReadiness";
// Step 4: Payout signing
export { payoutSigningStep, signAndSubmitPayouts } from "./payoutSigning";
export type { SignAndSubmitPayoutsParams } from "./payoutSigning";
