import { useMemo, useState, type PropsWithChildren } from "react";

import { type MultistakingFormFields } from "@/ui/common/state/MultistakingState";
import { createStateUtils } from "@/ui/common/utils/createStateUtils";
import { type StakingFormFields } from "@/ui/baby/widgets/StakingForm";

interface FormPersistenceContext {
  btcStakeDraft?: Partial<MultistakingFormFields> | undefined;
  babyStakeDraft?: Partial<StakingFormFields> | undefined;
  setBtcStakeDraft: (draft?: Partial<MultistakingFormFields>) => void;
  setBabyStakeDraft: (draft?: Partial<StakingFormFields>) => void;
}

const { StateProvider, useState: useFormPersistenceState } =
  createStateUtils<FormPersistenceContext>({
    btcStakeDraft: undefined,
    babyStakeDraft: undefined,
    setBtcStakeDraft: () => {},
    setBabyStakeDraft: () => {},
  });

export function FormPersistenceState({ children }: PropsWithChildren) {
  const [btcStakeDraft, setBtcStakeDraft] = useState<
    Partial<MultistakingFormFields> | undefined
  >(undefined);
  const [babyStakeDraft, setBabyStakeDraft] = useState<
    Partial<StakingFormFields> | undefined
  >(undefined);

  const context = useMemo(
    () => ({
      btcStakeDraft,
      babyStakeDraft,
      setBtcStakeDraft,
      setBabyStakeDraft,
    }),
    [btcStakeDraft, babyStakeDraft, setBtcStakeDraft, setBabyStakeDraft],
  );

  return <StateProvider value={context}>{children}</StateProvider>;
}

export { useFormPersistenceState };
