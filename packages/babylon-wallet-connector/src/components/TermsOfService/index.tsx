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
}

const defaultState = {
  termsOfUse: false,
  inscriptions: false,
  staking: false,
} as const;

export function TermsOfService({ className, onClose, onSubmit }: Props) {
  const [state, setState] = useState(defaultState);
  const valid = useMemo(() => Object.values(state).every((val) => val), [state]);

  const handleChange = useCallback(
    (key: keyof typeof defaultState) =>
      (value: boolean = false) => {
        setState((state) => ({ ...state, [key]: value }));
      },
    [],
  );

  return (
    <div className={twMerge("flex flex-1 flex-col", className)}>
      <DialogHeader className="mb-10 text-accent-primary" title="Connect Wallets" onClose={onClose}>
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
          className="mb-8"
        >
          <Checkbox checked={state["termsOfUse"]} onChange={handleChange("termsOfUse")} />
        </FieldControl>

        <FieldControl
          label="I certify that I wish to stake bitcoin and agree that doing so may cause some or all of the bitcoin ordinals, NFTs, Runes, and other inscriptions in the connected bitcoin wallet to be lost. I acknowledge that this interface will not detect all Inscriptions."
          className="mb-8"
        >
          <Checkbox checked={state["inscriptions"]} onChange={handleChange("inscriptions")} />
        </FieldControl>

        <FieldControl label="I acknowledge that the following are the only hardware wallets supporting Bitcoin Staking: (1) Keystone -- via QR code and (2) OneKey -- via the OneKey Chrome extension and the hardware devices (a) OneKey Pro and (b) OneKey Classic 1s (experimental, 3.10.1 firmware or higher) using Taproot only. Using any other hardware wallet through any means (such as connection to a software/extension/mobile wallet) can lead to permanent inability to withdraw the stake.">
          <Checkbox checked={state["staking"]} onChange={handleChange("staking")} />
        </FieldControl>
      </DialogBody>

      <DialogFooter className="mt-auto pt-10">
        <Button disabled={!valid} fluid onClick={onSubmit}>
          Next
        </Button>
      </DialogFooter>
    </div>
  );
}
