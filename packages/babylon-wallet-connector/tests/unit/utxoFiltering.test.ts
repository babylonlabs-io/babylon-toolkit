/**
 * Unit tests for UTXO filtering utilities
 *
 * These utilities handle user funds and inscription protection,
 * so comprehensive test coverage is critical.
 */

import { test, expect } from "@playwright/test";

import type { InscriptionIdentifier, UTXO } from "../../src/core/types";
import {
  createInscriptionMap,
  filterDust,
  filterInscriptionUtxos,
  getSpendableUtxos,
  isInscriptionUtxo,
  LOW_VALUE_UTXO_THRESHOLD,
} from "../../src/utils/utxoFiltering";

// ============================================================================
// Test Fixtures
// ============================================================================

const createUtxo = (
  txid: string,
  vout: number,
  value: number,
  scriptPubKey = "0014abc123",
): UTXO => ({
  txid,
  vout,
  value,
  scriptPubKey,
});

const createInscription = (
  txid: string,
  vout: number,
): InscriptionIdentifier => ({
  txid,
  vout,
});

// ============================================================================
// filterDust Tests
// ============================================================================

test.describe("filterDust", () => {
  test("filters out UTXOs below default threshold", () => {
    const utxos = [
      createUtxo("tx1", 0, 5000), // Below threshold
      createUtxo("tx2", 0, 10000), // At threshold (filtered - not above)
      createUtxo("tx3", 0, 10001), // Above threshold
      createUtxo("tx4", 0, 50000), // Well above threshold
    ];

    const result = filterDust(utxos);

    expect(result).toHaveLength(2);
    expect(result[0].txid).toBe("tx3");
    expect(result[1].txid).toBe("tx4");
  });

  test("uses custom threshold when provided", () => {
    const utxos = [
      createUtxo("tx1", 0, 500),
      createUtxo("tx2", 0, 1000),
      createUtxo("tx3", 0, 1001),
    ];

    const result = filterDust(utxos, 1000);

    expect(result).toHaveLength(1);
    expect(result[0].txid).toBe("tx3");
  });

  test("returns empty array when all UTXOs are dust", () => {
    const utxos = [
      createUtxo("tx1", 0, 100),
      createUtxo("tx2", 0, 500),
      createUtxo("tx3", 0, 9999),
    ];

    const result = filterDust(utxos);

    expect(result).toHaveLength(0);
  });

  test("returns all UTXOs when none are dust", () => {
    const utxos = [
      createUtxo("tx1", 0, 100000),
      createUtxo("tx2", 0, 500000),
      createUtxo("tx3", 0, 1000000),
    ];

    const result = filterDust(utxos);

    expect(result).toHaveLength(3);
  });

  test("handles empty array", () => {
    const result = filterDust([]);
    expect(result).toHaveLength(0);
  });

  test("handles threshold of 0", () => {
    const utxos = [
      createUtxo("tx1", 0, 1),
      createUtxo("tx2", 0, 0), // Exactly 0 - not above threshold
    ];

    const result = filterDust(utxos, 0);

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1);
  });

  test("default threshold matches LOW_VALUE_UTXO_THRESHOLD constant", () => {
    expect(LOW_VALUE_UTXO_THRESHOLD).toBe(10_000);
  });
});

// ============================================================================
// createInscriptionMap Tests
// ============================================================================

test.describe("createInscriptionMap", () => {
  test("creates map with correct keys", () => {
    const inscriptions = [
      createInscription("abc123", 0),
      createInscription("def456", 1),
      createInscription("ghi789", 2),
    ];

    const map = createInscriptionMap(inscriptions);

    expect(map.size).toBe(3);
    expect(map.has("abc123:0")).toBe(true);
    expect(map.has("def456:1")).toBe(true);
    expect(map.has("ghi789:2")).toBe(true);
  });

  test("stores inscription objects as values", () => {
    const inscription = createInscription("abc123", 0);
    const map = createInscriptionMap([inscription]);

    const stored = map.get("abc123:0");
    expect(stored).toEqual(inscription);
  });

  test("handles empty array", () => {
    const map = createInscriptionMap([]);
    expect(map.size).toBe(0);
  });

  test("handles duplicate inscriptions (last one wins)", () => {
    const inscriptions = [
      { txid: "abc123", vout: 0 },
      { txid: "abc123", vout: 0 }, // Duplicate
    ];

    const map = createInscriptionMap(inscriptions);

    expect(map.size).toBe(1);
  });

  test("handles same txid with different vouts", () => {
    const inscriptions = [
      createInscription("abc123", 0),
      createInscription("abc123", 1),
      createInscription("abc123", 2),
    ];

    const map = createInscriptionMap(inscriptions);

    expect(map.size).toBe(3);
    expect(map.has("abc123:0")).toBe(true);
    expect(map.has("abc123:1")).toBe(true);
    expect(map.has("abc123:2")).toBe(true);
  });
});

