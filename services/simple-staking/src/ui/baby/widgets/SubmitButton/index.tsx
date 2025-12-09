import { Button, useFormState } from "@babylonlabs-io/core-ui";

import { ConnectButton } from "@/ui/baby/components/ConnectButton";
import { useStakingState } from "@/ui/baby/state/StakingState";
import { AuthGuard } from "@/ui/common/components/Common/AuthGuard";

interface SubmitButton {
  disabled?: boolean;
  isGeoBlocked?: boolean;
  onClick?: () => void;
}

export function SubmitButton({
  disabled = false,
  isGeoBlocked = false,
  onClick,
}: SubmitButton) {
  const { isValid, errors } = useFormState();
  const { fields } = useStakingState();
  const errorField = fields.find((fieldName) => errors[fieldName]);

  return (
    <AuthGuard
      geoBlocked={isGeoBlocked}
      fallback={<ConnectButton disabled={disabled || isGeoBlocked} />}
    >
      <Button
        type="submit"
        disabled={disabled || !isValid}
        className="mt-2 w-full capitalize disabled:!bg-accent-primary/10 disabled:!text-accent-primary"
        onClick={onClick}
      >
        {errorField ? errors[errorField]?.message?.toString() : "Preview"}
      </Button>
    </AuthGuard>
  );
}
