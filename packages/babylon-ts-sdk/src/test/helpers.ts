/**
 * Test helper utilities and mocks
 * Reusable utilities for testing across the SDK
 */

import { vi } from "vitest";

/**
 * Creates a mock function with type safety
 */
export function createMockFn<T extends (...args: any[]) => any>(): ReturnType<
  typeof vi.fn<T>
> {
  return vi.fn<T>();
}

/**
 * Waits for a specified number of milliseconds
 * Useful for testing async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a deferred promise that can be resolved/rejected externally
 */
export function createDeferred<T>() {
  let resolve: (value: T) => void;
  let reject: (error: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

/**
 * Type-safe mock creator for complex objects
 */
export function createMock<T>(overrides: Partial<T> = {}): T {
  return overrides as T;
}
