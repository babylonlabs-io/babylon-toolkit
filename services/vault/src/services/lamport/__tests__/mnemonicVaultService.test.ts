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
  });
});
