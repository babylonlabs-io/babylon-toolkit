/**
 * Tests for useUtxoValidation hook
 */

import type { MempoolUTXO } from "@babylonlabs-io/ts-sdk";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ContractStatus } from "../../../models/peginStateMachine";
import type { VaultActivity } from "../../../types/activity";
import { useUtxoValidation } from "../useUtxoValidation";

// Mock extractInputsFromTransaction to avoid bitcoinjs-lib ecc initialization
vi.mock("../../../services/vault/vaultUtxoValidationService", () => ({
  extractInputsFromTransaction: vi.fn((txHex: string) => {
    // Return mock inputs based on tx hex marker
    if (txHex === "tx-aaa-3") {
      return [
        {
          txid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          vout: 3,
        },
      ];
    }
    if (txHex === "tx-bbb-0") {
      return [
        {
          txid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          vout: 0,
        },
      ];
    }
    if (txHex === "invalid-hex") {
      throw new Error("Failed to parse");
    }
    // Default: return empty inputs
    return [];
  }),
}));

// Marker for valid tx hex (parsed by mock above)
const VALID_TX_HEX = "tx-aaa-3";

// Helper to create a mock activity
function createActivity(
  id: string,
  contractStatus: ContractStatus,
  depositorBtcPubkey: string,
  unsignedBtcTx?: string,
): VaultActivity {
  return {
    id,
    contractStatus,
    depositorBtcPubkey,
    unsignedBtcTx,
    isInUse: false,
  } as VaultActivity;
}

// Helper to create mock UTXOs
function createUtxo(txid: string, vout: number): MempoolUTXO {
  return {
    txid,
    vout,
    value: 100000,
    scriptPubKey: "script",
    confirmed: true,
  };
}

const TEST_BTC_PUBKEY = "02abc123";

