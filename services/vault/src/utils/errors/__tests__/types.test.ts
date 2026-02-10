import { describe, expect, it } from "vitest";

import { ApiError, isError451 } from "../types";

describe("isError451", () => {
  describe("returns true for 451 status", () => {
    it("detects 451 status on ApiError", () => {
      const error = new ApiError("Geo blocked", 451);
      expect(isError451(error)).toBe(true);
    });

    it("detects 451 status on plain object with status property", () => {
      const error = { status: 451, message: "Blocked" };
      expect(isError451(error)).toBe(true);
    });
  });

  describe("returns false for non-451 status", () => {
    it("returns false for 200 status", () => {
      const error = new ApiError("Success", 200);
      expect(isError451(error)).toBe(false);
    });

    it("returns false for 400 status", () => {
      const error = new ApiError("Bad request", 400);
      expect(isError451(error)).toBe(false);
    });

    it("returns false for 404 status", () => {
      const error = new ApiError("Not found", 404);
      expect(isError451(error)).toBe(false);
    });

    it("returns false for 500 status", () => {
      const error = new ApiError("Server error", 500);
      expect(isError451(error)).toBe(false);
    });

    it("returns false for 0 status (network error)", () => {
      const error = new ApiError("Network error", 0);
      expect(isError451(error)).toBe(false);
    });
  });

  describe("handles edge cases", () => {
    it("returns false for null", () => {
      expect(isError451(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isError451(undefined)).toBe(false);
    });

    it("returns false for string", () => {
      expect(isError451("error")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isError451(451)).toBe(false);
    });

    it("returns false for object without status property", () => {
      expect(isError451({ message: "error" })).toBe(false);
    });

    it("returns false for object with non-number status", () => {
      expect(isError451({ status: "451" })).toBe(false);
    });

    it("returns false for regular Error without status", () => {
      expect(isError451(new Error("Some error"))).toBe(false);
    });

    it("returns false for empty object", () => {
      expect(isError451({})).toBe(false);
    });
  });
});
