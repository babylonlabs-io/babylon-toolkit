/**
 * Example test file demonstrating test patterns
 * This demonstrates how to structure tests in the SDK
 */

import { describe, expect, it } from "vitest";

describe("SDK Shared Module", () => {
  describe("Example Test Suite", () => {
    it("should pass a basic test", () => {
      expect(true).toBe(true);
    });

    it("should perform basic arithmetic", () => {
      const sum = 2 + 2;
      expect(sum).toBe(4);
    });

    it("should handle async operations", async () => {
      const result = await Promise.resolve("success");
      expect(result).toBe("success");
    });
  });

  describe("Type Safety Examples", () => {
    it("should work with typed objects", () => {
      const user = {
        id: 1,
        name: "Test User",
      };

      expect(user.id).toBe(1);
      expect(user.name).toBe("Test User");
    });

    it("should validate array operations", () => {
      const numbers = [1, 2, 3, 4, 5];
      const doubled = numbers.map((n) => n * 2);

      expect(doubled).toEqual([2, 4, 6, 8, 10]);
      expect(doubled).toHaveLength(5);
    });
  });

  describe("Error Handling", () => {
    it("should catch and validate errors", () => {
      expect(() => {
        throw new Error("Test error");
      }).toThrow("Test error");
    });

    it("should handle async errors", async () => {
      await expect(
        Promise.reject(new Error("Async error")),
      ).rejects.toThrow("Async error");
    });
  });
});
