import { Button, Checkbox, DialogBody, DialogFooter, DialogHeader, Radio, Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import { FieldControl } from "@/components/FieldControl";
import { BTCConfig } from "@/core/types";

export interface Props {
  className?: string;
  onSubmit?: (value: boolean, showAgain: boolean) => void;
  config?: BTCConfig;
}

export function Inscriptions({ className, config, onSubmit }: Props) {
  const [lockInscriptions = true, toggleInscriptions] = useState<boolean | undefined>();
  const [showAgain = true, toggleShowAgain] = useState<boolean | undefined>();

  if (!config) return null;

  const { coinName } = config;

  return (
    <div className={twMerge("flex flex-1 flex-col", className)}>
      <DialogHeader
        title={`Manage ${coinName} Inscriptions`}
        className="mb-4 text-accent-primary"
        onClose={() => void onSubmit?.(lockInscriptions, showAgain)}
      />

      <DialogBody>
        <Text className="mb-8 text-accent-secondary">
          By default, we will not use {coinName} that contains Inscriptions - such as Ordinals, NFTs, or Runes - when
          creating a BTC vault. This helps prevent any accidental loss of your Inscriptions due to transaction fees.
        </Text>
        <Text className="mb-10 text-accent-secondary">
          If you would like to include {coinName} with Inscriptions when creating a BTC vault, please select the option
          below.
        </Text>

        <form action="">
          <FieldControl
            label={
              <div>
                <strong className="mr-2">Do not use</strong> {coinName} with Inscriptions for BTC vaults. (Recommended)
              </div>
            }
            className="mb-8"
          >
            <Radio name="inscriptions" checked={lockInscriptions} onChange={() => toggleInscriptions(true)} />
          </FieldControl>

          <FieldControl
            label={
              <div>
                <strong className="mr-2">Use</strong> {coinName} with Inscriptions when creating a BTC vault.
              </div>
            }
            className="mb-8"
          >
            <Radio name="inscriptions" checked={!lockInscriptions} onChange={() => toggleInscriptions(false)} />
          </FieldControl>
        </form>
      </DialogBody>

      <DialogFooter className="mt-auto pt-10">
        <Checkbox
          checked={!showAgain}
          label="Do not show again"
          labelClassName="mb-6"
          onChange={(value) => toggleShowAgain(!value)}
        />

        <Button fluid onClick={() => void onSubmit?.(lockInscriptions, showAgain)}>
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}
