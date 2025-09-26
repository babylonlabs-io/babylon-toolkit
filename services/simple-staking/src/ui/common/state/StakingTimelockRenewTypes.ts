import type { EventData } from "@babylonlabs-io/btc-staking-ts";

import { BaseStakingStep, EOIStep } from "@/ui/common/constants";
import type {
  DelegationV2,
  DelegationV2StakingState,
  DelegationWithFP,
} from "@/ui/common/types/delegationsV2";

/**
 * Enum representing the different steps in the staking renewal workflow.
 * Extends shared EOI steps to avoid code duplication.
 */
export enum StakingTimelockRenewStep {
  /** Step for showing renewal timelock information */
  RENEWAL_TIMELOCK = "renewal-timelock",
  /** Base workflow steps - reuse shared base steps */
  PREVIEW = BaseStakingStep.PREVIEW,
  /** EOI signing steps - reuse shared EOI steps */
  EOI_STAKING_SLASHING = EOIStep.EOI_STAKING_SLASHING,
  EOI_UNBONDING_SLASHING = EOIStep.EOI_UNBONDING_SLASHING,
  EOI_PROOF_OF_POSSESSION = EOIStep.EOI_PROOF_OF_POSSESSION,
  EOI_SIGN_BBN = EOIStep.EOI_SIGN_BBN,
  EOI_SEND_BBN = EOIStep.EOI_SEND_BBN,
  /** Final steps */
  VERIFYING = BaseStakingStep.VERIFYING,
  VERIFIED = BaseStakingStep.VERIFIED,
  FEEDBACK_SUCCESS = BaseStakingStep.FEEDBACK_SUCCESS,
  FEEDBACK_CANCEL = BaseStakingStep.FEEDBACK_CANCEL,
}

/**
 * Form data interface for staking renewal operations.
 * Contains all necessary information to execute a renewal transaction.
 */
export interface StakingTimelockRenewFormData {
  /** The original delegation being renewed */
  originalDelegation: DelegationWithFP;
  /** Fee rate in sat/vB for the renewal transaction */
  feeRate: number;
  /** Calculated fee amount in satoshis */
  feeAmount: number;
  /** Staking timelock in blocks */
  stakingTimelock: number;
}

/**
 * Main state interface for staking renewal workflow management.
 */
export interface StakingTimelockRenewState {
  // Core state properties
  /** Indicates if there's an error in the renewal process */
  hasError: boolean;
  /** Indicates if an operation is currently in progress */
  processing: boolean;
  /** Human-readable error message for user display */
  errorMessage?: string;
  /** Current form data for the renewal */
  formData?: StakingTimelockRenewFormData;
  /** Current step in the renewal workflow */
  step?: StakingTimelockRenewStep;
  /** Verified delegation data after BBN verification */
  verifiedDelegation?: DelegationV2;
  /** Event data options for current step */
  renewalStepOptions: EventData | undefined;
  /** Computed state: true when any renewal-related modal is open */
  isRenewalModalOpen: boolean;
  /** Whether the verified renewal modal is open */
  verifiedRenewalModalOpen: boolean;
  /** Set verified renewal modal open state */
  setVerifiedRenewalModalOpen: (open: boolean) => void;
  /** Selected delegation for filtering verified renewals */
  selectedDelegationForVerifiedRenewalModal: DelegationWithFP | null;
  /** Set selected delegation for verified modal */
  setSelectedDelegationForVerifiedRenewalModal: (
    delegation: DelegationWithFP | null,
  ) => void;

  // Core actions
  /** Navigate to a specific step in the renewal flow */
  goToStep: (step: StakingTimelockRenewStep, options?: EventData) => void;
  /** Set processing state */
  setProcessing: (value: boolean) => void;
  /** Update form data */
  setFormData: (formData?: StakingTimelockRenewFormData) => void;
  /** Set verified delegation after BBN verification */
  setVerifiedDelegation: (value?: DelegationV2) => void;
  /** Reset all state to initial values */
  reset: () => void;
  /** Set options for current renewal step */
  setRenewalStepOptions: (options?: EventData) => void;

  // Renewal storage functions
  /** List of renewal delegations (pending and from API) */
  renewalDelegations: DelegationV2[];
  /** Add a pending renewal to local storage */
  addPendingRenewal: (renewal: DelegationV2) => void;
  /** Update renewal status in local storage */
  updateRenewalStatus: (id: string, status: DelegationV2StakingState) => void;
  /** Refetch renewals from API to trigger cleanup */
  refetchRenewalDelegations: () => Promise<void>;
}