describe("useUtxoValidation", () => {
  describe("skipping validation", () => {
    it("should return empty set when availableUtxos is undefined (loading)", () => {
      const activities = [
        createActivity(
          "dep1",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: undefined, // Loading state
        }),
      );

      expect(result.current.unavailableUtxos.size).toBe(0);
    });

    it("should return empty set when btcPublicKey is missing", () => {
      const activities = [
        createActivity(
          "dep1",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: undefined,
          availableUtxos: [],
        }),
      );

      expect(result.current.unavailableUtxos.size).toBe(0);
    });

    it("should validate when availableUtxos is empty array (wallet has no UTXOs)", () => {
      const activities = [
        createActivity(
          "dep1",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [], // Empty but loaded - should validate
        }),
      );

      // With no available UTXOs, the deposit should be marked as unavailable
      expect(result.current.unavailableUtxos.has("dep1")).toBe(true);
    });
  });

  describe("filtering deposits", () => {
    it("should only check VERIFIED deposits", () => {
      const activities = [
        createActivity(
          "pending",
          ContractStatus.PENDING,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
        createActivity(
          "verified",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
        createActivity(
          "active",
          ContractStatus.ACTIVE,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
        createActivity(
          "redeemed",
          ContractStatus.REDEEMED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [], // No UTXOs available
        }),
      );

      // Only VERIFIED should be checked and marked unavailable
      expect(result.current.unavailableUtxos.has("pending")).toBe(false);
      expect(result.current.unavailableUtxos.has("verified")).toBe(true);
      expect(result.current.unavailableUtxos.has("active")).toBe(false);
      expect(result.current.unavailableUtxos.has("redeemed")).toBe(false);
    });

    it("should not mark as unavailable if tx is in broadcastedTxIds", () => {
      const activities = [
        createActivity(
          "0xbroadcasted123",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
        createActivity(
          "0xnotbroadcasted",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [], // No UTXOs available
          broadcastedTxIds: new Set(["broadcasted123"]), // Without 0x prefix
        }),
      );

      // Broadcasted tx should NOT be marked unavailable (it's confirming)
      expect(result.current.unavailableUtxos.has("0xbroadcasted123")).toBe(
        false,
      );
      // Non-broadcasted should be marked unavailable (truly invalid)
      expect(result.current.unavailableUtxos.has("0xnotbroadcasted")).toBe(
        true,
      );
    });

    it("should only check deposits owned by current wallet", () => {
      const activities = [
        createActivity(
          "owned",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
        createActivity(
          "not-owned",
          ContractStatus.VERIFIED,
          "different-pubkey",
          VALID_TX_HEX,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [], // No UTXOs available
        }),
      );

      // Only owned deposit should be checked
      expect(result.current.unavailableUtxos.has("owned")).toBe(true);
      expect(result.current.unavailableUtxos.has("not-owned")).toBe(false);
    });

    it("should skip deposits without unsignedBtcTx", () => {
      const activities = [
        createActivity(
          "with-tx",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
        createActivity(
          "without-tx",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          undefined,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [], // No UTXOs available
        }),
      );

      // Only deposit with tx should be checked
      expect(result.current.unavailableUtxos.has("with-tx")).toBe(true);
      expect(result.current.unavailableUtxos.has("without-tx")).toBe(false);
    });
  });

  describe("UTXO availability checking", () => {
    it("should mark deposit as available when all inputs exist", () => {
      const activities = [
        createActivity(
          "dep1",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      // The tx input is txid: aaa..., vout: 3
      const availableUtxos = [
        createUtxo(
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          3,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos,
        }),
      );

      expect(result.current.unavailableUtxos.has("dep1")).toBe(false);
    });

    it("should mark deposit as unavailable when input is missing", () => {
      const activities = [
        createActivity(
          "dep1",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      // Different txid than what the transaction needs
      const availableUtxos = [createUtxo("different-txid", 3)];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos,
        }),
      );

      expect(result.current.unavailableUtxos.has("dep1")).toBe(true);
    });

    it("should mark deposit as unavailable when vout doesn't match", () => {
      const activities = [
        createActivity(
          "dep1",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      // Same txid but different vout (tx needs vout: 3)
      const availableUtxos = [
        createUtxo(
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          0, // Wrong vout
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos,
        }),
      );

      expect(result.current.unavailableUtxos.has("dep1")).toBe(true);
    });

    it("should handle deposits with invalid transaction hex gracefully", () => {
      const activities = [
        createActivity(
          "invalid-tx",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          "invalid-hex",
        ),
        createActivity(
          "valid-tx",
          ContractStatus.VERIFIED,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [], // No UTXOs
        }),
      );

      // Invalid tx should be skipped (not in unavailable set)
      expect(result.current.unavailableUtxos.has("invalid-tx")).toBe(false);
      // Valid tx should be marked unavailable (no matching UTXOs)
      expect(result.current.unavailableUtxos.has("valid-tx")).toBe(true);
      // Should have logged a warning
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[useUtxoValidation] Failed to parse tx"),
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    it("should return empty set when no activities", () => {
      const { result } = renderHook(() =>
        useUtxoValidation({
          activities: [],
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [],
        }),
      );

      expect(result.current.unavailableUtxos.size).toBe(0);
    });

    it("should return empty set when no pending broadcast deposits", () => {
      const activities = [
        createActivity(
          "active",
          ContractStatus.ACTIVE,
          TEST_BTC_PUBKEY,
          VALID_TX_HEX,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos: [],
        }),
      );

      expect(result.current.unavailableUtxos.size).toBe(0);
    });

    it("should handle multiple deposits correctly", () => {
      // Create two different tx hexes (using mock markers)
      const tx1 = VALID_TX_HEX; // needs aaa...:3
      const tx2 = "tx-bbb-0"; // needs bbb...:0

      const activities = [
        createActivity("dep1", ContractStatus.VERIFIED, TEST_BTC_PUBKEY, tx1),
        createActivity("dep2", ContractStatus.VERIFIED, TEST_BTC_PUBKEY, tx2),
      ];

      // Only have UTXO for dep1
      const availableUtxos = [
        createUtxo(
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          3,
        ),
      ];

      const { result } = renderHook(() =>
        useUtxoValidation({
          activities,
          btcPublicKey: TEST_BTC_PUBKEY,
          availableUtxos,
        }),
      );

      expect(result.current.unavailableUtxos.has("dep1")).toBe(false);
      expect(result.current.unavailableUtxos.has("dep2")).toBe(true);
    });
  });
});
