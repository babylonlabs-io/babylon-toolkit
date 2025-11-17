/**
 * Test setup file for Vitest
 * This file runs before all test files
 */

import { beforeEach, vi } from "vitest";

// Clear all mocks before each test to prevent test interference
beforeEach(() => {
  vi.clearAllMocks();
});

// Global test configuration
// Add any global test utilities or mocks here
