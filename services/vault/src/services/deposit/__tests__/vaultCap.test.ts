import { describe, expect, it } from "vitest";

import { resolveVaultCapState } from "../vaultCap";

/**
 * A cap high enough that the HTLC-output axis never fires, so the cases below
 * keep testing only the per-position cap they were written for.
 */
const PERMISSIVE_HTLC_CAP = 10;

describe("resolveVaultCapState", () => {
  it("blocks neither when the flag is off", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 10,
        maxVaultsPerPosition: 10,
        enabled: false,
        maxHtlcOutputCount: PERMISSIVE_HTLC_CAP,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: null });
  });

  it("blocks neither when the cap is unknown (null)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 10,
        maxVaultsPerPosition: null,
        enabled: true,
        maxHtlcOutputCount: PERMISSIVE_HTLC_CAP,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: null });
  });

  it("blocks neither well below the cap (split fits)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 5,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: PERMISSIVE_HTLC_CAP,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: null });
  });

  it("allows a split exactly when it fits (count + 2 == cap)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 8,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: PERMISSIVE_HTLC_CAP,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: null });
  });

  it("disables the split near the cap (single fits, split overflows)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 9,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: PERMISSIVE_HTLC_CAP,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: "per-position" });
  });

  it("blocks the deposit at the cap (single overflows)", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 10,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: PERMISSIVE_HTLC_CAP,
      }),
    ).toEqual({ isAtCap: true, splitUnavailableReason: null });
  });

  it("blocks the deposit over the cap", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 12,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: PERMISSIVE_HTLC_CAP,
      }),
    ).toEqual({ isAtCap: true, splitUnavailableReason: null });
  });

  // The protocol's HTLC-output cap is a second, independent reason a split may
  // be unavailable. It matters because `assertBuildWithinPinnedLimits` aborts a
  // build that exceeds it and tells the depositor to start again without
  // splitting — an instruction the form has to make followable.
  it("disables the split when the protocol allows only one HTLC output", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 0,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: 1,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: "htlc-output-cap" });
  });

  it("allows the split when the protocol allows exactly two HTLC outputs", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 0,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: 2,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: null });
  });

  it("applies the HTLC cap even when per-position enforcement is off", () => {
    // Different contracts, different flags: the liquidation-notifications flag
    // gates the per-position cap only, and must not switch off a protocol limit
    // the build will enforce regardless.
    expect(
      resolveVaultCapState({
        existingVaultCount: 0,
        maxVaultsPerPosition: null,
        enabled: false,
        maxHtlcOutputCount: 1,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: "htlc-output-cap" });
  });

  it("reports the per-position reason first when both caps bite", () => {
    // It is the one that can quote usage and that the depositor can act on by
    // withdrawing a vault, so it is the more useful of the two to name.
    expect(
      resolveVaultCapState({
        existingVaultCount: 9,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: 1,
      }),
    ).toEqual({ isAtCap: false, splitUnavailableReason: "per-position" });
  });

  it("leaves the deposit blocked at the per-position cap regardless of the HTLC cap", () => {
    expect(
      resolveVaultCapState({
        existingVaultCount: 10,
        maxVaultsPerPosition: 10,
        enabled: true,
        maxHtlcOutputCount: 1,
      }),
    ).toEqual({ isAtCap: true, splitUnavailableReason: null });
  });
});
