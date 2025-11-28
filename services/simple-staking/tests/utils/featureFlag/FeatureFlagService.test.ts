import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

describe("FeatureFlagService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore process.env after each test
    process.env = originalEnv;
  });

  describe("IsLedgerEnabled", () => {
    it("should return false when NEXT_PUBLIC_FF_ENABLE_LEDGER is not set", () => {
      delete process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER;
      expect(FeatureFlagService.IsLedgerEnabled).toBe(false);
    });

    it('should return false when NEXT_PUBLIC_FF_ENABLE_LEDGER is set to "false"', () => {
      process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER = "false";
      expect(FeatureFlagService.IsLedgerEnabled).toBe(false);
    });

    it('should return true when NEXT_PUBLIC_FF_ENABLE_LEDGER is set to "true"', () => {
      process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER = "true";
      expect(FeatureFlagService.IsLedgerEnabled).toBe(true);
    });
  });

  describe("IsTimelockSelectorEnabled", () => {
    it("should return false when NEXT_PUBLIC_FF_ENABLE_TIMELOCK_SELECTOR is not set", () => {
      delete process.env.NEXT_PUBLIC_FF_ENABLE_TIMELOCK_SELECTOR;
      expect(FeatureFlagService.IsTimelockSelectorEnabled).toBe(false);
    });

    it('should return false when NEXT_PUBLIC_FF_ENABLE_TIMELOCK_SELECTOR is set to "false"', () => {
      process.env.NEXT_PUBLIC_FF_ENABLE_TIMELOCK_SELECTOR = "false";
      expect(FeatureFlagService.IsTimelockSelectorEnabled).toBe(false);
    });

    it('should return true when NEXT_PUBLIC_FF_ENABLE_TIMELOCK_SELECTOR is set to "true"', () => {
      process.env.NEXT_PUBLIC_FF_ENABLE_TIMELOCK_SELECTOR = "true";
      expect(FeatureFlagService.IsTimelockSelectorEnabled).toBe(true);
    });
  });

  describe("Feature flag behavior", () => {
    it("should handle case sensitivity correctly", () => {
      process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER = "True";

      expect(FeatureFlagService.IsLedgerEnabled).toBe(false);
    });
  });
});
