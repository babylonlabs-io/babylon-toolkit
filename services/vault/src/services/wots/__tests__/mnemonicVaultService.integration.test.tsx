import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addMnemonic,
  unlockMnemonic,
} from "../mnemonicVaultService";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_PASSWORD = "test-password-123";
const STORAGE_KEY = "babylon-wots-vault";

describe("mnemonicVaultService (integration — real AES-GCM + PBKDF2)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips a mnemonic through real encryption", async () => {
    await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
    const result = await unlockMnemonic(TEST_PASSWORD);
    expect(result).toBe(TEST_MNEMONIC);
  });

  it("does not store the mnemonic in plaintext in localStorage", async () => {
    await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
    const raw = localStorage.getItem(STORAGE_KEY)!;
    expect(raw).not.toContain(TEST_MNEMONIC);
  });

  it("rejects decryption with the wrong password", async () => {
    await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
    await expect(unlockMnemonic("wrong-password")).rejects.toThrow(
      "Incorrect vault password",
    );
  });
});
