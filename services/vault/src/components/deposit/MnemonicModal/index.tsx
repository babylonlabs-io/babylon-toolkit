import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  ResponsiveDialog,
  Text,
  Warning,
} from "@babylonlabs-io/core-ui";
import { useEffect } from "react";

import { MnemonicStep, useMnemonicFlow } from "@/hooks/deposit/useMnemonicFlow";

import { ImportForm } from "./ImportForm";
import { VerificationForm } from "./VerificationForm";
import { WordGrid } from "./WordGrid";

interface MnemonicModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function MnemonicModal({
  open,
  onClose,
  onComplete,
}: MnemonicModalProps) {
  const {
    step,
    mnemonic,
    words,
    challenge,
    error,
    startNewMnemonic,
    startImportMnemonic,
    proceedToVerification,
    submitVerification,
    submitImportedMnemonic,
    reset,
  } = useMnemonicFlow();

  useEffect(() => {
    if (open && !mnemonic) {
      startNewMnemonic();
    }
  }, [open, mnemonic, startNewMnemonic]);

  useEffect(() => {
    if (step === MnemonicStep.COMPLETE) {
      onComplete();
    }
  }, [step, onComplete]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const title =
    step === MnemonicStep.IMPORT
      ? "Import Recovery Phrase"
      : step === MnemonicStep.VERIFY
        ? "Verify Recovery Phrase"
        : "Save Your Recovery Phrase";

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title={title}
        onClose={handleClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-4 pt-4 text-accent-primary sm:px-6">
        {step === MnemonicStep.GENERATE && (
          <>
            <Text variant="body2" className="text-accent-secondary">
              Write down these 24 words and store them safely. You will need
              them to independently claim your funds if the vault provider is
              unavailable.
            </Text>

            <WordGrid words={words} />

            <Warning>
              This phrase will not be shown again. Do not share it with anyone.
              Do not store it digitally. Write it on paper and keep it in a safe
              place.
            </Warning>
          </>
        )}

        {step === MnemonicStep.VERIFY && challenge && (
          <VerificationForm
            challenge={challenge}
            error={error}
            onSubmit={submitVerification}
            onBack={startNewMnemonic}
          />
        )}

        {step === MnemonicStep.IMPORT && (
          <ImportForm
            error={error}
            onSubmit={submitImportedMnemonic}
            onBack={startNewMnemonic}
          />
        )}
      </DialogBody>

      {step === MnemonicStep.GENERATE && (
        <DialogFooter className="flex flex-col gap-2 px-4 pb-6 sm:px-6">
          <Button
            variant="contained"
            className="w-full"
            onClick={proceedToVerification}
          >
            I&apos;ve Written It Down
          </Button>
          <Button
            variant="outlined"
            className="w-full"
            onClick={startImportMnemonic}
          >
            I Already Have a Recovery Phrase
          </Button>
        </DialogFooter>
      )}
    </ResponsiveDialog>
  );
}
