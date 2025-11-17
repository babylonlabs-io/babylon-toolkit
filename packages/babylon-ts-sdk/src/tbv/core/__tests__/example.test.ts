/**
 * Example test file for TBV Core module
 * Demonstrates testing patterns for vault functionality
 */

import { describe, expect, it, vi } from "vitest";
import { createDeferred, createMockFn } from "../../../test/helpers";

describe("TBV Core Module", () => {
  describe("Placeholder Tests", () => {
    it("should be ready for vault client tests", () => {
      // Placeholder for VaultClient tests
      expect(true).toBe(true);
    });

    it("should demonstrate mock function usage", () => {
      const mockCallback = createMockFn<(value: string) => void>();

      mockCallback("test");

      expect(mockCallback).toHaveBeenCalledWith("test");
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it("should demonstrate deferred promise usage", async () => {
      const deferred = createDeferred<string>();

      setTimeout(() => {
        deferred.resolve("resolved");
      }, 10);

      const result = await deferred.promise;
      expect(result).toBe("resolved");
    });
  });

  describe("Mock Examples", () => {
    it("should work with vi.fn", () => {
      const mockFn = vi.fn((x: number) => x * 2);

      const result = mockFn(5);

      expect(result).toBe(10);
      expect(mockFn).toHaveBeenCalledWith(5);
    });

    it("should work with vi.spyOn", () => {
      const obj = {
        getValue: () => 42,
      };

      const spy = vi.spyOn(obj, "getValue");

      const result = obj.getValue();

      expect(result).toBe(42);
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });
  });
});
