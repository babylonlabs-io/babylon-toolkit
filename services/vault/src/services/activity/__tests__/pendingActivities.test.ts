import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNetworkConfigBTC } from "@/config";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import type { PendingPeginRequest } from "@/storage/peginStorage";

import { getPendingActivities } from "../pendingActivities";

vi.mock("@/storage/peginStorage", () => ({
  getPendingPegins: vi.fn(),
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
    it("should convert pending pegins to ActivityLog format with tokenIcon", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        peginTxHash: "0xpeginTxHash123",
        timestamp: mockTimestamp - 60000,
        amount: "1.5",
        status: LocalStorageStatus.PENDING,
        applicationEntryPoint: "0xcontroller",
        unsignedTxHex: "0xdeadbeef",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "0xabc123",
        type: "Pending Deposit",
        isPending: true,
        tokenIcon: btcConfig.icon,
        amount: {
          value: "1.5",
          symbol: btcConfig.coinSymbol,
        },
        chain: "BTC",
        transactionHash: "0xpeginTxHash123",
      });
    });

    it("should include peginTxHash when available", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        timestamp: mockTimestamp - 60000,
        amount: "1.5",
        status: LocalStorageStatus.CONFIRMING,
        applicationEntryPoint: "0xcontroller",
        peginTxHash: "0xbtctxhash123",
        unsignedTxHex: "0xdeadbeef",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(1);
      expect(result[0].transactionHash).toBe("0xbtctxhash123");
    });

    it("should produce a row with tokenIcon when applicationEntryPoint is missing", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        peginTxHash: "0xpeginTxHash123",
        timestamp: mockTimestamp,
        amount: "1.5",
        status: LocalStorageStatus.PENDING,
        unsignedTxHex: "0xdeadbeef",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "0xabc123",
        type: "Pending Deposit",
        isPending: true,
        tokenIcon: btcConfig.icon,
      });
    });

    it("should skip pegins without amount", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");

      const mockPendingPegin: PendingPeginRequest = {
        id: "0xabc123",
        peginTxHash: "0xpeginTxHash123",
        timestamp: mockTimestamp,
        status: LocalStorageStatus.PENDING,
        applicationEntryPoint: "0xcontroller",
        unsignedTxHex: "0xdeadbeef",
      };

      vi.mocked(getPendingPegins).mockReturnValue([mockPendingPegin]);

      const result = getPendingActivities(mockEthAddress);

      expect(result).toHaveLength(0);
    });

    it("should sort multiple deposits by date (newest first)", async () => {
      const { getPendingPegins } = await import("@/storage/peginStorage");

      const mockPegins: PendingPeginRequest[] = [
        {
          id: "0xolder",
          peginTxHash: "0xpeginTxHashOlder",
          timestamp: mockTimestamp - 120000,
          amount: "1.0",
          status: LocalStorageStatus.PENDING,
          applicationEntryPoint: "0xcontroller",
          unsignedTxHex: "0xdeadbeef",
        },
        {
          id: "0xnewer",
          peginTxHash: "0xpeginTxHashNewer",
          timestamp: mockTimestamp - 60000,
          amount: "2.0",
          status: LocalStorageStatus.PENDING,
          applicationEntryPoint: "0xcontroller",
          unsignedTxHex: "0xdeadbeef",
        },
      ];

      vi.mocked(getPendingPegins).mockReturnValue(mockPegins);

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
