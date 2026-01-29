/**
 * Tests for pending activities service
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApplicationRegistration } from "@/applications/types";
import { getNetworkConfigBTC } from "@/config";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import type { PendingPeginRequest } from "@/storage/peginStorage";
import type { PendingVaultInfo } from "@/storage/pendingCollateralStorage";

import { getPendingActivities } from "../pendingActivities";

// Mock dependencies
vi.mock("@/storage/peginStorage", () => ({
  getPendingPegins: vi.fn(),
}));

vi.mock("@/storage/pendingCollateralStorage", () => ({
  getPendingCollateralVaults: vi.fn(),
}));

vi.mock("@/applications", () => ({
  getApplicationMetadataByController: vi.fn(),
  getEnabledApplications: vi.fn(),
}));

const btcConfig = getNetworkConfigBTC();

/**
 * Create a mock ApplicationRegistration for testing
 */
function createMockApp(id: string, name: string): ApplicationRegistration {
  return {
    metadata: {
      id,
      name,
      type: "Lending",
      description: `${name} description`,
      logoUrl: `/images/${id}.svg`,
      websiteUrl: `https://${id}.com`,
    },
    Routes: () => null,
    contracts: {
      abi: [],
      functionNames: {
        redeem: "redeem",
      },
    },
  };
}

describe("getPendingActivities", () => {
  const mockEthAddress = "0x1234567890abcdef1234567890abcdef12345678";
  const mockTimestamp = 1700000000000;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(mockTimestamp);
  });

  describe("pending deposits", () => {
    it("should convert pending pegins to ActivityLog format", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getEnabledApplications, getApplicationMetadataByController } =
        await import("@/applications");

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp - 60000, // 1 minute ago
        amount: "1.5",
        status: LocalStorageStatus.PENDING,
        applicationController: "0xcontroller",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
      vi.mocked(getEnabledApplications).mockReturnValue([]);
      vi.mocked(getApplicationMetadataByController).mockReturnValue({
        id: "aave",
        name: "Aave",
        type: "Lending",
        description: "Aave lending protocol",
        logoUrl: "/images/aave.svg",
        websiteUrl: "https://aave.com",
      });

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "0xabc123",
        type: "Pending Deposit",
        isPending: true,
        amount: {
          value: "1.5",
          symbol: btcConfig.coinSymbol,
        },
        application: {
          id: "aave",
          name: "Aave",
        },
        transactionHash: "",
      });
    });

    it("should use fallback app metadata when controller is unknown", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getEnabledApplications, getApplicationMetadataByController } =
        await import("@/applications");

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp,
        status: LocalStorageStatus.PENDING,
        // No applicationController
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
      vi.mocked(getEnabledApplications).mockReturnValue([]);
      vi.mocked(getApplicationMetadataByController).mockReturnValue(undefined);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(1);
      expect(result[0].application).toMatchObject({
        id: "unknown",
        name: "Unknown App",
      });
    });
  });

  describe("pending collateral operations", () => {
    it("should convert pending add collateral to ActivityLog format", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getPendingCollateralVaults } = await import(
        "@/storage/pendingCollateralStorage"
      );
      const { getEnabledApplications } = await import("@/applications");

      const mockApp = createMockApp("aave", "Aave");

      const mockPendingVault: PendingVaultInfo = {
        id: "vault123",
        operation: "add",
      };

      vi.mocked(getPendingPegins).mockReturnValue([]);
      vi.mocked(getEnabledApplications).mockReturnValue([mockApp]);
      vi.mocked(getPendingCollateralVaults).mockReturnValue([mockPendingVault]);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "pending-collateral-aave-vault123",
        type: "Pending Add Collateral",
        isPending: true,
        application: {
          id: "aave",
          name: "Aave",
        },
        transactionHash: "",
      });
    });

    it("should convert pending withdraw collateral to ActivityLog format", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getPendingCollateralVaults } = await import(
        "@/storage/pendingCollateralStorage"
      );
      const { getEnabledApplications } = await import("@/applications");

      const mockApp = createMockApp("aave", "Aave");

      const mockPendingVault: PendingVaultInfo = {
        id: "vault456",
        operation: "withdraw",
      };

      vi.mocked(getPendingPegins).mockReturnValue([]);
      vi.mocked(getEnabledApplications).mockReturnValue([mockApp]);
      vi.mocked(getPendingCollateralVaults).mockReturnValue([mockPendingVault]);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "Pending Remove Collateral",
        isPending: true,
      });
    });
  });

  describe("combined activities", () => {
    it("should combine and sort by date (newest first)", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getPendingCollateralVaults } = await import(
        "@/storage/pendingCollateralStorage"
      );
      const { getEnabledApplications, getApplicationMetadataByController } =
        await import("@/applications");

      const mockApp = createMockApp("aave", "Aave");

      // Older deposit
      const mockPendingPegin: PendingPeginRequest = {
        id: "0xold",
        timestamp: mockTimestamp - 120000, // 2 minutes ago
        status: LocalStorageStatus.PENDING,
      };

      // Newer collateral operation (uses Date.now() internally)
      const mockPendingVault: PendingVaultInfo = {
        id: "new",
        operation: "add",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
      vi.mocked(getEnabledApplications).mockReturnValue([mockApp]);
      vi.mocked(getPendingCollateralVaults).mockReturnValue([mockPendingVault]);
      vi.mocked(getApplicationMetadataByController).mockReturnValue(undefined);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(2);
      // Collateral operation should be first (newer - uses Date.now())
      expect(result[0].type).toBe("Pending Add Collateral");
      // Deposit should be second (older)
      expect(result[1].type).toBe("Pending Deposit");
    });

    it("should return empty array for empty address", async () => {
      const result = getPendingActivities("");

      expect(result).toEqual([]);
    });
  });
});
