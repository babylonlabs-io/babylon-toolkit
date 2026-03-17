import {
  Button,
  Checkbox,
  Copy,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
  Warning,
} from "@babylonlabs-io/core-ui";
import { sha256 } from "@noble/hashes/sha2.js";
import { useRef, useState } from "react";
import type { Hex } from "viem";

interface AtomicSwapSecretModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (secretHex: string, secretHash: Hex) => void;
}

function generateSecretHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function AtomicSwapSecretModal({
  open,
  onClose,
  onComplete,
}: AtomicSwapSecretModalProps) {
  const secretRef = useRef<string>(generateSecretHex());
  const [acknowledged, setAcknowledged] = useState(false);

  const handleContinue = () => {
    const secretBytes = Uint8Array.from(
      secretRef.current.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );
    const hashBytes = sha256(secretBytes);
    const hashHex: Hex = `0x${Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
    onComplete(secretRef.current, hashHex);
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title="Save Your Secret Key"
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-4 pt-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          This secret key is required to activate your vault after your BTC
          deposit is confirmed. Copy it and store it somewhere safe before
          continuing.
        </Text>

        <Copy value={secretRef.current} className="w-full">
          <div className="bg-surface-secondary cursor-pointer rounded-md px-4 py-3">
            <Text
              variant="body2"
              className="break-all font-mono text-accent-primary"
            >
              {secretRef.current}
            </Text>
          </div>
        </Copy>

        <Warning>
          If you lose this secret, you will be unable to activate your vault.
          You will have to wait for the refund timelock to reclaim your BTC.
        </Warning>

        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={acknowledged}
            onChange={() => setAcknowledged((v) => !v)}
            variant="default"
            showLabel={false}
          />
          <Text variant="body2" className="text-accent-primary">
            I have saved my secret key in a safe place
          </Text>
        </label>
      </DialogBody>

      <DialogFooter className="px-4 pb-6 sm:px-6">
        <Button
          variant="contained"
          className="w-full"
          disabled={!acknowledged}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </DialogFooter>
    </ResponsiveDialog>
  );
}
