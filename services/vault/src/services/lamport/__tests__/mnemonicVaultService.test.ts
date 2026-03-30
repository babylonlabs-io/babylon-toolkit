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
  VaultTamperingError,
} from "../mnemonicVaultService";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_MNEMONIC_2 = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
const TEST_PASSWORD = "test-password-123";
const STORAGE_KEY = "babylon-lamport-vault";
const TEST_SCOPE = "0xABCDEF1234567890";
const SCOPED_STORAGE_KEY = `${STORAGE_KEY}-${TEST_SCOPE.toLowerCase()}`;

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

    it("treats structurally invalid JSON as empty vault", async () => {
      localStorage.setItem(
        "babylon-lamport-vault",
        JSON.stringify({ foo: "bar" }),
      );
      expect(await hasStoredMnemonic()).toBe(false);
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

    it("detects corrupted entry ciphertext as tampering", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      // Manually corrupt the first entry's ciphertext in localStorage
      const raw = localStorage.getItem("babylon-lamport-vault")!;
      const vault = JSON.parse(raw);
      vault.mnemonics[0].encrypted = "corrupted-ciphertext";
      localStorage.setItem("babylon-lamport-vault", JSON.stringify(vault));

      // Integrity tag catches the modification
      await expect(addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD)).rejects.toThrow(
        VaultTamperingError,
      );
    });

    it("detects corrupted entry on re-add as tampering", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      // Corrupt the entry
      const raw = localStorage.getItem("babylon-lamport-vault")!;
      const vault = JSON.parse(raw);
      vault.mnemonics[0].encrypted = "corrupted-ciphertext";
      localStorage.setItem("babylon-lamport-vault", JSON.stringify(vault));

      // Integrity tag catches the modification
      await expect(addMnemonic(TEST_MNEMONIC, TEST_PASSWORD)).rejects.toThrow(
        VaultTamperingError,
      );
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
      linkPeginToMnemonic("abc123", id);

      expect(getMnemonicIdForPegin("abc123")).toBe(id);
    });

    it("returns null for an unmapped pegin", () => {
      expect(getMnemonicIdForPegin("unknown")).toBeNull();
    });

    it("maps multiple pegins to the same mnemonic", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      linkPeginToMnemonic("abc", id);
      linkPeginToMnemonic("def", id);

      expect(getMnemonicIdForPegin("abc")).toBe(id);
      expect(getMnemonicIdForPegin("def")).toBe(id);
    });

    it("maps pegins to different mnemonics", async () => {
      const id1 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);
      linkPeginToMnemonic("abc", id1);
      linkPeginToMnemonic("def", id2);

      expect(getMnemonicIdForPegin("abc")).toBe(id1);
      expect(getMnemonicIdForPegin("def")).toBe(id2);
    });

    it("does not create a vault when linking to a non-existent scope", () => {
      linkPeginToMnemonic("abc", "some-id", "non-existent-scope");
      expect(
        localStorage.getItem("babylon-lamport-vault-non-existent-scope"),
      ).toBeNull();
    });

    it("respects scope for pegin mappings", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      linkPeginToMnemonic("abc", id, TEST_SCOPE);

      expect(getMnemonicIdForPegin("abc", TEST_SCOPE)).toBe(id);
      expect(getMnemonicIdForPegin("abc")).toBeNull();
    });

    it("overwrites an existing mapping for the same pegin", async () => {
      const id1 = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id2 = await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);
      linkPeginToMnemonic("abc", id1);
      linkPeginToMnemonic("abc", id2);
      expect(getMnemonicIdForPegin("abc")).toBe(id2);
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

    it("returns the active ID for a scoped vault", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD, TEST_SCOPE);
      expect(getActiveMnemonicId(TEST_SCOPE)).toBe(id);
      // Global should be unaffected
      expect(getActiveMnemonicId()).toBeNull();
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

    it("also removes pegin mappings when clearing the vault", async () => {
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      linkPeginToMnemonic("abc", id);
      expect(getMnemonicIdForPegin("abc")).toBe(id);

      clearStoredMnemonic();
      expect(getMnemonicIdForPegin("abc")).toBeNull();
    });
  });

  describe("backward compatibility", () => {
    it("treats old single-mnemonic format as empty", async () => {
      // Old format: { encrypted: "..." } without mnemonics array
      localStorage.setItem(
        "babylon-lamport-vault",
        JSON.stringify({ encrypted: "old-data" }),
      );
      const result = await hasStoredMnemonic();
      expect(result).toBe(false);
    });

    it("allows adding a mnemonic when old format exists (overwrites)", async () => {
      localStorage.setItem(
        "babylon-lamport-vault",
        JSON.stringify({ encrypted: "old-data" }),
      );
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(typeof id).toBe("string");
      const mnemonic = await unlockMnemonic(TEST_PASSWORD);
      expect(mnemonic).toBe(TEST_MNEMONIC);
    });
  });

  describe("integrity tag", () => {
    it("stores integrityTag in localStorage after addMnemonic", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw = localStorage.getItem(STORAGE_KEY)!;
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveProperty("integrityTag");
      expect(typeof parsed.integrityTag).toBe("string");
    });

    it("unlockMnemonic succeeds when integrity is intact", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const result = await unlockMnemonic(TEST_PASSWORD);
      expect(result).toBe(TEST_MNEMONIC);
    });

    it("detects tampered mnemonic ID on unlock", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      const raw = localStorage.getItem(STORAGE_KEY)!;
      const vault = JSON.parse(raw);
      vault.mnemonics[0].id = "tampered-uuid";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        VaultTamperingError,
      );
    });

    it("detects tampered activeMnemonicId on unlock", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      const raw = localStorage.getItem(STORAGE_KEY)!;
      const vault = JSON.parse(raw);
      vault.activeMnemonicId = "tampered-uuid";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        VaultTamperingError,
      );
    });

    it("detects tampered passwordCheck on unlock as incorrect password", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      const raw = localStorage.getItem(STORAGE_KEY)!;
      const vault = JSON.parse(raw);
      vault.passwordCheck = "tampered-value";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

      // Password check runs before integrity verification, so tampered
      // passwordCheck manifests as "Incorrect vault password" (same as addMnemonic)
      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        "Incorrect vault password",
      );
    });

    it("detects corrupted integrityTag on unlock", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      const raw = localStorage.getItem(STORAGE_KEY)!;
      const vault = JSON.parse(raw);
      vault.integrityTag = "garbage-ciphertext";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        VaultTamperingError,
      );
    });

    it("detects tampered mnemonic ID on addMnemonic", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      const raw = localStorage.getItem(STORAGE_KEY)!;
      const vault = JSON.parse(raw);
      vault.mnemonics[0].id = "tampered-uuid";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

      await expect(addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD)).rejects.toThrow(
        VaultTamperingError,
      );
    });

    it("wrong password throws 'Incorrect vault password' not VaultTamperingError", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      await expect(unlockMnemonic("wrong-password")).rejects.toThrow(
        "Incorrect vault password",
      );
      await expect(unlockMnemonic("wrong-password")).rejects.not.toThrow(
        VaultTamperingError,
      );
    });

    it("skips verification for legacy vaults without integrityTag", async () => {
      // Simulate a legacy vault created before integrityTag was introduced
      const legacyVault = {
        mnemonics: [],
        peginMap: {},
        activeMnemonicId: null,
        passwordCheck: null,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyVault));

      // Should succeed — no integrityTag means legacy vault, skip verification
      const id = await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      expect(typeof id).toBe("string");

      // After addMnemonic, the vault should now have an integrityTag
      const raw = localStorage.getItem(STORAGE_KEY)!;
      const updated = JSON.parse(raw);
      expect(typeof updated.integrityTag).toBe("string");
    });

    it("migrates legacy vault by setting integrityTag on first unlock", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      // Strip integrityTag to simulate a legacy vault
      const raw = localStorage.getItem(STORAGE_KEY)!;
      const vault = JSON.parse(raw);
      delete vault.integrityTag;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

      // First unlock should succeed (legacy) and migrate
      const result = await unlockMnemonic(TEST_PASSWORD);
      expect(result).toBe(TEST_MNEMONIC);

      // Vault should now have integrityTag
      const updated = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(typeof updated.integrityTag).toBe("string");

      // Second unlock should also succeed (tag now verified)
      const result2 = await unlockMnemonic(TEST_PASSWORD);
      expect(result2).toBe(TEST_MNEMONIC);
    });

    it("detects tampering after legacy vault migration", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);

      // Strip integrityTag to simulate legacy vault
      const raw = localStorage.getItem(STORAGE_KEY)!;
      const vault = JSON.parse(raw);
      delete vault.integrityTag;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));

      // Migrate by unlocking
      await unlockMnemonic(TEST_PASSWORD);

      // Now tamper with activeMnemonicId — should be detected
      const raw2 = localStorage.getItem(STORAGE_KEY)!;
      const vault2 = JSON.parse(raw2);
      vault2.activeMnemonicId = "tampered-uuid";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault2));

      await expect(unlockMnemonic(TEST_PASSWORD)).rejects.toThrow(
        VaultTamperingError,
      );
    });

    it("recomputes tag after adding a second mnemonic", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const raw1 = localStorage.getItem(STORAGE_KEY)!;
      const tag1 = JSON.parse(raw1).integrityTag;

      await addMnemonic(TEST_MNEMONIC_2, TEST_PASSWORD);
      const raw2 = localStorage.getItem(STORAGE_KEY)!;
      const tag2 = JSON.parse(raw2).integrityTag;

      expect(tag2).not.toBe(tag1);
    });

    it("peginMap changes do not break integrity on next unlock", async () => {
      await addMnemonic(TEST_MNEMONIC, TEST_PASSWORD);
      const id = getActiveMnemonicId()!;

      // linkPeginToMnemonic modifies peginMap without updating integrityTag
      linkPeginToMnemonic("abc123", id);

      // unlockMnemonic should still succeed because peginMap is excluded
      // from the integrity hash
      const result = await unlockMnemonic(TEST_PASSWORD);
      expect(result).toBe(TEST_MNEMONIC);
    });
  });

  describe("isMultiVault type guard", () => {
    it("rejects vault with peginMap as array", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mnemonics: [],
          peginMap: [],
          activeMnemonicId: null,
          passwordCheck: null,
        }),
      );
      expect(getActiveMnemonicId()).toBeNull();
    });

    it("rejects vault with peginMap as null", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mnemonics: [],
          peginMap: null,
          activeMnemonicId: null,
          passwordCheck: null,
        }),
      );
      expect(getActiveMnemonicId()).toBeNull();
    });

    it("rejects vault with activeMnemonicId as number", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mnemonics: [],
          peginMap: {},
          activeMnemonicId: 42,
          passwordCheck: null,
        }),
      );
      expect(getActiveMnemonicId()).toBeNull();
    });

    it("rejects vault with mnemonic entry missing id", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mnemonics: [{ encrypted: "data" }],
          peginMap: {},
          activeMnemonicId: null,
          passwordCheck: null,
        }),
      );
      expect(getActiveMnemonicId()).toBeNull();
    });

    it("rejects vault with mnemonic entry missing encrypted", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mnemonics: [{ id: "uuid-1" }],
          peginMap: {},
          activeMnemonicId: null,
          passwordCheck: null,
        }),
      );
      expect(getActiveMnemonicId()).toBeNull();
    });
  });
});