// ============================================================================
// isInscriptionUtxo Tests
// ============================================================================

test.describe("isInscriptionUtxo", () => {
  test("returns true for UTXO with inscription", () => {
    const utxo = createUtxo("abc123", 0, 10000);
    const map = createInscriptionMap([createInscription("abc123", 0)]);

    expect(isInscriptionUtxo(utxo, map)).toBe(true);
  });

  test("returns false for UTXO without inscription", () => {
    const utxo = createUtxo("abc123", 0, 10000);
    const map = createInscriptionMap([createInscription("def456", 0)]);

    expect(isInscriptionUtxo(utxo, map)).toBe(false);
  });

  test("returns false when inscription map is empty", () => {
    const utxo = createUtxo("abc123", 0, 10000);
    const map = createInscriptionMap([]);

    expect(isInscriptionUtxo(utxo, map)).toBe(false);
  });

  test("matches by both txid AND vout", () => {
    const utxo = createUtxo("abc123", 1, 10000);
    const map = createInscriptionMap([
      createInscription("abc123", 0), // Same txid, different vout
    ]);

    expect(isInscriptionUtxo(utxo, map)).toBe(false);
  });

  test("is case-sensitive for txid", () => {
    const utxo = createUtxo("ABC123", 0, 10000);
    const map = createInscriptionMap([createInscription("abc123", 0)]);

    expect(isInscriptionUtxo(utxo, map)).toBe(false);
  });
});

// ============================================================================
// filterInscriptionUtxos Tests
// ============================================================================

test.describe("filterInscriptionUtxos", () => {
  test("separates inscription UTXOs from available UTXOs", () => {
    const utxos = [
      createUtxo("tx1", 0, 10000),
      createUtxo("tx2", 0, 20000),
      createUtxo("tx3", 0, 30000),
    ];
    const inscriptions = [
      createInscription("tx1", 0),
      createInscription("tx3", 0),
    ];

    const result = filterInscriptionUtxos(utxos, inscriptions);

    expect(result.availableUtxos).toHaveLength(1);
    expect(result.availableUtxos[0].txid).toBe("tx2");

    expect(result.inscriptionUtxos).toHaveLength(2);
    expect(result.inscriptionUtxos[0].txid).toBe("tx1");
    expect(result.inscriptionUtxos[1].txid).toBe("tx3");
  });

  test("returns all UTXOs as available when no inscriptions", () => {
    const utxos = [
      createUtxo("tx1", 0, 10000),
      createUtxo("tx2", 0, 20000),
    ];

    const result = filterInscriptionUtxos(utxos, []);

    expect(result.availableUtxos).toHaveLength(2);
    expect(result.inscriptionUtxos).toHaveLength(0);
  });

  test("returns all UTXOs as inscriptions when all have inscriptions", () => {
    const utxos = [
      createUtxo("tx1", 0, 10000),
      createUtxo("tx2", 0, 20000),
    ];
    const inscriptions = [
      createInscription("tx1", 0),
      createInscription("tx2", 0),
    ];

    const result = filterInscriptionUtxos(utxos, inscriptions);

    expect(result.availableUtxos).toHaveLength(0);
    expect(result.inscriptionUtxos).toHaveLength(2);
  });

  test("handles empty UTXOs array", () => {
    const result = filterInscriptionUtxos([], [createInscription("tx1", 0)]);

    expect(result.availableUtxos).toHaveLength(0);
    expect(result.inscriptionUtxos).toHaveLength(0);
  });

  test("handles both empty arrays", () => {
    const result = filterInscriptionUtxos([], []);

    expect(result.availableUtxos).toHaveLength(0);
    expect(result.inscriptionUtxos).toHaveLength(0);
  });

  test("ignores inscriptions that don't match any UTXO", () => {
    const utxos = [createUtxo("tx1", 0, 10000)];
    const inscriptions = [
      createInscription("tx1", 0), // Matches
      createInscription("tx2", 0), // No match
      createInscription("tx3", 0), // No match
    ];

    const result = filterInscriptionUtxos(utxos, inscriptions);

    expect(result.availableUtxos).toHaveLength(0);
    expect(result.inscriptionUtxos).toHaveLength(1);
  });

  test("preserves UTXO order", () => {
    const utxos = [
      createUtxo("tx1", 0, 10000),
      createUtxo("tx2", 0, 20000),
      createUtxo("tx3", 0, 30000),
      createUtxo("tx4", 0, 40000),
    ];
    const inscriptions = [createInscription("tx2", 0)];

    const result = filterInscriptionUtxos(utxos, inscriptions);

    expect(result.availableUtxos.map((u) => u.txid)).toEqual([
      "tx1",
      "tx3",
      "tx4",
    ]);
    expect(result.inscriptionUtxos.map((u) => u.txid)).toEqual(["tx2"]);
  });
});

