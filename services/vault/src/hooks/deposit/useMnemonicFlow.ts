import { useCallback, useEffect, useState } from "react";

import {
  createVerificationChallenge,
  generateLamportMnemonic,
  getMnemonicWords,
  hasStoredMnemonic,
  isValidMnemonic,
  storeMnemonic,
  unlockMnemonic,
  verifyMnemonicWords,
  type VerificationChallenge,
} from "@/services/lamport";

export enum MnemonicStep {
  LOADING = "loading",
  UNLOCK = "unlock",
  GENERATE = "generate",
  SET_PASSWORD = "set_password",
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
  hasStored: boolean;
}

export function useMnemonicFlow() {
  const [state, setState] = useState<MnemonicFlowState>({
    step: MnemonicStep.LOADING,
    mnemonic: "",
    words: [],
    challenge: null,
    error: null,
    hasStored: false,
  });

  useEffect(() => {
    let isMounted = true;
    hasStoredMnemonic().then((stored) => {
      if (!isMounted) return;
      setState((prev) => ({
        ...prev,
        hasStored: stored,
        step: stored ? MnemonicStep.UNLOCK : MnemonicStep.GENERATE,
      }));
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const startNewMnemonic = useCallback(() => {
    const mnemonic = generateLamportMnemonic();
    const words = getMnemonicWords(mnemonic);

    setState((prev) => ({
      ...prev,
      step: MnemonicStep.GENERATE,
      mnemonic,
      words,
      challenge: null,
      error: null,
    }));
  }, []);

  const startImportMnemonic = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: MnemonicStep.IMPORT,
      mnemonic: "",
      words: [],
      challenge: null,
      error: null,
    }));
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
          step: MnemonicStep.SET_PASSWORD,
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

  const submitPassword = useCallback(
    async (password: string) => {
      try {
        await storeMnemonic(state.mnemonic, password);
        setState((prev) => ({
          ...prev,
          step: MnemonicStep.COMPLETE,
          hasStored: true,
          error: null,
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          error: "Failed to encrypt and store mnemonic.",
        }));
      }
    },
    [state.mnemonic],
  );

  const submitUnlock = useCallback(async (password: string) => {
    try {
      const mnemonic = await unlockMnemonic(password);
      const words = getMnemonicWords(mnemonic);
      setState((prev) => ({
        ...prev,
        step: MnemonicStep.COMPLETE,
        mnemonic,
        words,
        error: null,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Incorrect password. Please try again.",
      }));
    }
  }, []);

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
    setState((prev) => ({
      ...prev,
      step: MnemonicStep.SET_PASSWORD,
      mnemonic: trimmed,
      words,
      challenge: null,
      error: null,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      step: MnemonicStep.GENERATE,
      mnemonic: "",
      words: [],
      challenge: null,
      error: null,
      hasStored: false,
    });
  }, []);

  return {
    ...state,
    startNewMnemonic,
    startImportMnemonic,
    proceedToVerification,
    submitVerification,
    submitPassword,
    submitUnlock,
    submitImportedMnemonic,
    reset,
  };
}
