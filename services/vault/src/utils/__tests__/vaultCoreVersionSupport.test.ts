/**
 * Tests for the vault core version preflight: one WASM read per session,
 * transient failures retryable, unsupported versions fail closed with the
 * user-facing copy.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupportedTxGraphVersions = vi.hoisted(() => vi.fn());
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", () => ({
  supportedTxGraphVersions: mockSupportedTxGraphVersions,
}));

// The module memoizes at module scope — re-import fresh for every test.
async function freshModule() {
  vi.resetModules();
  return import("../vaultCoreVersionSupport");
}

describe("getSupportedVaultCoreVersions", () => {
  beforeEach(() => {
    mockSupportedTxGraphVersions.mockReset();
  });

  it("reads the WASM once and serves the session from the memo", async () => {
    mockSupportedTxGraphVersions.mockResolvedValue([1, 2]);
    const { getSupportedVaultCoreVersions } = await freshModule();

    expect(await getSupportedVaultCoreVersions()).toEqual([1, 2]);
    expect(await getSupportedVaultCoreVersions()).toEqual([1, 2]);
    expect(mockSupportedTxGraphVersions).toHaveBeenCalledTimes(1);
  });

  it("does not memoize a rejection — a transient WASM failure can retry", async () => {
    mockSupportedTxGraphVersions
      .mockRejectedValueOnce(new Error("wasm init failed"))
      .mockResolvedValueOnce([1, 2]);
    const { getSupportedVaultCoreVersions } = await freshModule();

    await expect(getSupportedVaultCoreVersions()).rejects.toThrow(
      "wasm init failed",
    );
    await expect(getSupportedVaultCoreVersions()).resolves.toEqual([1, 2]);
    expect(mockSupportedTxGraphVersions).toHaveBeenCalledTimes(2);
  });
});

describe("assertVaultCoreVersionSupported", () => {
  beforeEach(() => {
    mockSupportedTxGraphVersions.mockReset();
    mockSupportedTxGraphVersions.mockResolvedValue([1, 2]);
  });

  it("resolves for a supported version", async () => {
    const { assertVaultCoreVersionSupported } = await freshModule();
    await expect(assertVaultCoreVersionSupported(2)).resolves.toBeUndefined();
  });

  it("fails closed with the app-update copy for an unsupported version", async () => {
    const { assertVaultCoreVersionSupported } = await freshModule();
    await expect(assertVaultCoreVersionSupported(3)).rejects.toThrow(
      /requires a newer version of the app/,
    );
  });
});
