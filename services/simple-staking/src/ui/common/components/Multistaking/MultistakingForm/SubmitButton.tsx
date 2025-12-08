import { Button, useFormState } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

import { STAKING_DISABLED } from "@/ui/common/constants";
import { useFormError } from "@/ui/common/hooks/useFormError";
import { useStakingState } from "@/ui/common/state/StakingState";

const BUTTON_STYLES: Record<string, string> = {
  error: "disabled:!text-error-main disabled:!bg-error-main/10",
  default: "",
};

export function SubmitButton() {
  const { isValid, isValidating, isLoading } = useFormState();
  const { blocked: isGeoBlocked, disabled: stakingDisabled } =
    useStakingState();
  const error = useFormError();

  const renderText = () => {
    if (isValidating) {
      return "Calculating...";
    }

    if (isLoading) {
      return "Loading...";
    }

    if (error) {
      return error.message;
    }

    return "Preview";
  };

  return (
    <Button
      type="submit"
      className={twMerge(
        "mt-2 w-full capitalize disabled:!bg-accent-primary/10 disabled:!text-accent-primary",
        error?.level && BUTTON_STYLES[error.level],
      )}
      disabled={
        !isValid ||
        isValidating ||
        isLoading ||
        STAKING_DISABLED ||
        isGeoBlocked ||
        stakingDisabled !== undefined
      }
    >
      {renderText()}
    </Button>
  );
}