// ============================================================================
// getSpendableUtxos Tests
// ============================================================================

test.describe("getSpendableUtxos", () => {
  test("filters both dust and inscriptions", () => {
    const utxos = [
      createUtxo("tx1", 0, 5000), // Dust
      createUtxo("tx2", 0, 50000), // Has inscription
      createUtxo("tx3", 0, 100000), // Spendable
      createUtxo("tx4", 0, 200000), // Spendable
    ];
    const inscriptions = [createInscription("tx2", 0)];

    const result = getSpendableUtxos(utxos, inscriptions);

    expect(result).toHaveLength(2);
    expect(result[0].txid).toBe("tx3");
    expect(result[1].txid).toBe("tx4");
  });

  test("uses custom dust threshold", () => {
    const utxos = [
      createUtxo("tx1", 0, 500), // Below custom threshold
      createUtxo("tx2", 0, 1500), // Above custom threshold
    ];

    const result = getSpendableUtxos(utxos, [], 1000);

    expect(result).toHaveLength(1);
    expect(result[0].txid).toBe("tx2");
  });

  test("returns empty when all UTXOs are dust", () => {
    const utxos = [
      createUtxo("tx1", 0, 100),
      createUtxo("tx2", 0, 500),
    ];

    const result = getSpendableUtxos(utxos, []);

    expect(result).toHaveLength(0);
  });

  test("returns empty when all non-dust UTXOs have inscriptions", () => {
    const utxos = [
      createUtxo("tx1", 0, 5000), // Dust
      createUtxo("tx2", 0, 50000), // Has inscription
    ];
    const inscriptions = [createInscription("tx2", 0)];

    const result = getSpendableUtxos(utxos, inscriptions);

    expect(result).toHaveLength(0);
  });

  test("handles empty inputs", () => {
    expect(getSpendableUtxos([], [])).toHaveLength(0);
    expect(getSpendableUtxos([], [createInscription("tx1", 0)])).toHaveLength(0);
  });

  test("filters dust before checking inscriptions (optimization)", () => {
    // This ensures dust UTXOs with inscriptions don't affect performance
    const utxos = [
      createUtxo("tx1", 0, 100), // Dust with inscription
      createUtxo("tx2", 0, 50000), // Spendable
    ];
    const inscriptions = [createInscription("tx1", 0)];

    const result = getSpendableUtxos(utxos, inscriptions);

    // tx1 is filtered as dust first, so inscription check doesn't matter
    expect(result).toHaveLength(1);
    expect(result[0].txid).toBe("tx2");
  });
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

test.describe("Edge Cases", () => {
  test("handles large number of UTXOs", () => {
    const utxos = Array.from({ length: 1000 }, (_, i) =>
      createUtxo(`tx${i}`, 0, 50000 + i),
    );
    const inscriptions = Array.from({ length: 100 }, (_, i) =>
      createInscription(`tx${i * 10}`, 0),
    );

    const result = filterInscriptionUtxos(utxos, inscriptions);

    expect(result.availableUtxos.length + result.inscriptionUtxos.length).toBe(
      1000,
    );
    expect(result.inscriptionUtxos).toHaveLength(100);
    expect(result.availableUtxos).toHaveLength(900);
  });

  test("handles UTXOs with same txid but different vouts", () => {
    const utxos = [
      createUtxo("tx1", 0, 10000),
      createUtxo("tx1", 1, 20000),
      createUtxo("tx1", 2, 30000),
    ];
    const inscriptions = [createInscription("tx1", 1)];

    const result = filterInscriptionUtxos(utxos, inscriptions);

    expect(result.availableUtxos).toHaveLength(2);
    expect(result.inscriptionUtxos).toHaveLength(1);
    expect(result.inscriptionUtxos[0].vout).toBe(1);
  });

  test("handles txid with special characters", () => {
    const txid =
      "0000000000000000000000000000000000000000000000000000000000000000";
    const utxos = [createUtxo(txid, 0, 50000)];
    const inscriptions = [createInscription(txid, 0)];

    const result = filterInscriptionUtxos(utxos, inscriptions);

    expect(result.inscriptionUtxos).toHaveLength(1);
  });

  test("boundary: UTXO value exactly at dust threshold is filtered", () => {
    const utxo = createUtxo("tx1", 0, LOW_VALUE_UTXO_THRESHOLD);
    const result = filterDust([utxo]);

    // Value must be GREATER than threshold, not equal
    expect(result).toHaveLength(0);
  });

  test("boundary: UTXO value one above dust threshold passes", () => {
    const utxo = createUtxo("tx1", 0, LOW_VALUE_UTXO_THRESHOLD + 1);
    const result = filterDust([utxo]);

    expect(result).toHaveLength(1);
  });
});
