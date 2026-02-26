import {
  Button,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Loader,
  ResponsiveDialog,
  Text,
  Warning,
} from "@babylonlabs-io/core-ui";
import { useEffect } from "react";

import { MnemonicStep, useMnemonicFlow } from "@/hooks/deposit/useMnemonicFlow";

import { ImportForm } from "./ImportForm";
import { PasswordForm } from "./PasswordForm";
import { UnlockForm } from "./UnlockForm";
import { VerificationForm } from "./VerificationForm";
import { WordGrid } from "./WordGrid";

interface MnemonicModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (mnemonic?: string) => void;
  hasExistingVaults: boolean;
}

export function MnemonicModal({
  open,
  onClose,
  onComplete,
  hasExistingVaults,
}: MnemonicModalProps) {
  const {
    step,
    mnemonic,
    words,
    challenge,
    error,
    hasStored,
    startNewMnemonic,
    startImportMnemonic,
    proceedToVerification,
    submitVerification,
    submitPassword,
    submitUnlock,
    submitImportedMnemonic,
    reset,
  } = useMnemonicFlow({ hasExistingVaults });

  useEffect(() => {
    if (!open || step !== MnemonicStep.GENERATE || words.length > 0) return;
    startNewMnemonic();
  }, [open, step, words.length, startNewMnemonic]);

  useEffect(() => {
    if (step !== MnemonicStep.COMPLETE) return;
    const captured = mnemonic || undefined;
    reset();
    onComplete(captured);
  }, [step, mnemonic, onComplete, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const titleMap: Record<string, string> = {
    [MnemonicStep.LOADING]: "Recovery Phrase",
    [MnemonicStep.UNLOCK]: "Unlock Recovery Phrase",
    [MnemonicStep.GENERATE]: "Save Your Recovery Phrase",
    [MnemonicStep.SET_PASSWORD]: "Set Password",
    [MnemonicStep.VERIFY]: "Verify Recovery Phrase",
    [MnemonicStep.IMPORT]: "Import Recovery Phrase",
    [MnemonicStep.COMPLETE]: "Recovery Phrase",
  };

  return (
    <ResponsiveDialog open={open} onClose={handleClose}>
      <DialogHeader
        title={titleMap[step] ?? "Recovery Phrase"}
        onClose={handleClose}
        className="text-accent-primary"
      />

      <DialogBody className="flex flex-col gap-4 px-4 pb-4 pt-4 text-accent-primary sm:px-6">
        {step === MnemonicStep.LOADING && (
          <div className="flex items-center justify-center py-8">
            <Loader size={24} />
          </div>
        )}

        {step === MnemonicStep.UNLOCK && (
          <UnlockForm
            error={error}
            onSubmit={submitUnlock}
            onForgot={startImportMnemonic}
          />
        )}

        {step === MnemonicStep.GENERATE && (
          <>
            <Text variant="body2" className="text-accent-secondary">
              Write down these 12 words and store them safely. You will need
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

        {step === MnemonicStep.SET_PASSWORD && (
          <PasswordForm error={error} onSubmit={submitPassword} />
        )}

        {step === MnemonicStep.IMPORT && (
          <ImportForm
            error={error}
            onSubmit={submitImportedMnemonic}
            onBack={hasStored ? () => reset() : startNewMnemonic}
            backLabel={"I don\u0027t have a recovery phrase"}
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
