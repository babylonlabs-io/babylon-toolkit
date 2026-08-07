import { describe, expect, it } from "vitest";
import {
  DepositTermsRejectedError,
  isDepositTermsRejectedError,
} from "../depositTermsErrors";

describe("isDepositTermsRejectedError", () => {
  it("matches the SDK class and the documented provider shape", () => {
    expect(
      isDepositTermsRejectedError(new DepositTermsRejectedError("x")),
    ).toBe(true);
    // A provider (or foreign realm) throwing the documented plain shape.
    expect(
      isDepositTermsRejectedError({
        name: "DepositTermsRejectedError",
        reason: "device-envelope",
        message: "x",
      }),
    ).toBe(true);
  });

  it("refuses contract violations and unrelated errors", () => {
    // Name without the documented reason is a contract violation.
    expect(
      isDepositTermsRejectedError({
        name: "DepositTermsRejectedError",
        message: "x",
      }),
    ).toBe(false);
    expect(isDepositTermsRejectedError(new Error("x"))).toBe(false);
    expect(isDepositTermsRejectedError(null)).toBe(false);
  });
});
