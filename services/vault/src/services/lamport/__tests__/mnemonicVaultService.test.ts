import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearStoredMnemonic,
  hasStoredMnemonic,
  storeMnemonic,
  unlockMnemonic,
} from "../mnemonicVaultService";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
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
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const result = await hasStoredMnemonic();
      expect(result).toBe(true);
    });

    it("returns false for a scope that has no stored mnemonic", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const result = await hasStoredMnemonic(TEST_SCOPE);
      expect(result).toBe(false);
    });

    it("returns true for a scope that has a stored mnemonic", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      const result = await hasStoredMnemonic(TEST_SCOPE);
      expect(result).toBe(true);
    });
  });

  describe("storeMnemonic", () => {
    it("stores encrypted data in localStorage", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveProperty("encrypted");
      expect(typeof parsed.encrypted).toBe("string");
    });

    it("does not store the mnemonic in plaintext", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw = localStorage.getItem(STORAGE_KEY)!;
      expect(raw).not.toContain(TEST_MNEMONIC);
    });

    it("stores under a scoped key when scope is provided", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      const raw = localStorage.getItem(SCOPED_STORAGE_KEY);
      expect(raw).not.toBeNull();
    });
  });

  describe("unlockMnemonic", () => {
    it("decrypts and returns the mnemonic with the correct password", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const result = await unlockMnemonic(TEST_PASSWORD);
      expect(result).toBe(TEST_MNEMONIC);
    });

    it("throws when no mnemonic is stored", async () => {
      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        "No stored mnemonic found",
      );
    });

    it("throws when the password is incorrect", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await expect(unlockMnemonic("wrong-password")).rejects.toThrow();
    });

    it("throws when localStorage data is corrupted", async () => {
      localStorage.setItem(STORAGE_KEY, "not-valid-json");
      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        "Stored mnemonic data is corrupted",
      );
    });

    it("decrypts a scoped mnemonic with the correct password", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      const result = await unlockMnemonic(TEST_PASSWORD, TEST_SCOPE);
      expect(result).toBe(TEST_MNEMONIC);
    });

    it("does not find a scoped mnemonic when using the wrong scope", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      await expect(
        unlockMnemonic(TEST_PASSWORD, "other-scope"),
      ).rejects.toThrow("No stored mnemonic found");
    });
  });

  describe("clearStoredMnemonic", () => {
    it("removes the stored mnemonic from localStorage", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(await hasStoredMnemonic()).toBe(true);

      clearStoredMnemonic();
      expect(await hasStoredMnemonic()).toBe(false);
    });

    it("does not throw when no mnemonic is stored", () => {
      expect(() => clearStoredMnemonic()).not.toThrow();
    });

    it("removes only the scoped mnemonic, leaving the global one", async () => {
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      await storeMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);

      clearStoredMnemonic(TEST_SCOPE);

      expect(await hasStoredMnemonic()).toBe(true);
      expect(await hasStoredMnemonic(TEST_SCOPE)).toBe(false);
    });
  });
});
