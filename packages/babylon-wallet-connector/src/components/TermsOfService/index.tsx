import { Button, Checkbox, DialogBody, DialogFooter, DialogHeader, Text } from "@babylonlabs-io/core-ui";
import { useCallback, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

import { FieldControl } from "@/components/FieldControl";
import { BTCConfig } from "@/core/types";

export interface Props {
  className?: string;
  config?: BTCConfig;
  onClose?: () => void;
  onSubmit?: () => void;
  simplifiedTerms?: boolean;
}

const defaultState = {
  termsOfUse: false,
  inscriptions: false,
} as const;

export function TermsOfService({ className, onClose, onSubmit, simplifiedTerms = false }: Props) {
  const [state, setState] = useState(defaultState);
  const valid = useMemo(
    () => (simplifiedTerms ? state.termsOfUse : Object.values(state).every((val) => val)),
    [state, simplifiedTerms],
  );

  const handleChange = useCallback(
    (key: keyof typeof defaultState) =>
      (value: boolean = false) => {
        setState((state) => ({ ...state, [key]: value }));
      },
    [],
  );

  return (
    <div className={twMerge("flex flex-1 flex-col", className)}>
      <DialogHeader className="mb-6 text-accent-primary" title="Connect Wallets" onClose={onClose}>
        <Text className="text-accent-secondary">Please read and accept the following terms</Text>
      </DialogHeader>

      <DialogBody>
        <FieldControl
          label={
            <div className="block">
              I certify that I have read and accept the updated{" "}
              <a
                href="https://babylonlabs.io/terms-of-use"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Terms of Use
              </a>{" "}
              and{" "}
              <a
                href="https://babylonlabs.io/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Privacy Policy
              </a>
              .
            </div>
          }
          className="mb-4"
        >
          <Checkbox checked={state["termsOfUse"]} onChange={handleChange("termsOfUse")} />
        </FieldControl>

        {!simplifiedTerms && (
          <FieldControl
            label="I certify that I wish to create a Bitcoin vault and agree that doing so may cause some or all of the bitcoin ordinals, NFTs, Runes, and other inscriptions in the connected bitcoin wallet to be lost. I acknowledge that this interface will not detect all Inscriptions."
            className="mb-4"
          >
            <Checkbox checked={state["inscriptions"]} onChange={handleChange("inscriptions")} />
          </FieldControl>
        )}
      </DialogBody>

      <DialogFooter className="mt-auto pt-6">
        <Button disabled={!valid} fluid onClick={onSubmit} data-testid="terms-next-button">
          Next
        </Button>
      </DialogFooter>
    </div>
  );
}
