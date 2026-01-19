/** Tests for vault-specific UTXO reservation utilities. */

import { describe, expect, it } from "vitest";

import { ContractStatus } from "../../../models/peginStateMachine";
import type { PendingPeginRequest } from "../../../storage/peginStorage";
import type { Vault } from "../../../types/vault";
import { collectReservedUtxoRefs } from "../utxoReservation";

describe("Vault UTXO Reservation", () => {
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
    // Uses the same structure as VALID_LEGACY_TX_HEX but with different prev txid
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
    // Uses the same structure as VALID_LEGACY_TX_HEX
    const createValidTxHex = (prevTxidLE: string, prevVout: number): string => {
      const voutHex = prevVout.toString(16).padStart(8, "0");
      // Reverse the vout hex for little-endian
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

    it("should collect outpoints from localStorage selectedUTXOs", () => {
      const reserved = collectReservedUtxoRefs({
        pendingPegins: [mockPendingPegin],
        vaults: [],
      });

      expect(reserved.size).toBe(2);
      expect(reserved.has("txid1:0")).toBe(true);
      expect(reserved.has("txid2:1")).toBe(true);
    });

    it("should fall back to parsing unsignedTxHex when selectedUTXOs absent", () => {
      const reserved = collectReservedUtxoRefs({
        pendingPegins: [mockPendingPeginWithTxHex],
        vaults: [],
      });

      expect(reserved.size).toBe(1);
      // The parsed txid should be byte-reversed from LE to BE
      // Input LE: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      // Output BE: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa (same since all a's)
      expect(
        reserved.has(
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:3",
        ),
      ).toBe(true);
    });

    it("should include outpoints from PENDING vaults", () => {
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

      expect(reserved.size).toBe(1);
      // txid is all 1s, so byte-reversal doesn't change it
      expect(
        reserved.has(
          "1111111111111111111111111111111111111111111111111111111111111111:0",
        ),
      ).toBe(true);
    });

    it("should include outpoints from VERIFIED vaults", () => {
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

      expect(reserved.size).toBe(1);
      expect(
        reserved.has(
          "2222222222222222222222222222222222222222222222222222222222222222:1",
        ),
      ).toBe(true);
    });

    it("should NOT include outpoints from ACTIVE vaults", () => {
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

      expect(reserved.size).toBe(0);
    });

    it("should NOT include outpoints from REDEEMED vaults", () => {
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

      expect(reserved.size).toBe(0);
    });

    it("should combine outpoints from multiple sources", () => {
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

      expect(reserved.size).toBe(3); // 2 from localStorage + 1 from vault
      expect(reserved.has("txid1:0")).toBe(true);
      expect(reserved.has("txid2:1")).toBe(true);
      expect(
        reserved.has(
          "5555555555555555555555555555555555555555555555555555555555555555:0",
        ),
      ).toBe(true);
    });

    it("should handle empty inputs", () => {
      const reserved = collectReservedUtxoRefs({
        pendingPegins: [],
        vaults: [],
      });

      expect(reserved.size).toBe(0);
    });

    it("should handle undefined inputs", () => {
      const reserved = collectReservedUtxoRefs({});

      expect(reserved.size).toBe(0);
    });
  });
});
