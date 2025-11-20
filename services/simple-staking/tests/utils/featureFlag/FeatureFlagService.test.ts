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

  describe("IsCoStakingEnabled", () => {
    it("should return false when NEXT_PUBLIC_FF_CO_STAKING is not set", () => {
      delete process.env.NEXT_PUBLIC_FF_CO_STAKING;
      expect(FeatureFlagService.IsCoStakingEnabled).toBe(false);
    });

    it('should return false when NEXT_PUBLIC_FF_CO_STAKING is set to "false"', () => {
      process.env.NEXT_PUBLIC_FF_CO_STAKING = "false";
      expect(FeatureFlagService.IsCoStakingEnabled).toBe(false);
    });

    it('should return true when NEXT_PUBLIC_FF_CO_STAKING is set to "true"', () => {
      process.env.NEXT_PUBLIC_FF_CO_STAKING = "true";
      expect(FeatureFlagService.IsCoStakingEnabled).toBe(true);
    });
  });

  describe("IsTimelockRenewalEnabled", () => {
    it("should return false when NEXT_PUBLIC_FF_TIMELOCK_RENEWAL is not set", () => {
      delete process.env.NEXT_PUBLIC_FF_TIMELOCK_RENEWAL;
      expect(FeatureFlagService.IsTimelockRenewalEnabled).toBe(false);
    });

    it('should return false when NEXT_PUBLIC_FF_TIMELOCK_RENEWAL is set to "false"', () => {
      process.env.NEXT_PUBLIC_FF_TIMELOCK_RENEWAL = "false";
      expect(FeatureFlagService.IsTimelockRenewalEnabled).toBe(false);
    });

    it('should return true when NEXT_PUBLIC_FF_TIMELOCK_RENEWAL is set to "true"', () => {
      process.env.NEXT_PUBLIC_FF_TIMELOCK_RENEWAL = "true";
      expect(FeatureFlagService.IsTimelockRenewalEnabled).toBe(true);
    });
  });

  describe("Feature flag behavior", () => {
    it("should handle multiple feature flags independently", () => {
      process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER = "false";
      process.env.NEXT_PUBLIC_FF_CO_STAKING = "true";

      expect(FeatureFlagService.IsLedgerEnabled).toBe(false);
      expect(FeatureFlagService.IsCoStakingEnabled).toBe(true);
    });

    it("should handle case sensitivity correctly", () => {
      process.env.NEXT_PUBLIC_FF_ENABLE_LEDGER = "True";
      process.env.NEXT_PUBLIC_FF_CO_STAKING = "True";

      expect(FeatureFlagService.IsLedgerEnabled).toBe(false);
      expect(FeatureFlagService.IsCoStakingEnabled).toBe(false);
    });
  });
});
