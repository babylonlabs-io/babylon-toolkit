import { Form } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { DeepPartial } from "react-hook-form";

import { AmountField } from "@/ui/baby/components/AmountField";
import { FeeField } from "@/ui/baby/components/FeeField";
import { useStakingState, type FormData } from "@/ui/baby/state/StakingState";
import { StakingModal } from "@/ui/baby/widgets/StakingModal";
import { SubmitButton } from "@/ui/baby/widgets/SubmitButton";
import { ValidatorField } from "@/ui/baby/widgets/ValidatorField";
import { FormAlert } from "@/ui/common/components/Multistaking/MultistakingForm/FormAlert";
import { useFormPersistenceState } from "@/ui/common/state/FormPersistenceState";

interface StakingFormProps {
  isGeoBlocked?: boolean;
}

/**
 * StakingForm supports multi-validator selection and draft persistence, so it
 * uses 'validatorAddresses' (string[]) instead of the single 'validatorAddress'
 * expected by 'FormData' in 'StakingState'.
 *
 * This interface removes 'validatorAddress' from 'FormData' and adds
 * 'validatorAddresses' to align with the validation schema and 'FormPersistenceState'.
 */
export interface StakingFormFields extends Omit<FormData, "validatorAddress"> {
  validatorAddresses: string[];
}

export default function StakingForm({
  isGeoBlocked = false,
}: StakingFormProps) {
  const {
    loading,
    formSchema,
    availableBalance,
    babyPrice,
    calculateFee,
    showPreview,
    disabled,
  } = useStakingState();

  const { babyStakeDraft, setBabyStakeDraft } = useFormPersistenceState();

  const defaultValues = useMemo<Partial<StakingFormFields>>(() => {
    return {
      amount: babyStakeDraft?.amount,
      validatorAddresses: babyStakeDraft?.validatorAddresses,
      feeAmount: babyStakeDraft?.feeAmount,
    };
  }, [babyStakeDraft]);

  const handlePreview = ({
    amount,
    validatorAddresses,
    feeAmount,
  }: Required<StakingFormFields>) => {
    showPreview({
      amount,
      feeAmount,
      validatorAddress: validatorAddresses[0],
    });
  };

  const handleChange = (data: DeepPartial<StakingFormFields>) => {
    setBabyStakeDraft({
      ...data,
      validatorAddresses: data.validatorAddresses?.filter(
        (i) => i !== undefined,
      ),
    });
  };

  return (
    <Form
      schema={formSchema}
      className="flex h-[500px] flex-col gap-2"
      onSubmit={handlePreview}
      defaultValues={defaultValues}
      onChange={handleChange}
    >
      <AmountField balance={availableBalance} price={babyPrice} />
      <ValidatorField />
      <FeeField babyPrice={babyPrice} calculateFee={calculateFee} />

      <SubmitButton disabled={loading} isGeoBlocked={isGeoBlocked} />
      <StakingModal />
      <FormAlert {...disabled} />
    </Form>
  );
}
