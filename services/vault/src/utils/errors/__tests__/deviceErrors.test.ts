/**
 * Pins which typed device errors count as recoverable in place — the states
 * the deposit modal offers an in-modal Retry for instead of sending the user
 * to the dashboard.
 */

import { describe, expect, it } from "vitest";

import { isDeviceRecoverableError } from "../deviceErrors";

class FakeWalletError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

describe("isDeviceRecoverableError", () => {
  it("accepts a locked device", () => {
    expect(
      isDeviceRecoverableError(
        new FakeWalletError("DEVICE_LOCKED", "Device is locked (0x5515)"),
      ),
    ).toBe(true);
  });

  it("accepts the wrong app open on the device", () => {
    expect(
      isDeviceRecoverableError(
        new FakeWalletError(
          "DEVICE_WRONG_APP",
          "The running app does not handle vault instructions",
        ),
      ),
    ).toBe(true);
  });

  it("accepts a dropped device approval", () => {
    expect(
      isDeviceRecoverableError(
        new FakeWalletError(
          "DEVICE_CEREMONY_INVALID",
          "The device no longer holds the approved intent (SW_BAD_STATE)",
        ),
      ),
    ).toBe(true);
  });

  it("finds the device code through a broadcast wrapper's cause chain", () => {
    const wrapped = new Error("Failed to broadcast Pre-PegIn transaction", {
      cause: new FakeWalletError("DEVICE_LOCKED", "Device is locked (0x5515)"),
    });

    expect(isDeviceRecoverableError(wrapped)).toBe(true);
  });

  it("rejects a user cancellation", () => {
    expect(
      isDeviceRecoverableError(
        new FakeWalletError(
          "CONNECTION_REJECTED",
          "User rejected the PSBT signing request",
        ),
      ),
    ).toBe(false);
  });

  it("rejects a generic error", () => {
    expect(isDeviceRecoverableError(new Error("Bitcoin RPC unreachable"))).toBe(
      false,
    );
  });
});
