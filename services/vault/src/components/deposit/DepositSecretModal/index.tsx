import {
  Button,
  Checkbox,
  CheckIcon,
  CopyIcon,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
  useCopy,
  Warning,
} from "@babylonlabs-io/core-ui";
import { useState } from "react";
import type { Hex } from "viem";

import { hashSecret } from "@/utils/secretUtils";

interface DepositSecretModalProps {
  open: boolean;
  onClose: () => void;
  secretHex: string;
  /** Optional label shown in the title, e.g. "Vault 1 of 2" */
  vaultLabel?: string;
  onComplete: (secretHex: string, secretHash: Hex) => void;
}

export function DepositSecretModal({
  open,
  onClose,
  secretHex,
  vaultLabel,
  onComplete,
}: DepositSecretModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const { isCopied, copyToClipboard } = useCopy();
  const copied = isCopied(secretHex);

  const handleContinue = () => {
    onComplete(secretHex, hashSecret(secretHex));
  };

  return (
    <ResponsiveDialog open={open} onClose={onClose}>
      <DialogHeader
        title={
          vaultLabel
            ? `Save Your Secret Key — ${vaultLabel}`
            : "Save Your Secret Key"
        }
        onClose={onClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-4 pt-4 text-accent-primary sm:px-6">
        <Text variant="body2" className="text-accent-secondary">
          This secret key is required to activate your vault after your BTC
          deposit is confirmed. Copy it and store it somewhere safe before
          continuing.
        </Text>

        <div className="bg-surface-secondary flex items-center gap-3 rounded-md border border-secondary-strokeLight px-4 py-3">
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer break-all text-left font-mono text-xs text-accent-primary"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Hide secret key" : "Reveal secret key"}
          >
            {revealed ? secretHex : "•".repeat(secretHex.length)}
          </button>
          <button
            type="button"
            className="flex shrink-0 cursor-pointer items-center"
            onClick={() => copyToClipboard(secretHex, secretHex)}
            aria-label={copied ? "Copied" : "Copy secret key"}
          >
            {copied ? (
              <CheckIcon size={16} variant="success" />
            ) : (
              <CopyIcon size={16} variant="secondary" />
            )}
          </button>
        </div>

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
