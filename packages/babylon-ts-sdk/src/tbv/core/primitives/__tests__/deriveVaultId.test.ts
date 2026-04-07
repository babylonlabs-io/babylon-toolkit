/**
 * Tests for deriveVaultId — vault ID derivation matching Solidity's
 * keccak256(abi.encode(peginTxHash, depositor))
 */

import { beforeAll, describe, expect, it } from "vitest";

import { deriveVaultId } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { initializeWasmForTests } from "../psbt/__tests__/helpers";

describe("deriveVaultId", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  // Golden vector from btc-vault Rust tests (crates/eth-client/src/vault_id.rs)
  // peginTxHash = [0xab; 32], depositor = 0x1234567890abcdef1234567890abcdef12345678
  it("matches Solidity keccak256(abi.encode(peginTxHash, depositor)) golden vector", async () => {
    const peginTxHash = "ab".repeat(32);
    const depositor = "1234567890abcdef1234567890abcdef12345678";

    const vaultId = await deriveVaultId(peginTxHash, depositor);

    expect(vaultId).toBe(
      "f8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba",
    );
  });

  it("accepts 0x-prefixed inputs", async () => {
    const peginTxHash = "0x" + "ab".repeat(32);
    const depositor = "0x1234567890abcdef1234567890abcdef12345678";

    const vaultId = await deriveVaultId(peginTxHash, depositor);

    expect(vaultId).toBe(
      "f8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba",
    );
  });

  it("produces different IDs for different depositors", async () => {
    const peginTxHash = "01".repeat(32);
    const depositorA = "1234567890abcdef1234567890abcdef12345678";
    const depositorB = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

    const [idA, idB] = await Promise.all([
      deriveVaultId(peginTxHash, depositorA),
      deriveVaultId(peginTxHash, depositorB),
    ]);

    expect(idA).not.toBe(idB);
  });

  it("produces different IDs for different peginTxHashes", async () => {
    const depositor = "1234567890abcdef1234567890abcdef12345678";
    const hashA = "aa".repeat(32);
    const hashB = "bb".repeat(32);

    const [idA, idB] = await Promise.all([
      deriveVaultId(hashA, depositor),
      deriveVaultId(hashB, depositor),
    ]);

    expect(idA).not.toBe(idB);
  });

  // hexToBytes validation (tested indirectly through deriveVaultId)
  it("throws on odd-length hex", async () => {
    await expect(
      deriveVaultId("abc", "1234567890abcdef1234567890abcdef12345678"),
    ).rejects.toThrow("Invalid hex string");
  });

  it("throws on empty hex", async () => {
    await expect(
      deriveVaultId("", "1234567890abcdef1234567890abcdef12345678"),
    ).rejects.toThrow("Invalid hex string");
  });

  it("throws on non-hex characters", async () => {
    await expect(
      deriveVaultId("zz".repeat(32), "1234567890abcdef1234567890abcdef12345678"),
    ).rejects.toThrow("Invalid hex string");
  });

  it("throws on empty 0x prefix only", async () => {
    await expect(
      deriveVaultId("0x", "1234567890abcdef1234567890abcdef12345678"),
    ).rejects.toThrow("Invalid hex string");
  });
});
