import {
  filterFinalityProvidersByBsn,
  type FinalityProviderFilterState,
} from "@/ui/common/services/finalityProviderFilterService";
import { 
  FinalityProviderState as FinalityProviderStateEnum,
  type FinalityProvider 
} from "@/ui/common/types/finalityProviders";
import type { Bsn } from "@/ui/common/types/bsn";

describe("BSN Allowlist Filter Bug Fix", () => {
  const mockFPs: FinalityProvider[] = [
    { btcPk: "0x1111", state: FinalityProviderStateEnum.ACTIVE } as FinalityProvider,
    { btcPk: "0x2222", state: FinalityProviderStateEnum.INACTIVE } as FinalityProvider,
    { btcPk: "0x3333", state: FinalityProviderStateEnum.SLASHED } as FinalityProvider,
  ];

  const rollupWithAllowlist: Bsn = {
    id: "test", name: "Test", description: "", logoUrl: "", type: "ROLLUP",
    allowlist: ["1111"],
  };

  const rollupWithoutAllowlist: Bsn = {
    id: "test", name: "Test", description: "", logoUrl: "", type: "ROLLUP",
  };

  const filter: FinalityProviderFilterState = {
    searchTerm: "", providerStatus: "", allowlistStatus: "",
  };

  describe("ROLLUP without allowlist", () => {
    it("should return NO allowlisted FPs when no allowlist exists", () => {
      const result = filterFinalityProvidersByBsn(
        mockFPs,
        { ...filter, providerStatus: "allowlisted" },
        rollupWithoutAllowlist,
      );
      
      expect(result).toHaveLength(0);
    });

    it("should return only active/inactive FPs as non-allowlisted when no allowlist exists", () => {
      const result = filterFinalityProvidersByBsn(
        mockFPs,
        { ...filter, providerStatus: "non-allowlisted" },
        rollupWithoutAllowlist,
      );
      
      expect(result).toHaveLength(2);
      expect(result[0].state).toBe(FinalityProviderStateEnum.ACTIVE);
      expect(result[1].state).toBe(FinalityProviderStateEnum.INACTIVE);
    });
  });

  describe("ROLLUP with allowlist", () => {
    it("should filter allowlisted providers correctly", () => {
      const result = filterFinalityProvidersByBsn(
        mockFPs,
        { ...filter, providerStatus: "allowlisted" },
        rollupWithAllowlist,
      );
      
      expect(result).toHaveLength(1);
      expect(result[0].btcPk).toBe("0x1111");
    });

    it("should filter non-allowlisted providers correctly", () => {
      const result = filterFinalityProvidersByBsn(
        mockFPs,
        { ...filter, providerStatus: "non-allowlisted" },
        rollupWithAllowlist,
      );
      
      expect(result).toHaveLength(2);
      expect(result[0].btcPk).toBe("0x2222");
      expect(result[1].btcPk).toBe("0x3333");
    });
  });

  describe("undefined BSN", () => {
    it("handles undefined BSN gracefully", () => {
      expect(() => {
        filterFinalityProvidersByBsn(mockFPs, filter, undefined);
      }).not.toThrow();
    });
  });
});
