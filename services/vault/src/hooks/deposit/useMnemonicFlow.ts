/**
 * State machine hook for the mnemonic backup / unlock flow.
 *
 * Manages the lifecycle of generating, verifying, encrypting, and
 * unlocking a BIP-39 mnemonic used for Lamport key derivation.
 *
 * ## Flow paths
 *
 * **First-time user** (no stored mnemonic, no existing vaults):
 *   LOADING → GENERATE → VERIFY → SET_PASSWORD → COMPLETE
 *
 * **Returning user** (stored mnemonic in localStorage):
 *   LOADING → UNLOCK → COMPLETE
 *
 * **Forgot password / new device** (no stored mnemonic, has existing vaults):
 *   LOADING → IMPORT → SET_PASSWORD → COMPLETE
 */

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

/** Steps in the mnemonic flow state machine. */
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
  challenge: VerificationChallenge | null;
  error: string | null;
  hasStored: boolean;
}

interface UseMnemonicFlowOptions {
  /** Whether the user already has vaults (skips generation, goes to import). */
  hasExistingVaults: boolean;
  /** User identifier (e.g. ETH address) used to scope the localStorage key. */
  scope?: string;
}

/**
 * Hook that drives the mnemonic generation / unlock UI.
 *
 * On mount, checks localStorage for an existing encrypted mnemonic and
 * routes to the appropriate initial step. Returns the current state and
 * callbacks for each user action.
 */
export function useMnemonicFlow({
  hasExistingVaults,
  scope,
}: UseMnemonicFlowOptions) {
  const [state, setState] = useState<MnemonicFlowState>({
    step: MnemonicStep.LOADING,
    mnemonic: "",
    challenge: null,
    error: null,
    hasStored: false,
  });

  // Derived — no need to store in state
  const words = state.mnemonic ? getMnemonicWords(state.mnemonic) : [];

  // Clear sensitive mnemonic from memory on unmount
  useEffect(() => {
    return () => setState((prev) => ({ ...prev, mnemonic: "" }));
  }, []);

  useEffect(() => {
    let isMounted = true;
    hasStoredMnemonic(scope).then((stored) => {
      if (!isMounted) return;
      let initialStep: MnemonicStep;
      if (stored) {
        initialStep = MnemonicStep.UNLOCK;
      } else if (hasExistingVaults) {
        initialStep = MnemonicStep.IMPORT;
      } else {
        initialStep = MnemonicStep.GENERATE;
      }
      setState((prev) => ({
        ...prev,
        hasStored: stored,
        step: initialStep,
      }));
    });
    return () => {
      isMounted = false;
    };
  }, [hasExistingVaults, scope]);

  /** Generate a fresh 12-word mnemonic and move to the GENERATE step. */
  const startNewMnemonic = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: MnemonicStep.GENERATE,
      mnemonic: generateLamportMnemonic(),
      challenge: null,
      error: null,
    }));
  }, []);

  /** Switch to the IMPORT step (forgot password / new device). */
  const startImportMnemonic = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: MnemonicStep.IMPORT,
      mnemonic: "",
      challenge: null,
      error: null,
    }));
  }, []);

  /** Create a 3-word verification challenge and move to the VERIFY step. */
  const proceedToVerification = useCallback(() => {
    const challenge = createVerificationChallenge(state.mnemonic);
    setState((prev) => ({
      ...prev,
      step: MnemonicStep.VERIFY,
      challenge,
      error: null,
    }));
  }, [state.mnemonic]);

  /** Validate the user's answers against the challenge; advance to SET_PASSWORD on success. */
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

  /** Encrypt the mnemonic with the chosen password and store in localStorage. */
  const submitPassword = useCallback(
    async (password: string) => {
      try {
        await storeMnemonic(state.mnemonic, password, scope);
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
    [state.mnemonic, scope],
  );

  /** Decrypt the stored mnemonic with the user's password. */
  const submitUnlock = useCallback(
    async (password: string) => {
      try {
        const mnemonic = await unlockMnemonic(password, scope);
        setState((prev) => ({
          ...prev,
          step: MnemonicStep.COMPLETE,
          mnemonic,
          error: null,
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          error: "Incorrect password. Please try again.",
        }));
      }
    },
    [scope],
  );

  /** Validate a user-provided mnemonic phrase and advance to SET_PASSWORD. */
  const submitImportedMnemonic = useCallback((mnemonic: string) => {
    const trimmed = mnemonic.trim().toLowerCase();

    if (!isValidMnemonic(trimmed)) {
      setState((prev) => ({
        ...prev,
        error: "Invalid mnemonic phrase. Please check and try again.",
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      step: MnemonicStep.SET_PASSWORD,
      mnemonic: trimmed,
      challenge: null,
      error: null,
    }));
  }, []);

  /** Reset all state back to the initial GENERATE step. */
  const reset = useCallback(() => {
    setState({
      step: MnemonicStep.GENERATE,
      mnemonic: "",
      challenge: null,
      error: null,
      hasStored: false,
    });
  }, []);

  return {
    ...state,
    words,
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
