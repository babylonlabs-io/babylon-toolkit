import { describe, expect, it } from "vitest";

import { normalizeError } from "../normalizeError";
import { isUserCancellation } from "../userCancellation";

describe("normalizeError", () => {
  it("returns an Error unchanged", () => {
    const error = new TypeError("bad input");

    expect(normalizeError(error)).toBe(error);
  });

  it("takes the message of a plain-object rejection", () => {
    const error = normalizeError({ code: 4001, message: "User rejected" });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("User rejected");
  });

  it("keeps a scalar code and errorCode", () => {
    const error = normalizeError({
      code: 4001,
      errorCode: "WALLET_REJECTED",
      message: "",
    });

    expect(error).toHaveProperty("code", 4001);
    expect(error).toHaveProperty("errorCode", "WALLET_REJECTED");
  });

  it("drops a code that is not a string or number", () => {
    const error = normalizeError({ code: { nested: true }, message: "fail" });

    expect(error).not.toHaveProperty("code");
  });

  it("keeps a 4001 rejection recognizable as a user cancellation", () => {
    const error = normalizeError({ code: 4001, message: "Request declined" });

    expect(isUserCancellation(error)).toBe(true);
  });

  it("keeps a cancellation message recognizable as a user cancellation", () => {
    const error = normalizeError({ message: "User rejected the request." });

    expect(isUserCancellation(error)).toBe(true);
  });

  it("keeps the name of an error-like object", () => {
    const error = normalizeError({
      name: "TypeError",
      message: "Failed to fetch",
    });

    expect(error.name).toBe("TypeError");
    expect(error.message).toBe("Failed to fetch");
  });

  it("falls back to String() when the message is empty", () => {
    expect(normalizeError({ message: "" }).message).toBe("[object Object]");
  });

  it("falls back to String() when the message is not a string", () => {
    expect(normalizeError({ message: 42 }).message).toBe("[object Object]");
  });

  it("stringifies a primitive", () => {
    expect(normalizeError("wallet closed").message).toBe("wallet closed");
    expect(normalizeError(null).message).toBe("null");
  });
});
