import { useCallback, useState } from "react";

import {
  createVerificationChallenge,
  generateLamportMnemonic,
  getMnemonicWords,
  isValidMnemonic,
  verifyMnemonicWords,
  type VerificationChallenge,
} from "@/services/lamport";

export enum MnemonicStep {
  GENERATE = "generate",
  VERIFY = "verify",
  IMPORT = "import",
  COMPLETE = "complete",
}

interface MnemonicFlowState {
  step: MnemonicStep;
  mnemonic: string;
  words: string[];
  challenge: VerificationChallenge | null;
  error: string | null;
  isNewMnemonic: boolean;
}

export function useMnemonicFlow() {
  const [state, setState] = useState<MnemonicFlowState>({
    step: MnemonicStep.GENERATE,
    mnemonic: "",
    words: [],
    challenge: null,
    error: null,
    isNewMnemonic: true,
  });

  const startNewMnemonic = useCallback(() => {
    const mnemonic = generateLamportMnemonic();
    const words = getMnemonicWords(mnemonic);

    setState({
      step: MnemonicStep.GENERATE,
      mnemonic,
      words,
      challenge: null,
      error: null,
      isNewMnemonic: true,
    });
  }, []);

  const startImportMnemonic = useCallback(() => {
    setState({
      step: MnemonicStep.IMPORT,
      mnemonic: "",
      words: [],
      challenge: null,
      error: null,
      isNewMnemonic: false,
    });
  }, []);

  const proceedToVerification = useCallback(() => {
    const challenge = createVerificationChallenge(state.mnemonic);
    setState((prev) => ({
      ...prev,
      step: MnemonicStep.VERIFY,
      challenge,
      error: null,
    }));
  }, [state.mnemonic]);

  const submitVerification = useCallback(
    (answers: string[]) => {
      if (!state.challenge) return;

      const isValid = verifyMnemonicWords(state.challenge, answers);
      if (isValid) {
        setState((prev) => ({
          ...prev,
          step: MnemonicStep.COMPLETE,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          error: "The words you entered don't match. Please try again.",
        }));
      }
    },
    [state.challenge],
  );

  const submitImportedMnemonic = useCallback((mnemonic: string) => {
    const trimmed = mnemonic.trim().toLowerCase();

    if (!isValidMnemonic(trimmed)) {
      setState((prev) => ({
        ...prev,
        error: "Invalid mnemonic phrase. Please check and try again.",
      }));
      return;
    }

    const words = getMnemonicWords(trimmed);
    setState({
      step: MnemonicStep.COMPLETE,
      mnemonic: trimmed,
      words,
      challenge: null,
      error: null,
      isNewMnemonic: false,
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      step: MnemonicStep.GENERATE,
      mnemonic: "",
      words: [],
      challenge: null,
      error: null,
      isNewMnemonic: true,
    });
  }, []);

  return {
    ...state,
    startNewMnemonic,
    startImportMnemonic,
    proceedToVerification,
    submitVerification,
    submitImportedMnemonic,
    reset,
  };
}
