import { describe, expect, it } from "vitest";

import { resolveVaultCapState } from "../vaultCap";

describe("resolveVaultCapState", () => {
  it("blocks neither when the flag is off", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 10,
        maxVaultsPerPosition: 10,
        enabled: false,
      }),
    ).toEqual({ isAtCap: false, isSplitUnavailable: false });
  });

  it("blocks neither when the cap is unknown (null)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 10,
        maxVaultsPerPosition: null,
        enabled: true,
      }),
    ).toEqual({ isAtCap: false, isSplitUnavailable: false });
  });

  it("blocks neither well below the cap (split fits)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 5,
        maxVaultsPerPosition: 10,
        enabled: true,
      }),
    ).toEqual({ isAtCap: false, isSplitUnavailable: false });
  });

  it("allows a split exactly when it fits (count + 2 == cap)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 8,
        maxVaultsPerPosition: 10,
        enabled: true,
      }),
    ).toEqual({ isAtCap: false, isSplitUnavailable: false });
  });

  it("disables the split near the cap (single fits, split overflows)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 9,
        maxVaultsPerPosition: 10,
        enabled: true,
      }),
    ).toEqual({ isAtCap: false, isSplitUnavailable: true });
  });

  it("blocks the deposit at the cap (single overflows)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 10,
        maxVaultsPerPosition: 10,
        enabled: true,
      }),
    ).toEqual({ isAtCap: true, isSplitUnavailable: false });
  });

  it("blocks the deposit over the cap", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 12,
        maxVaultsPerPosition: 10,
        enabled: true,
      }),
    ).toEqual({ isAtCap: true, isSplitUnavailable: false });
  });
});
