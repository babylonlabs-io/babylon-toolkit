/** Tests for vault UTXO reservation utilities. */

import { describe, expect, it } from "vitest";

import { ContractStatus } from "../../../models/peginStateMachine";
import type { PendingPeginRequest } from "../../../storage/peginStorage";
import type { Vault } from "../../../types/vault";
import {
  collectReservedUtxoRefs,
  selectUtxosForDeposit,
  type UtxoRef,
} from "../utxoReservation";

/** Minimal UTXO interface for testing. */
interface TestUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
}

/** Helper to check if a UtxoRef exists in array. */
function hasRef(refs: UtxoRef[], txid: string, vout: number): boolean {
  return refs.some(
    (ref) => ref.txid.toLowerCase() === txid.toLowerCase() && ref.vout === vout,
  );
}

describe("UTXO Reservation", () => {
  describe("collectReservedUtxoRefs", () => {
    const mockPendingPegin: PendingPeginRequest = {
      id: "0x1234",
      timestamp: Date.now(),
      status: "pending" as any,
      selectedUTXOs: [
        { txid: "txid1", vout: 0, value: "50000", scriptPubKey: "script1" },
        { txid: "txid2", vout: 1, value: "100000", scriptPubKey: "script2" },
      ],
    };

    // Valid transaction hex for testing unsignedTxHex parsing
    const VALID_TX_FOR_PENDING =
      "0100000001" +
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" + // prev txid (LE)
      "03000000" + // prev vout = 3
      "6b" +
      "483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301210484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5" +
      "ffffffff" +
      "01" +
      "605af40500000000" +
      "19" +
      "76a914887c6824d03eb8997b1e28c1d81b4e5c8c96d41688ac" +
      "00000000";

    const mockPendingPeginWithTxHex: PendingPeginRequest = {
      id: "0x5678",
      timestamp: Date.now(),
      status: "pending" as any,
      unsignedTxHex: VALID_TX_FOR_PENDING,
    };

    // Helper to create a valid transaction hex with a specific prev txid
    const createValidTxHex = (prevTxidLE: string, prevVout: number): string => {
      const voutHex = prevVout.toString(16).padStart(8, "0");
      const voutLE =
        voutHex.slice(6, 8) +
        voutHex.slice(4, 6) +
        voutHex.slice(2, 4) +
        voutHex.slice(0, 2);
      return (
        "0100000001" +
        prevTxidLE +
        voutLE +
        "6b" +
        "483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301210484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5" +
        "ffffffff" +
        "01" +
        "605af40500000000" +
        "19" +
        "76a914887c6824d03eb8997b1e28c1d81b4e5c8c96d41688ac" +
        "00000000"
      );
    };

    const createMockVault = (
      status: ContractStatus,
      unsignedBtcTx: string,
    ): Vault => ({
      id: "0xvault1" as any,
      depositor: "0xdepositor" as any,
      depositorBtcPubkey: "0xpubkey" as any,
      unsignedBtcTx: unsignedBtcTx as any,
      amount: 100000n,
      vaultProvider: "0xprovider" as any,
      status,
      applicationController: "0xcontroller" as any,
      createdAt: Date.now(),
      isInUse: false,
      appVaultKeepersVersion: 1,
      universalChallengersVersion: 1,
    });

    it("should collect refs from localStorage selectedUTXOs", () => {
      const reserved = collectReservedUtxoRefs({
        pendingPegins: [mockPendingPegin],
        vaults: [],
      });

      expect(reserved).toHaveLength(2);
      expect(hasRef(reserved, "txid1", 0)).toBe(true);
      expect(hasRef(reserved, "txid2", 1)).toBe(true);
    });

    it("should fall back to parsing unsignedTxHex when selectedUTXOs absent", () => {
      const reserved = collectReservedUtxoRefs({
        pendingPegins: [mockPendingPeginWithTxHex],
        vaults: [],
      });

      expect(reserved).toHaveLength(1);
      expect(
        hasRef(
          reserved,
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          3,
        ),
      ).toBe(true);
    });

    it("should include refs from PENDING vaults", () => {
      const vault = createMockVault(
        ContractStatus.PENDING,
        createValidTxHex(
          "1111111111111111111111111111111111111111111111111111111111111111",
          0,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [vault],
      });

      expect(reserved).toHaveLength(1);
      expect(
        hasRef(
          reserved,
          "1111111111111111111111111111111111111111111111111111111111111111",
          0,
        ),
      ).toBe(true);
    });

    it("should include refs from VERIFIED vaults", () => {
      const vault = createMockVault(
        ContractStatus.VERIFIED,
        createValidTxHex(
          "2222222222222222222222222222222222222222222222222222222222222222",
          1,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [vault],
      });

      expect(reserved).toHaveLength(1);
      expect(
        hasRef(
          reserved,
          "2222222222222222222222222222222222222222222222222222222222222222",
          1,
        ),
      ).toBe(true);
    });

    it("should NOT include refs from ACTIVE vaults", () => {
      const vault = createMockVault(
        ContractStatus.ACTIVE,
        createValidTxHex(
          "3333333333333333333333333333333333333333333333333333333333333333",
          0,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [vault],
      });

      expect(reserved).toHaveLength(0);
    });

    it("should NOT include refs from REDEEMED vaults", () => {
      const vault = createMockVault(
        ContractStatus.REDEEMED,
        createValidTxHex(
          "4444444444444444444444444444444444444444444444444444444444444444",
          0,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [vault],
      });

      expect(reserved).toHaveLength(0);
    });

    it("should NOT include refs from LIQUIDATED vaults", () => {
      const vault = createMockVault(
        ContractStatus.LIQUIDATED,
        createValidTxHex(
          "5555555555555555555555555555555555555555555555555555555555555555",
          0,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [vault],
      });

      expect(reserved).toHaveLength(0);
    });

    it("should NOT include refs from INVALID vaults", () => {
      const vault = createMockVault(
        ContractStatus.INVALID,
        createValidTxHex(
          "6666666666666666666666666666666666666666666666666666666666666666",
          0,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [vault],
      });

      expect(reserved).toHaveLength(0);
    });

    it("should NOT include refs from DEPOSITOR_WITHDRAWN vaults", () => {
      const vault = createMockVault(
        ContractStatus.DEPOSITOR_WITHDRAWN,
        createValidTxHex(
          "7777777777777777777777777777777777777777777777777777777777777777",
          0,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [vault],
      });

      expect(reserved).toHaveLength(0);
    });

    it("should combine refs from multiple sources", () => {
      const pendingVault = createMockVault(
        ContractStatus.PENDING,
        createValidTxHex(
          "5555555555555555555555555555555555555555555555555555555555555555",
          0,
        ),
      );

      const reserved = collectReservedUtxoRefs({
        pendingPegins: [mockPendingPegin],
        vaults: [pendingVault],
      });

      expect(reserved).toHaveLength(3); // 2 from localStorage + 1 from vault
      expect(hasRef(reserved, "txid1", 0)).toBe(true);
      expect(hasRef(reserved, "txid2", 1)).toBe(true);
      expect(
        hasRef(
          reserved,
          "5555555555555555555555555555555555555555555555555555555555555555",
          0,
        ),
      ).toBe(true);
    });

    it("should handle empty inputs", () => {
      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [],
      });

      expect(reserved).toHaveLength(0);
    });

    it("should handle undefined inputs", () => {
      const reserved = collectReservedUtxoRefs({});

      expect(reserved).toHaveLength(0);
    });
  });

  describe("selectUtxosForDeposit", () => {
    const mockUTXOs: TestUTXO[] = [
      { txid: "txid1", vout: 0, value: 50000, scriptPubKey: "script1" },
      { txid: "txid2", vout: 1, value: 100000, scriptPubKey: "script2" },
      { txid: "txid3", vout: 0, value: 75000, scriptPubKey: "script3" },
      { txid: "txid4", vout: 2, value: 200000, scriptPubKey: "script4" },
    ];
    // Total value: 425000

    // Default fee rate for tests (10 sat/vB)
    // Fee buffer at 10 sat/vB: (2*58 + 43 + 43 + 11) * 10 * 1.1 ≈ 2343 sats
    const DEFAULT_FEE_RATE = 10;

    describe("no reservations", () => {
      it("should return all UTXOs when no reserved refs", () => {
        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: [],
          requiredAmount: 100000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(4);
        expect(result).toEqual(mockUTXOs);
      });
    });

    describe("with reservations - unreserved sufficient", () => {
      it("should filter out reserved UTXOs when unreserved are sufficient", () => {
        // Reserve txid1 (50000) and txid3 (75000)
        // Unreserved: txid2 (100000) + txid4 (200000) = 300000
        // Required: 200000 + ~2343 fee buffer -> unreserved sufficient
        const reserved: UtxoRef[] = [
          { txid: "txid1", vout: 0 },
          { txid: "txid3", vout: 0 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 200000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(2);
        expect(result.map((u) => u.txid)).toEqual(["txid2", "txid4"]);
      });

      it("should handle partial reservation without fallback", () => {
        // Reserve only txid1 (50000)
        // Unreserved: 375000 total
        // Required: 100000 + ~2343 fee buffer -> sufficient
        const reserved: UtxoRef[] = [{ txid: "txid1", vout: 0 }];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 100000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(3);
        expect(result.map((u) => u.txid)).toEqual(["txid2", "txid3", "txid4"]);
      });
    });

    describe("fallback conditions", () => {
      it("should fallback to all UTXOs when all are reserved", () => {
        const reserved: UtxoRef[] = [
          { txid: "txid1", vout: 0 },
          { txid: "txid2", vout: 1 },
          { txid: "txid3", vout: 0 },
          { txid: "txid4", vout: 2 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 100000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(4);
        expect(result).toEqual(mockUTXOs);
      });

      it("should fallback when unreserved UTXOs are insufficient for required amount + fee", () => {
        // Reserve txid2 (100000) and txid4 (200000)
        // Unreserved: txid1 (50000) + txid3 (75000) = 125000
        // Required: 200000 + ~2343 fee buffer -> unreserved insufficient -> fallback
        const reserved: UtxoRef[] = [
          { txid: "txid2", vout: 1 },
          { txid: "txid4", vout: 2 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 200000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(4);
        expect(result).toEqual(mockUTXOs);
      });

      it("should NOT fallback when unreserved value covers required + fee buffer", () => {
        // Reserve txid1 (50000), txid3 (75000), txid4 (200000)
        // Unreserved: txid2 (100000)
        // Required: 95000 + ~2343 fee buffer ≈ 97343 < 100000 -> should NOT fallback
        const reserved: UtxoRef[] = [
          { txid: "txid1", vout: 0 },
          { txid: "txid3", vout: 0 },
          { txid: "txid4", vout: 2 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 95000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(1);
        expect(result[0].txid).toBe("txid2");
      });

      it("should fallback when unreserved value insufficient for required + fee buffer", () => {
        // Reserve txid1 (50000), txid3 (75000), txid4 (200000)
        // Unreserved: txid2 (100000)
        // Required: 98000 + ~2343 fee buffer ≈ 100343 > 100000 -> insufficient -> fallback
        const reserved: UtxoRef[] = [
          { txid: "txid1", vout: 0 },
          { txid: "txid3", vout: 0 },
          { txid: "txid4", vout: 2 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 98000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(4);
        expect(result).toEqual(mockUTXOs);
      });
    });

    describe("edge cases", () => {
      it("should return empty array when no UTXOs available", () => {
        const result = selectUtxosForDeposit({
          availableUtxos: [],
          reservedUtxoRefs: [{ txid: "txid1", vout: 0 }],
          requiredAmount: 100000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(result).toHaveLength(0);
      });

      it("should handle zero required amount", () => {
        const reserved: UtxoRef[] = [
          { txid: "txid1", vout: 0 },
          { txid: "txid2", vout: 1 },
          { txid: "txid3", vout: 0 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 0n,
          feeRate: DEFAULT_FEE_RATE,
        });

        // Unreserved: txid4 (200000) >= 0 + fee buffer, so use unreserved
        expect(result).toHaveLength(1);
        expect(result[0].txid).toBe("txid4");
      });

      it("should handle case-insensitive txid matching", () => {
        // Reserved with uppercase txid
        const reserved: UtxoRef[] = [{ txid: "TXID1", vout: 0 }];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 100000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        // Should match case-insensitively, so txid1 is filtered out
        expect(result).toHaveLength(3);
        expect(result.map((u) => u.txid)).toEqual(["txid2", "txid3", "txid4"]);
      });

      it("should not modify original array", () => {
        const reserved: UtxoRef[] = [{ txid: "txid1", vout: 0 }];
        const originalLength = mockUTXOs.length;

        selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 100000n,
          feeRate: DEFAULT_FEE_RATE,
        });

        expect(mockUTXOs).toHaveLength(originalLength);
      });
    });

    describe("fee buffer calculation", () => {
      it("should use fee buffer in sufficiency check", () => {
        // Reserve txid1 (50000), txid3 (75000), txid4 (200000)
        // Unreserved: txid2 (100000)
        // At 100 sat/vB: fee buffer ≈ 23430 sats
        // Required: 80000 + 23430 = 103430 > 100000 -> fallback
        const reserved: UtxoRef[] = [
          { txid: "txid1", vout: 0 },
          { txid: "txid3", vout: 0 },
          { txid: "txid4", vout: 2 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 80000n,
          feeRate: 100, // High fee rate
        });

        // Should fallback due to fee buffer
        expect(result).toHaveLength(4);
        expect(result).toEqual(mockUTXOs);
      });

      it("should not fallback with low fee rate", () => {
        // Same setup but with fee rate of 1 sat/vB
        // Fee buffer ≈ 234 sats
        // Required: 80000 + 234 = 80234 < 100000 -> unreserved sufficient
        const reserved: UtxoRef[] = [
          { txid: "txid1", vout: 0 },
          { txid: "txid3", vout: 0 },
          { txid: "txid4", vout: 2 },
        ];

        const result = selectUtxosForDeposit({
          availableUtxos: mockUTXOs,
          reservedUtxoRefs: reserved,
          requiredAmount: 80000n,
          feeRate: 1, // Low fee rate
        });

        // Should NOT fallback
        expect(result).toHaveLength(1);
        expect(result[0].txid).toBe("txid2");
      });
    });
  });
});
