import { describe, expect, it } from "vitest";

import { attributeBatchResults, normalizeVaultId } from "../batchAttribution";

const VAULT_A = "a".repeat(64);
const VAULT_B = "b".repeat(64);
const VAULT_C = "c".repeat(64);

describe("attributeBatchResults", () => {
  it("attributes happy-path one-to-one results", () => {
    const out = attributeBatchResults([VAULT_A, VAULT_B], [
      { vault_id: VAULT_A, result: { v: 1 }, error: null },
      { vault_id: VAULT_B, result: { v: 2 }, error: null },
    ]);
    expect(out.byVaultId.get(VAULT_A)?.result).toEqual({ v: 1 });
    expect(out.byVaultId.get(VAULT_B)?.result).toEqual({ v: 2 });
    expect(out.missing).toEqual([]);
    expect(out.duplicate).toEqual([]);
    expect(out.unexpected).toEqual([]);
  });

  it("normalizes case on both sides", () => {
    const out = attributeBatchResults([VAULT_A.toUpperCase()], [
      { vault_id: VAULT_A, result: { v: 1 }, error: null },
    ]);
    expect(out.byVaultId.get(VAULT_A)?.result).toEqual({ v: 1 });
    expect(out.missing).toEqual([]);
  });

  it("normalizes a 0x prefix on both sides", () => {
    const out = attributeBatchResults([`0x${VAULT_A}`], [
      { vault_id: VAULT_A, result: { v: 1 }, error: null },
    ]);
    expect(out.byVaultId.get(VAULT_A)?.result).toEqual({ v: 1 });
    expect(out.missing).toEqual([]);
  });

  it("flags requested vault ids missing from response", () => {
    const out = attributeBatchResults([VAULT_A, VAULT_B], [
      { vault_id: VAULT_A, result: { v: 1 }, error: null },
    ]);
    expect(out.missing).toEqual([VAULT_B]);
  });

  it("flags duplicate echoed vault ids and keeps first", () => {
    const out = attributeBatchResults([VAULT_A], [
      { vault_id: VAULT_A, result: { v: 1 }, error: null },
      { vault_id: VAULT_A, result: { v: 2 }, error: null },
    ]);
    expect(out.byVaultId.get(VAULT_A)?.result).toEqual({ v: 1 });
    expect(out.duplicate).toEqual([VAULT_A]);
  });

  it("flags unexpected echoed vault ids and drops them", () => {
    const out = attributeBatchResults([VAULT_A], [
      { vault_id: VAULT_A, result: { v: 1 }, error: null },
      { vault_id: VAULT_C, result: { v: 99 }, error: null },
    ]);
    expect(out.byVaultId.size).toBe(1);
    expect(out.byVaultId.has(VAULT_C)).toBe(false);
    expect(out.unexpected).toEqual([VAULT_C]);
  });

  it("preserves error envelope when result is null", () => {
    const out = attributeBatchResults([VAULT_A], [
      { vault_id: VAULT_A, result: null, error: "PegIn not found" },
    ]);
    expect(out.byVaultId.get(VAULT_A)).toEqual({
      result: null,
      error: "PegIn not found",
    });
  });

  it("dedups requested vault ids", () => {
    const out = attributeBatchResults([VAULT_A, VAULT_A], [
      { vault_id: VAULT_A, result: { v: 1 }, error: null },
    ]);
    expect(out.byVaultId.size).toBe(1);
    expect(out.missing).toEqual([]);
  });
});

describe("normalizeVaultId", () => {
  it("strips a 0x prefix and lowercases", () => {
    expect(normalizeVaultId(`0x${VAULT_A.toUpperCase()}`)).toBe(VAULT_A);
  });

  it("leaves an unprefixed lowercase id unchanged", () => {
    expect(normalizeVaultId(VAULT_A)).toBe(VAULT_A);
  });
});
