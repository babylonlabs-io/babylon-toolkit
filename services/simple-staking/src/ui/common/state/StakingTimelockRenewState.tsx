import { EventData, RegistrationStep } from "@babylonlabs-io/btc-staking-ts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useCosmosWallet } from "@/ui/common/context/wallet/CosmosWalletProvider";
import { useDelegationsV2 } from "@/ui/common/hooks/client/api/useDelegationsV2";
import { useDelegationStorage } from "@/ui/common/hooks/storage/useDelegationStorage";
import { useEventBus } from "@/ui/common/hooks/useEventBus";
import type {
  DelegationV2,
  DelegationWithFP,
} from "@/ui/common/types/delegationsV2";
import { createStateUtils } from "@/ui/common/utils/createStateUtils";
import { getRenewalDelegationsLocalStorageKey } from "@/ui/common/utils/local_storage/getExpansionsLocalStorageKey";
import FeatureFlags from "@/ui/common/utils/FeatureFlagService";

import {
  StakingTimelockRenewStep,
  type StakingTimelockRenewFormData,
  type StakingTimelockRenewState,
} from "./StakingTimelockRenewTypes";

const RENEWAL_STEP_MAP: Record<RegistrationStep, StakingTimelockRenewStep> = {
  "staking-slashing": StakingTimelockRenewStep.EOI_STAKING_SLASHING,
  "unbonding-slashing": StakingTimelockRenewStep.EOI_UNBONDING_SLASHING,
  "proof-of-possession": StakingTimelockRenewStep.EOI_PROOF_OF_POSSESSION,
  "create-btc-delegation-msg": StakingTimelockRenewStep.EOI_SIGN_BBN,
};

const { StateProvider, useState: useStakingTimelockRenewState } =
  createStateUtils<StakingTimelockRenewState>({
    hasError: false,
    processing: false,
    errorMessage: undefined,
    formData: undefined,
    step: undefined,
    verifiedDelegation: undefined,
    goToStep: () => {},
    setProcessing: () => {},
    setFormData: () => {},
    setVerifiedDelegation: () => {},
    reset: () => {},
    renewalStepOptions: undefined,
    setRenewalStepOptions: () => {},
    isRenewalModalOpen: false,
    verifiedRenewalModalOpen: false,
    setVerifiedRenewalModalOpen: () => {},
    selectedDelegationForVerifiedRenewalModal: null,
    setSelectedDelegationForVerifiedRenewalModal: () => {},
    renewalDelegations: [],
    addPendingRenewal: () => {},
    updateRenewalStatus: () => {},
    refetchRenewalDelegations: async () => {},
  });

/**
 * Provider component for staking expansion state management.
 * Wraps the application with expansion-specific state and methods.
 */
export function StakingTimelockRenewState({ children }: PropsWithChildren) {
  const eventBus = useEventBus();
  const { publicKeyNoCoord, failedBtcAddressRiskAssessment } = useBTCWallet();
  const { bech32Address } = useCosmosWallet();

  // Fetch delegations from API for expansion storage sync
  const { data, refetch } = useDelegationsV2(bech32Address);

  // Expansion-specific storage using the same pattern as regular delegations
  const {
    delegations: renewalDelegations,
    addPendingDelegation: addPendingRenewal,
    updateDelegationStatus: updateRenewalStatus,
  } = useDelegationStorage(
    getRenewalDelegationsLocalStorageKey(publicKeyNoCoord),
    data?.delegations,
  );

  const [hasError, setHasError] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [formData, setFormData] = useState<
    StakingTimelockRenewFormData | undefined
  >();
  const [step, setStep] = useState<StakingTimelockRenewStep | undefined>();
  const [verifiedDelegation, setVerifiedDelegation] = useState<
    DelegationV2 | undefined
  >();
  const [renewalStepOptions, setRenewalStepOptions] = useState<
    EventData | undefined
  >();
  const [verifiedRenewalModalOpen, setVerifiedRenewalModalOpen] =
    useState(false);
  const [
    selectedDelegationForVerifiedRenewalModal,
    setSelectedDelegationForVerifiedRenewalModal,
  ] = useState<DelegationWithFP | null>(null);

  const renewalDisabled = useMemo(() => {
    if (FeatureFlags.IsTestnetSunsetEnabled) {
      return true;
    }
    return failedBtcAddressRiskAssessment;
  }, [failedBtcAddressRiskAssessment]);

  useEffect(() => {
    // The `delegation:expand` is defined in the staking ts as a generic event
    // for all expansion operations including the timelock renewal operation
    const unsubscribe = eventBus.on("delegation:expand", (options) => {
      const type = options?.type as RegistrationStep | undefined;

      if (type) {
        const stepName = RENEWAL_STEP_MAP[type];
        if (stepName) {
          setStep(stepName);
          setRenewalStepOptions(options);
        }
      }
    });

    return unsubscribe;
  }, [setStep, setRenewalStepOptions, eventBus]);

  const goToStep = useCallback(
    (step: StakingTimelockRenewStep, options?: EventData) => {
      setStep(step);
      if (options) {
        setRenewalStepOptions(options);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setHasError(false);
    setProcessing(false);
    setErrorMessage(undefined);
    setFormData(undefined);
    setStep(undefined);
    setVerifiedDelegation(undefined);
    setRenewalStepOptions(undefined);
    setVerifiedRenewalModalOpen(false);
    setSelectedDelegationForVerifiedRenewalModal(null);
  }, []);

  // Computed state: true when any expansion-related modal is open
  const isRenewalModalOpen = Boolean(step) || verifiedRenewalModalOpen;

  const refetchRenewalDelegations = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const state: StakingTimelockRenewState = useMemo(
    () => ({
      // State values
      hasError,
      processing,
      renewalDelegations,
      refetchRenewalDelegations,
      errorMessage,
      formData,
      step,
      verifiedDelegation,
      renewalStepOptions,
      verifiedRenewalModalOpen,
      selectedDelegationForVerifiedRenewalModal,
      isRenewalModalOpen,
      renewalDisabled,
      // Stable functions (created with useCallback)
      goToStep,
      setProcessing,
      setFormData,
      setVerifiedDelegation,
      reset,
      setRenewalStepOptions,
      setVerifiedRenewalModalOpen,
      setSelectedDelegationForVerifiedRenewalModal,
      addPendingRenewal,
      updateRenewalStatus,
    }),
    [
      hasError,
      processing,
      errorMessage,
      formData,
      step,
      verifiedDelegation,
      renewalStepOptions,
      verifiedRenewalModalOpen,
      selectedDelegationForVerifiedRenewalModal,
      isRenewalModalOpen,
      renewalDelegations,
      renewalDisabled,
      goToStep,
      reset,
      addPendingRenewal,
      updateRenewalStatus,
      refetchRenewalDelegations,
    ],
  );

  return <StateProvider value={state}>{children}</StateProvider>;
}

export { useStakingTimelockRenewState };
