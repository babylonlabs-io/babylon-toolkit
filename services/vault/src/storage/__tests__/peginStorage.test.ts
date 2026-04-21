/** Tests for pending peg-in localStorage integrity validation. */

import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { STORAGE_KEY_PREFIX } from "../../constants";
import { LocalStorageStatus } from "../../models/peginStateMachine";
import { getPendingPegins, type PendingPeginRequest } from "../peginStorage";

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
});
