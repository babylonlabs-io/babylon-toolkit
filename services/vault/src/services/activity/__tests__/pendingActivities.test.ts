/**
 * Tests for pending activities service
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNetworkConfigBTC } from "@/config";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import type { PendingPeginRequest } from "@/storage/peginStorage";

import { getPendingActivities } from "../pendingActivities";

// Mock dependencies
vi.mock("@/storage/peginStorage", () => ({
  getPendingPegins: vi.fn(),
}));

vi.mock("@/applications", () => ({
  getApplicationMetadataByController: vi.fn(),
}));

const btcConfig = getNetworkConfigBTC();

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
      const { getApplicationMetadataByController } = await import(
        "@/applications"
      );

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp - 60000, // 1 minute ago
        amount: "1.5",
        status: LocalStorageStatus.PENDING,
        applicationController: "0xcontroller",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
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

    it("should include btcTxHash when available", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getApplicationMetadataByController } = await import(
        "@/applications"
      );

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp - 60000,
        amount: "1.5",
        status: LocalStorageStatus.CONFIRMING,
        applicationController: "0xcontroller",
        btcTxHash: "0xbtctxhash123",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
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
      expect(result[0].transactionHash).toBe("0xbtctxhash123");
    });

    it("should skip pegins without applicationController", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getApplicationMetadataByController } = await import(
        "@/applications"
      );

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp,
        amount: "1.5",
        status: LocalStorageStatus.PENDING,
        // No applicationController
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
      vi.mocked(getApplicationMetadataByController).mockReturnValue(undefined);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(0);
    });

    it("should skip pegins without amount", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getApplicationMetadataByController } = await import(
        "@/applications"
      );

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp,
        status: LocalStorageStatus.PENDING,
        applicationController: "0xcontroller",
        // No amount
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
      vi.mocked(getApplicationMetadataByController).mockReturnValue({
        id: "aave",
        name: "Aave",
        type: "Lending",
        description: "Aave lending protocol",
        logoUrl: "/images/aave.svg",
        websiteUrl: "https://aave.com",
      });

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(0);
    });

    it("should skip pegins with unknown controller", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getApplicationMetadataByController } = await import(
        "@/applications"
      );

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp,
        amount: "1.5",
        status: LocalStorageStatus.PENDING,
        applicationController: "0xunknown",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);
      // Controller can't be resolved to app metadata
      vi.mocked(getApplicationMetadataByController).mockReturnValue(undefined);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(0);
    });

    it("should sort multiple deposits by date (newest first)", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");
      const { getApplicationMetadataByController } = await import(
        "@/applications"
      );

      const mockPegins: PendingPeginRequest[] = [
        {
          id: "0xolder",
          timestamp: mockTimestamp - 120000, // 2 minutes ago
          amount: "1.0",
          status: LocalStorageStatus.PENDING,
          applicationController: "0xcontroller",
        },
        {
          id: "0xnewer",
          timestamp: mockTimestamp - 60000, // 1 minute ago
          amount: "2.0",
          status: LocalStorageStatus.PENDING,
          applicationController: "0xcontroller",
        },
      ];

      vi.mocked(getPendingPegins).mockReturnValue(mockPegins);
      vi.mocked(getApplicationMetadataByController).mockReturnValue({
        id: "aave",
        name: "Aave",
        type: "Lending",
        description: "Aave lending protocol",
        logoUrl: "/images/aave.svg",
        websiteUrl: "https://aave.com",
      });

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("0xnewer");
      expect(result[1].id).toBe("0xolder");
    });
  });

  describe("edge cases", () => {
    it("should return empty array for empty address", async () => {
      const result = getPendingActivities("");

      expect(result).toEqual([]);
    });

    it("should return empty array when no pending pegins exist", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");

      vi.mocked(getPendingPegins).mockReturnValue([]);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toEqual([]);
    });
  });
});
