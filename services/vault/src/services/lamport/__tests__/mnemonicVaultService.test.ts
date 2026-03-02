import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addMnemonic,
  clearStoredMnemonic,
  getActiveMnemonicId,
  getMnemonicIdForPegin,
  hasMnemonicEntry,
  hasStoredMnemonic,
  linkPeginToMnemonic,
  unlockMnemonic,
} from "../mnemonicVaultService";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_MNEMONIC_2 = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
const TEST_PASSWORD = "test-password-123";
const STORAGE_KEY = "babylon-lamport-vault";
const TEST_SCOPE = "0xABCDEF1234567890";
const SCOPED_STORAGE_KEY = `${STORAGE_KEY}-${TEST_SCOPE}`;

describe("mnemonicVaultService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("hasStoredMnemonic", () => {
    it("returns false when no mnemonic is stored", async () => {
      const result = await hasStoredMnemonic();
      expect(result).toBe(false);
    });

    it("returns true when a mnemonic is stored", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const result = await hasStoredMnemonic();
      expect(result).toBe(true);
    });

    it("returns false for a scope that has no stored mnemonic", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const result = await hasStoredMnemonic(TEST_SCOPE);
      expect(result).toBe(false);
    });

    it("returns true for a scope that has a stored mnemonic", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      const result = await hasStoredMnemonic(TEST_SCOPE);
      expect(result).toBe(true);
    });
  });

  describe("addMnemonic", () => {
    it("stores encrypted data in localStorage", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveProperty("mnemonics");
      expect(parsed.mnemonics).toHaveLength(1);
      expect(parsed.mnemonics[0]).toHaveProperty("id");
      expect(parsed.mnemonics[0]).toHaveProperty("encrypted");
    });

    it("does not store the mnemonic in plaintext", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw = localStorage.getItem(STORAGE_KEY)!;
      expect(raw).not.toContain(TEST_MNEMONIC);
    });

    it("stores under a scoped key when scope is provided", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      const raw = localStorage.getItem(SCOPED_STORAGE_KEY);
      expect(raw).not.toBeNull();
    });

    it("returns a UUID for the stored mnemonic", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("returns the same ID when storing the same mnemonic twice", async () => {
      const id1 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(id1).toBe(id2);
    });

    it("does not create a duplicate entry for the same mnemonic", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw = localStorage.getItem(STORAGE_KEY)!;
      const parsed = JSON.parse(raw);
      expect(parsed.mnemonics).toHaveLength(1);
    });

    it("stores two different mnemonics as separate entries", async () => {
      const id1 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);
      expect(id1).not.toBe(id2);

      const raw = localStorage.getItem(STORAGE_KEY)!;
      const parsed = JSON.parse(raw);
      expect(parsed.mnemonics).toHaveLength(2);
    });

    it("sets the active mnemonic to the most recently added", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);
      expect(getActiveMnemonicId()).toBe(id2);
    });
  });

  describe("unlockMnemonic", () => {
    it("decrypts and returns the mnemonic with the correct password", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const result = await unlockMnemonic(TEST_PASSWORD);
      expect(result).toBe(TEST_MNEMONIC);
    });

    it("throws when no mnemonic is stored", async () => {
      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        "No stored mnemonic found",
      );
    });

    it("throws when the password is incorrect", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await expect(unlockMnemonic("wrong-password")).rejects.toThrow();
    });

    it("throws when localStorage data is corrupted", async () => {
      localStorage.setItem(STORAGE_KEY, "not-valid-json");
      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        "No stored mnemonic found",
      );
    });

    it("decrypts a scoped mnemonic with the correct password", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      const result = await unlockMnemonic(TEST_PASSWORD, TEST_SCOPE);
      expect(result).toBe(TEST_MNEMONIC);
    });

    it("does not find a scoped mnemonic when using the wrong scope", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      await expect(
        unlockMnemonic(TEST_PASSWORD, "other-scope"),
      ).rejects.toThrow("No stored mnemonic found");
    });

    it("unlocks a specific mnemonic by ID", async () => {
      const id1 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);

      const result = await unlockMnemonic(TEST_PASSWORD, undefined, id1);
      expect(result).toBe(TEST_MNEMONIC);
    });

    it("unlocks the active mnemonic when no ID is given", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);

      const result = await unlockMnemonic(TEST_PASSWORD);
      expect(result).toBe(TEST_MNEMONIC_2);
    });

    it("throws when the specified mnemonic ID does not exist", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await expect(
        unlockMnemonic(TEST_PASSWORD, undefined, "nonexistent-id"),
      ).rejects.toThrow("Mnemonic not found in vault");
    });
  });

  describe("pegin mapping", () => {
    it("links a pegin to a mnemonic and retrieves the mapping", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      linkPeginToMnemonic("0xabc123", id);

      expect(getMnemonicIdForPegin("0xabc123")).toBe(id);
    });

    it("returns null for an unmapped pegin", () => {
      expect(getMnemonicIdForPegin("0xunknown")).toBeNull();
    });

    it("maps multiple pegins to the same mnemonic", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      linkPeginToMnemonic("0xabc", id);
      linkPeginToMnemonic("0xdef", id);

      expect(getMnemonicIdForPegin("0xabc")).toBe(id);
      expect(getMnemonicIdForPegin("0xdef")).toBe(id);
    });

    it("maps pegins to different mnemonics", async () => {
      const id1 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);
      linkPeginToMnemonic("0xabc", id1);
      linkPeginToMnemonic("0xdef", id2);

      expect(getMnemonicIdForPegin("0xabc")).toBe(id1);
      expect(getMnemonicIdForPegin("0xdef")).toBe(id2);
    });

    it("respects scope for pegin mappings", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      linkPeginToMnemonic("0xabc", id, TEST_SCOPE);

      expect(getMnemonicIdForPegin("0xabc", TEST_SCOPE)).toBe(id);
      expect(getMnemonicIdForPegin("0xabc")).toBeNull();
    });
  });

  describe("getActiveMnemonicId", () => {
    it("returns null when no vault exists", () => {
      expect(getActiveMnemonicId()).toBeNull();
    });

    it("returns the active mnemonic ID", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(getActiveMnemonicId()).toBe(id);
    });

    it("updates when a new mnemonic is added", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);
      expect(getActiveMnemonicId()).toBe(id2);
    });
  });

  describe("single vault password enforcement", () => {
    it("rejects a second addMnemonic call with the wrong password", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await expect(
        addMnemonic(TEST_MNEMONIC_2, "wrong-password"),
      ).rejects.toThrow("Incorrect vault password");
    });

    it("accepts a new password after clearing the vault", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      clearStoredMnemonic();

      const newPassword = "brand-new-password";
      const id = await addMnemonic(TEST_MNEMONIC, newPassword);
      expect(typeof id).toBe("string");

      const mnemonic = await unlockMnemonic(newPassword);
      expect(mnemonic).toBe(TEST_MNEMONIC);
    });

    it("stores a passwordCheck field in the vault", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw = localStorage.getItem(STORAGE_KEY)!;
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveProperty("passwordCheck");
      expect(typeof parsed.passwordCheck).toBe("string");
    });

    it("allows adding a duplicate mnemonic with the correct password", async () => {
      const id1 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(id1).toBe(id2);
    });
  });

  describe("hasMnemonicEntry", () => {
    it("returns true when the mnemonic exists", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(hasMnemonicEntry(id)).toBe(true);
    });

    it("returns false for a non-existent id", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(hasMnemonicEntry("non-existent-id")).toBe(false);
    });

    it("returns false when no vault exists", () => {
      expect(hasMnemonicEntry("any-id")).toBe(false);
    });

    it("respects scope", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      expect(hasMnemonicEntry(id, TEST_SCOPE)).toBe(true);
      expect(hasMnemonicEntry(id)).toBe(false);
    });
  });

  describe("clearStoredMnemonic", () => {
    it("removes the stored mnemonic from localStorage", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(await hasStoredMnemonic()).toBe(true);

      clearStoredMnemonic();
      expect(await hasStoredMnemonic()).toBe(false);
    });

    it("does not throw when no mnemonic is stored", () => {
      expect(() => clearStoredMnemonic()).not.toThrow();
    });

    it("removes only the scoped mnemonic, leaving the global one", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);

      clearStoredMnemonic(TEST_SCOPE);

      expect(await hasStoredMnemonic()).toBe(true);
      expect(await hasStoredMnemonic(TEST_SCOPE)).toBe(false);
    });
  });
});
