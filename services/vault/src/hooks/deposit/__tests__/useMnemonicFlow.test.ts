import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const MOCK_MNEMONIC =
  "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12";
const MOCK_WORDS = MOCK_MNEMONIC.split(" ");
const MOCK_CHALLENGE = {
  indices: [2, 5, 10],
  expectedWords: ["word3", "word6", "word11"],
};

vi.mock("@/services/lamport", () => ({
  generateLamportMnemonic: vi.fn(() => MOCK_MNEMONIC),
  getMnemonicWords: vi.fn((m: string) => m.split(" ")),
  isValidMnemonic: vi.fn((m: string) => m === MOCK_MNEMONIC),
  createVerificationChallenge: vi.fn(() => MOCK_CHALLENGE),
  verifyMnemonicWords: vi.fn(
    (_challenge: unknown, answers: string[]) =>
      JSON.stringify(answers) === JSON.stringify(MOCK_CHALLENGE.expectedWords),
  ),
  hasStoredMnemonic: vi.fn(() => Promise.resolve(false)),
  storeMnemonic: vi.fn(() => Promise.resolve()),
  unlockMnemonic: vi.fn(() => Promise.resolve(MOCK_MNEMONIC)),
}));

import {
  hasStoredMnemonic,
  storeMnemonic,
  unlockMnemonic,
} from "@/services/lamport";

import { MnemonicStep, useMnemonicFlow } from "../useMnemonicFlow";

describe("useMnemonicFlow", () => {
  describe("initial state", () => {
    it("starts in LOADING then transitions to GENERATE when no stored mnemonic", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );

      expect(result.current.step).toBe(MnemonicStep.LOADING);

      await act(async () => {});

      expect(result.current.step).toBe(MnemonicStep.GENERATE);
      expect(result.current.hasStored).toBe(false);
    });

    it("transitions to UNLOCK when a stored mnemonic exists", async () => {
      vi.mocked(hasStoredMnemonic).mockResolvedValueOnce(true);

      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );

      await act(async () => {});

      expect(result.current.step).toBe(MnemonicStep.UNLOCK);
      expect(result.current.hasStored).toBe(true);
    });
  });

  describe("startNewMnemonic", () => {
    it("generates a mnemonic and moves to GENERATE step", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });

      expect(result.current.step).toBe(MnemonicStep.GENERATE);
      expect(result.current.words).toEqual(MOCK_WORDS);
      expect(result.current.error).toBeNull();
    });
  });

  describe("startImportMnemonic", () => {
    it("moves to IMPORT step and clears state", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });

      act(() => {
        result.current.startImportMnemonic();
      });

      expect(result.current.step).toBe(MnemonicStep.IMPORT);
      expect(result.current.mnemonic).toBe("");
      expect(result.current.words).toEqual([]);
      expect(result.current.challenge).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("proceedToVerification", () => {
    it("creates a challenge and moves to VERIFY step", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });

      act(() => {
        result.current.proceedToVerification();
      });

      expect(result.current.step).toBe(MnemonicStep.VERIFY);
      expect(result.current.challenge).toEqual(MOCK_CHALLENGE);
      expect(result.current.error).toBeNull();
    });
  });

  describe("submitVerification", () => {
    it("moves to SET_PASSWORD on correct answers", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });
      act(() => {
        result.current.proceedToVerification();
      });

      act(() => {
        result.current.submitVerification(MOCK_CHALLENGE.expectedWords);
      });

      expect(result.current.step).toBe(MnemonicStep.SET_PASSWORD);
      expect(result.current.error).toBeNull();
    });

    it("sets an error on incorrect answers", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });
      act(() => {
        result.current.proceedToVerification();
      });

      act(() => {
        result.current.submitVerification(["wrong", "answers", "here"]);
      });

      expect(result.current.step).toBe(MnemonicStep.VERIFY);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("submitPassword", () => {
    it("stores mnemonic and moves to COMPLETE on success", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });
      act(() => {
        result.current.proceedToVerification();
      });
      act(() => {
        result.current.submitVerification(MOCK_CHALLENGE.expectedWords);
      });

      await act(async () => {
        await result.current.submitPassword("mypassword");
      });

      expect(storeMnemonic).toHaveBeenCalledWith(MOCK_MNEMONIC, "mypassword");
      expect(result.current.step).toBe(MnemonicStep.COMPLETE);
      expect(result.current.hasStored).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("sets an error when storage fails", async () => {
      vi.mocked(storeMnemonic).mockRejectedValueOnce(new Error("fail"));

      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });
      act(() => {
        result.current.proceedToVerification();
      });
      act(() => {
        result.current.submitVerification(MOCK_CHALLENGE.expectedWords);
      });

      await act(async () => {
        await result.current.submitPassword("mypassword");
      });

      expect(result.current.step).toBe(MnemonicStep.SET_PASSWORD);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("submitUnlock", () => {
    it("decrypts and moves to COMPLETE on success", async () => {
      vi.mocked(hasStoredMnemonic).mockResolvedValueOnce(true);

      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      expect(result.current.step).toBe(MnemonicStep.UNLOCK);

      await act(async () => {
        await result.current.submitUnlock("mypassword");
      });

      expect(unlockMnemonic).toHaveBeenCalledWith("mypassword");
      expect(result.current.step).toBe(MnemonicStep.COMPLETE);
      expect(result.current.words).toEqual(MOCK_WORDS);
      expect(result.current.error).toBeNull();
    });

    it("sets an error on wrong password", async () => {
      vi.mocked(hasStoredMnemonic).mockResolvedValueOnce(true);
      vi.mocked(unlockMnemonic).mockRejectedValueOnce(new Error("bad pw"));

      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      await act(async () => {
        await result.current.submitUnlock("wrongpassword");
      });

      expect(result.current.step).toBe(MnemonicStep.UNLOCK);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("submitImportedMnemonic", () => {
    it("moves to SET_PASSWORD with a valid mnemonic", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startImportMnemonic();
      });

      act(() => {
        result.current.submitImportedMnemonic(MOCK_MNEMONIC);
      });

      expect(result.current.step).toBe(MnemonicStep.SET_PASSWORD);
      expect(result.current.words).toEqual(MOCK_WORDS);
      expect(result.current.error).toBeNull();
    });

    it("sets an error with an invalid mnemonic", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startImportMnemonic();
      });

      act(() => {
        result.current.submitImportedMnemonic("invalid phrase");
      });

      expect(result.current.step).toBe(MnemonicStep.IMPORT);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe("reset", () => {
    it("clears all state back to initial values", async () => {
      const { result } = renderHook(() =>
        useMnemonicFlow({ hasExistingVaults: false }),
      );
      await act(async () => {});

      act(() => {
        result.current.startNewMnemonic();
      });

      expect(result.current.words.length).toBeGreaterThan(0);

      act(() => {
        result.current.reset();
      });

      expect(result.current.step).toBe(MnemonicStep.GENERATE);
      expect(result.current.mnemonic).toBe("");
      expect(result.current.words).toEqual([]);
      expect(result.current.challenge).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.hasStored).toBe(false);
    });
  });
});
