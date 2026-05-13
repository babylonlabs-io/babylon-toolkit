/** Tests for pending peg-in localStorage integrity validation. */

import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import {
  STORAGE_KEY_PREFIX,
  UTXO_RESERVATION_KEY_PREFIX,
  UTXO_RESERVATION_TTL,
} from "../../constants";
import { LocalStorageStatus } from "../../models/peginStateMachine";
import {
  addPendingPegin,
  addUtxoReservation,
  assertNoReservationConflict,
  getPendingPegins,
  getUtxoReservations,
  type PendingPeginRequest,
  removePendingPegin,
  removeUtxoReservation,
  type UtxoReservation,
  UtxoReservationConflictError,
} from "../peginStorage";

vi.mock("@/infrastructure", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

const ETH_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const storageKey = `${STORAGE_KEY_PREFIX}-${ETH_ADDRESS}`;

const VALID_TXID_A = "a".repeat(64);
const VALID_TXID_B = "b".repeat(64);
// 32-byte hashes — vault id and pegin tx hash are both keccak/sha256 outputs.
const VALID_VAULT_ID: Hex = `0x${"1".repeat(64)}`;
const VALID_VAULT_ID_2: Hex = `0x${"2".repeat(64)}`;
const VALID_PEGIN_TXHASH: Hex = `0x${"3".repeat(64)}`;

const validPegin: PendingPeginRequest = {
  id: VALID_VAULT_ID,
  peginTxHash: VALID_PEGIN_TXHASH,
  timestamp: 1700000000000,
  status: LocalStorageStatus.PENDING,
  unsignedTxHex: "0xdeadbeef",
  selectedUTXOs: [
    {
      txid: VALID_TXID_A,
      vout: 0,
      value: "50000",
      scriptPubKey: "deadbeef",
    },
  ],
};

describe("getPendingPegins integrity validation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("returns entries whose security-critical fields pass validation", () => {
    localStorage.setItem(storageKey, JSON.stringify([validPegin]));

    const result = getPendingPegins(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(VALID_VAULT_ID);
  });

  it("accepts empty unsignedTxHex (cross-device resume flow)", () => {
    const crossDevice: PendingPeginRequest = {
      ...validPegin,
      unsignedTxHex: "",
    };
    localStorage.setItem(storageKey, JSON.stringify([crossDevice]));

    const result = getPendingPegins(ETH_ADDRESS);

    expect(result).toHaveLength(1);
  });

  it("filters out entries whose unsignedTxHex contains non-hex characters", async () => {
    const { logger } = await import("@/infrastructure");
    const tampered = { ...validPegin, unsignedTxHex: "NOT_HEX!!!" };
    localStorage.setItem(
      storageKey,
      JSON.stringify([tampered, { ...validPegin, id: VALID_VAULT_ID_2 }]),
    );

    const result = getPendingPegins(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(VALID_VAULT_ID_2);
    expect(logger.warn).toHaveBeenCalledWith(
      "[peginStorage] Skipping corrupted pending pegin entry",
      expect.objectContaining({
        category: "peginStorage",
        vaultId: VALID_VAULT_ID,
      }),
    );
  });

  it("filters out entries whose unsignedTxHex has an odd byte count", () => {
    const tampered = { ...validPegin, unsignedTxHex: "0xabc" }; // 3 hex chars
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose selectedUTXOs has a non-hex txid", () => {
    const tampered: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: [
        {
          txid: "not-hex",
          vout: 0,
          value: "50000",
          scriptPubKey: "deadbeef",
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose selectedUTXOs has negative vout", () => {
    const tampered: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: [
        {
          txid: VALID_TXID_A,
          vout: -1,
          value: "50000",
          scriptPubKey: "deadbeef",
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose selectedUTXOs has non-integer value", () => {
    const tampered: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: [
        {
          txid: VALID_TXID_A,
          vout: 0,
          value: "not-a-number",
          scriptPubKey: "deadbeef",
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose selectedUTXOs value exceeds safe integer range", () => {
    const tampered: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: [
        {
          txid: VALID_TXID_A,
          vout: 0,
          value: "99999999999999999999", // exceeds Number.MAX_SAFE_INTEGER
          scriptPubKey: "deadbeef",
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose selectedUTXOs scriptPubKey is non-hex", () => {
    const tampered: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: [
        {
          txid: VALID_TXID_A,
          vout: 0,
          value: "50000",
          scriptPubKey: "plain-text",
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("keeps valid entries alongside filtered tampered ones", () => {
    const tampered = { ...validPegin, id: "0xbad", unsignedTxHex: "xyz" };
    const good: PendingPeginRequest = {
      ...validPegin,
      id: VALID_VAULT_ID_2,
      selectedUTXOs: [
        {
          txid: VALID_TXID_B,
          vout: 3,
          value: "12345",
          scriptPubKey: "ab",
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered, good]));

    const result = getPendingPegins(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(VALID_VAULT_ID_2);
  });

  it("filters entries whose id is a non-string (DoS protection)", () => {
    // A non-string id would throw in normalizeTransactionId, fall into the
    // outer catch block, and wipe the entire storage key. This test guards
    // against that DoS path by forcing the validator to reject early.
    const tampered = { ...validPegin, id: 42 as unknown as string };
    const good = { ...validPegin, id: VALID_VAULT_ID_2 };
    localStorage.setItem(storageKey, JSON.stringify([tampered, good]));

    const result = getPendingPegins(ETH_ADDRESS);

    // The tampered entry is filtered, the good entry survives. Critically,
    // the storage key is NOT removed.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(VALID_VAULT_ID_2);
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });

  it("filters entries whose id contains non-hex characters", () => {
    const tampered = {
      ...validPegin,
      id: "0x" + "Z".repeat(64),
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose id is shorter than 32 bytes", () => {
    const tampered = { ...validPegin, id: "0x" + "1".repeat(40) };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose peginTxHash is shorter than 32 bytes", () => {
    const tampered = {
      ...validPegin,
      peginTxHash: "0x" + "3".repeat(40),
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose unsignedTxHex is bare '0x'", () => {
    const tampered = { ...validPegin, unsignedTxHex: "0x" };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose scriptPubKey has odd hex length", () => {
    const tampered: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: [
        {
          txid: VALID_TXID_A,
          vout: 0,
          value: "50000",
          scriptPubKey: "abc", // 3 hex chars — not a valid byte sequence
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose txid has the wrong length", () => {
    const tampered: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: [
        {
          txid: "a".repeat(60), // too short
          vout: 0,
          value: "50000",
          scriptPubKey: "deadbeef",
        },
      ],
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("returns empty array when the stored payload is not an array", () => {
    localStorage.setItem(storageKey, JSON.stringify({ notAnArray: true }));

    const result = getPendingPegins(ETH_ADDRESS);

    expect(result).toEqual([]);
    // The top-level array check does not trigger logger.error (reserved for
    // JSON.parse failures). It quietly returns empty.
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("accepts legacy ids stored without a 0x prefix", () => {
    // normalizeTransactionId canonicalizes to `0x<hex>` on read. The validator
    // must allow the legacy form (still 32-byte hex) so pre-existing entries
    // are not silently dropped.
    const legacyHex = "1".repeat(64);
    const legacy = {
      ...validPegin,
      id: legacyHex as unknown as PendingPeginRequest["id"],
    };
    localStorage.setItem(storageKey, JSON.stringify([legacy]));

    const result = getPendingPegins(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(`0x${legacyHex}`);
  });

  it("accepts entries without selectedUTXOs field", () => {
    const pegin: PendingPeginRequest = {
      ...validPegin,
      selectedUTXOs: undefined,
    };
    localStorage.setItem(storageKey, JSON.stringify([pegin]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(1);
  });

  it("accepts entries with a valid refundBroadcastAt timestamp", () => {
    const pegin: PendingPeginRequest = {
      ...validPegin,
      status: LocalStorageStatus.REFUND_BROADCAST,
      refundBroadcastAt: 1_700_000_000_000,
    };
    localStorage.setItem(storageKey, JSON.stringify([pegin]));

    const result = getPendingPegins(ETH_ADDRESS);
    expect(result).toHaveLength(1);
    expect(result[0].refundBroadcastAt).toBe(1_700_000_000_000);
  });

  it("filters entries whose refundBroadcastAt is non-numeric", () => {
    const tampered = {
      ...validPegin,
      refundBroadcastAt: "not-a-number" as unknown as number,
    };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });

  it("filters entries whose refundBroadcastAt is negative", () => {
    const tampered = { ...validPegin, refundBroadcastAt: -1 };
    localStorage.setItem(storageKey, JSON.stringify([tampered]));

    expect(getPendingPegins(ETH_ADDRESS)).toHaveLength(0);
  });
});

describe("removePendingPegin", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("removes a single entry by id and leaves siblings intact", () => {
    addPendingPegin(ETH_ADDRESS, {
      id: VALID_VAULT_ID,
      peginTxHash: VALID_PEGIN_TXHASH,
      unsignedTxHex: "0xdeadbeef",
    });
    addPendingPegin(ETH_ADDRESS, {
      id: VALID_VAULT_ID_2,
      peginTxHash: VALID_PEGIN_TXHASH,
      unsignedTxHex: "0xcafebabe",
    });

    removePendingPegin(ETH_ADDRESS, VALID_VAULT_ID);

    const result = getPendingPegins(ETH_ADDRESS);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(VALID_VAULT_ID_2);
  });
});

describe("UTXO reservation storage", () => {
  const reservationKey = `${UTXO_RESERVATION_KEY_PREFIX}-${ETH_ADDRESS}`;

  const outpointA = { txid: VALID_TXID_A, vout: 0 };
  const outpointB = { txid: VALID_TXID_B, vout: 1 };

  const validReservation: UtxoReservation = {
    outpoints: [outpointA],
    timestamp: Date.now(),
    batchId: "batch-1",
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("adds and retrieves a reservation", async () => {
    await addUtxoReservation(ETH_ADDRESS, validReservation);

    const result = getUtxoReservations(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].batchId).toBe("batch-1");
    expect(result[0].outpoints).toEqual([outpointA]);
  });

  it("removes a reservation by batchId", async () => {
    await addUtxoReservation(ETH_ADDRESS, validReservation);
    await addUtxoReservation(ETH_ADDRESS, {
      ...validReservation,
      outpoints: [outpointB],
      batchId: "batch-2",
    });

    removeUtxoReservation(ETH_ADDRESS, "batch-1");

    const result = getUtxoReservations(ETH_ADDRESS);
    expect(result).toHaveLength(1);
    expect(result[0].batchId).toBe("batch-2");
  });

  it("replaces existing reservation with same batchId (narrow-after-prepare refresh)", async () => {
    await addUtxoReservation(ETH_ADDRESS, validReservation);
    await addUtxoReservation(ETH_ADDRESS, {
      ...validReservation,
      outpoints: [outpointA, outpointB],
    });

    const result = getUtxoReservations(ETH_ADDRESS);
    expect(result).toHaveLength(1);
    expect(result[0].outpoints).toEqual([outpointA, outpointB]);
  });

  it("filters out expired reservations on read", () => {
    const expired: UtxoReservation = {
      outpoints: [outpointA],
      timestamp: Date.now() - UTXO_RESERVATION_TTL - 1,
      batchId: "expired-batch",
    };
    localStorage.setItem(reservationKey, JSON.stringify([expired]));

    const result = getUtxoReservations(ETH_ADDRESS);

    expect(result).toHaveLength(0);
    const stored = localStorage.getItem(reservationKey);
    expect(stored).toBeNull();
  });

  it("keeps non-expired reservations when cleaning expired ones", () => {
    const expired: UtxoReservation = {
      outpoints: [outpointA],
      timestamp: Date.now() - UTXO_RESERVATION_TTL - 1,
      batchId: "expired-batch",
    };
    const fresh: UtxoReservation = {
      outpoints: [outpointB],
      timestamp: Date.now(),
      batchId: "fresh-batch",
    };
    localStorage.setItem(reservationKey, JSON.stringify([expired, fresh]));

    const result = getUtxoReservations(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].batchId).toBe("fresh-batch");
  });

  it("returns empty array for empty address", () => {
    expect(getUtxoReservations("")).toEqual([]);
  });

  it("returns empty array when storage is empty", () => {
    expect(getUtxoReservations(ETH_ADDRESS)).toEqual([]);
  });

  it("rejects reservations whose outpoints field is not an array", () => {
    const tampered = [
      { outpoints: "not-an-array", timestamp: Date.now(), batchId: "bad" },
      validReservation,
    ];
    localStorage.setItem(reservationKey, JSON.stringify(tampered));

    const result = getUtxoReservations(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].batchId).toBe("batch-1");
  });

  it("rejects reservations whose outpoints array is empty", () => {
    const tampered = [
      { outpoints: [], timestamp: Date.now(), batchId: "empty" },
      validReservation,
    ];
    localStorage.setItem(reservationKey, JSON.stringify(tampered));

    const result = getUtxoReservations(ETH_ADDRESS);

    expect(result).toHaveLength(1);
    expect(result[0].batchId).toBe("batch-1");
  });

  it("rejects reservations whose outpoint has a non-hex txid", () => {
    const tampered = [
      {
        outpoints: [{ txid: "NOT_HEX_!!!", vout: 0 }],
        timestamp: Date.now(),
        batchId: "bad",
      },
      validReservation,
    ];
    localStorage.setItem(reservationKey, JSON.stringify(tampered));

    expect(getUtxoReservations(ETH_ADDRESS)).toHaveLength(1);
  });

  it("rejects reservations whose outpoint has a negative vout", () => {
    const tampered = [
      {
        outpoints: [{ txid: VALID_TXID_A, vout: -1 }],
        timestamp: Date.now(),
        batchId: "bad",
      },
      validReservation,
    ];
    localStorage.setItem(reservationKey, JSON.stringify(tampered));

    expect(getUtxoReservations(ETH_ADDRESS)).toHaveLength(1);
  });

  it("silently drops legacy unsignedTxHex-only entries (schema rotation)", () => {
    // Legacy entries with only `unsignedTxHex` no longer validate. The 5-min
    // TTL would have dropped them anyway; this just shortens the gap.
    const legacy = [
      { unsignedTxHex: "0xdeadbeef", timestamp: Date.now(), batchId: "old" },
    ];
    localStorage.setItem(reservationKey, JSON.stringify(legacy));

    expect(getUtxoReservations(ETH_ADDRESS)).toHaveLength(0);
  });

  it("removes storage key when last reservation is removed", async () => {
    await addUtxoReservation(ETH_ADDRESS, validReservation);
    removeUtxoReservation(ETH_ADDRESS, "batch-1");

    expect(localStorage.getItem(reservationKey)).toBeNull();
  });

  describe("conflict detection", () => {
    it("rejects an overlapping outpoint from a different batchId", async () => {
      await addUtxoReservation(ETH_ADDRESS, validReservation);

      await expect(
        addUtxoReservation(ETH_ADDRESS, {
          outpoints: [outpointA],
          timestamp: Date.now(),
          batchId: "batch-2",
        }),
      ).rejects.toBeInstanceOf(UtxoReservationConflictError);
    });

    it("carries the conflicting batchId and outpoint on the error", async () => {
      await addUtxoReservation(ETH_ADDRESS, validReservation);

      const err = await addUtxoReservation(ETH_ADDRESS, {
        outpoints: [outpointA],
        timestamp: Date.now(),
        batchId: "batch-2",
      }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UtxoReservationConflictError);
      const conflict = err as UtxoReservationConflictError;
      expect(conflict.conflictingBatchId).toBe("batch-1");
      expect(conflict.outpoint).toEqual(outpointA);
    });

    it("treats txid comparison as case-insensitive", async () => {
      await addUtxoReservation(ETH_ADDRESS, {
        outpoints: [{ txid: VALID_TXID_A.toLowerCase(), vout: 0 }],
        timestamp: Date.now(),
        batchId: "batch-1",
      });

      await expect(
        addUtxoReservation(ETH_ADDRESS, {
          outpoints: [{ txid: VALID_TXID_A.toUpperCase(), vout: 0 }],
          timestamp: Date.now(),
          batchId: "batch-2",
        }),
      ).rejects.toBeInstanceOf(UtxoReservationConflictError);
    });

    it("allows non-overlapping reservations under a different batchId", async () => {
      await addUtxoReservation(ETH_ADDRESS, validReservation);
      await addUtxoReservation(ETH_ADDRESS, {
        outpoints: [outpointB],
        timestamp: Date.now(),
        batchId: "batch-2",
      });

      expect(getUtxoReservations(ETH_ADDRESS)).toHaveLength(2);
    });
  });

  describe("assertNoReservationConflict", () => {
    it("throws when another batch claims one of our outpoints", async () => {
      await addUtxoReservation(ETH_ADDRESS, validReservation);

      expect(() =>
        assertNoReservationConflict(ETH_ADDRESS, "batch-2", [outpointA]),
      ).toThrow(UtxoReservationConflictError);
    });

    it("does not throw when only our own batch claims the outpoint", async () => {
      await addUtxoReservation(ETH_ADDRESS, validReservation);

      expect(() =>
        assertNoReservationConflict(ETH_ADDRESS, "batch-1", [outpointA]),
      ).not.toThrow();
    });

    it("returns silently for an empty address", () => {
      expect(() =>
        assertNoReservationConflict("", "batch-1", [outpointA]),
      ).not.toThrow();
    });

    it("returns silently when no reservations exist", () => {
      expect(() =>
        assertNoReservationConflict(ETH_ADDRESS, "batch-1", [outpointA]),
      ).not.toThrow();
    });
  });
});
