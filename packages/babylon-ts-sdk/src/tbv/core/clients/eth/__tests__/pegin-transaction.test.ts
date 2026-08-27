import { deriveVaultId } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { sha256 } from "@noble/hashes/sha2.js";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { bytesToHex, getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { calculateBtcTxHash } from "../../../utils/transaction/btcTxHash";
import { calculatePeginTxHash, derivePeginVaultId } from "../pegin-transaction";

const GOLDEN_PEGIN_TX_HASH: Hex = `0x${"ab".repeat(32)}`;
const GOLDEN_DEPOSITOR: Address = "0x1234567890abcdef1234567890abcdef12345678";
const GOLDEN_VAULT_ID: Hex =
  "0xf8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba";
const TXID_DIFFERENTIAL_SEED = 0xa90f72ec;
const TXID_DIFFERENTIAL_FIXTURE_COUNT = 64;
const RANDOM_SCRIPT_LENGTHS = [0, 1, 20, 75, 252, 253, 300] as const;
const RANDOM_WITNESS_ITEM_LENGTHS = [0, 1, 32, 64, 252, 253, 300] as const;
// Input and output counts run 1..260, so the corpus straddles the single-byte
// compact-size limit and the count prefixes are re-emitted as 0xfd pairs as
// well as bare bytes.
const RANDOM_ITEM_COUNT_BOUND = 260;
// Counts either side of both compact-size boundaries a Bitcoin transaction can
// actually reach. Random counts cannot span 65_536 without making the corpus
// far larger than the branch coverage is worth, so these four are explicit.
const COMPACT_SIZE_COUNT_BOUNDARIES = [252, 253, 65_535, 65_536] as const;
const COMPACT_SIZE_BOUNDARY_TIMEOUT_MS = 60_000;
const SEGWIT_MARKER_AND_FLAG_HEX = "0001";
const EMPTY_WITNESS_ITEM_COUNT_HEX = "00";
const VERSION_HEX_LENGTH = 8;
const LOCKTIME_HEX_LENGTH = 8;
const TEST_TRANSACTION_INPUT_COUNT = 1;
// The sole output value of `testTransaction`, 50_000 satoshis, as the parser
// sees it: 8 bytes little-endian.
const TEST_TRANSACTION_OUTPUT_VALUE_HEX = "50c3000000000000";
// 21_000_000 BTC in satoshis, little-endian. The largest value consensus can
// put in an output field, and the ceiling the two implementations must agree
// under.
const MAX_MONEY_SATOSHIS_LE_HEX = "0040075af0750700";
// `testTransaction` has one input, so its canonical count is the single byte
// 0x01. These are that same count re-encoded under each longer prefix.
const CANONICAL_INPUT_COUNT_HEX_LENGTH = 2;
const NON_CANONICAL_INPUT_COUNT_ENCODINGS = {
  "0xfd": "fd0100",
  "0xfe": "fe01000000",
  "0xff": "ff0100000000000000",
} as const;
// The Bitcoin genesis block's coinbase transaction and its published id. An
// oracle-independent anchor: bitcoinjs-lib neither produced this hex nor
// supplied the expected id.
const GENESIS_COINBASE_TX_HEX =
  "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000";
const GENESIS_COINBASE_TXID: Hex =
  "0x4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b";

function testTransaction(withWitness: boolean): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.addInput(Buffer.alloc(32, 0xab), 3);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 50_000);
  if (withWitness) {
    transaction.setWitness(0, [Buffer.alloc(64, 0x11), Buffer.alloc(33, 0x22)]);
  }
  return transaction.toHex();
}

// Three inputs and three outputs, a non-zero locktime, three distinct
// non-default sequences, and scripts longer than 252 bytes so input count,
// output count and the 0xfd compact-size branch are all exercised.
function multiInputOutputTransaction(withWitness: boolean): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.locktime = 812_345;
  transaction.addInput(Buffer.alloc(32, 0x01), 0, 0xfffffffd);
  transaction.addInput(
    Buffer.alloc(32, 0x02),
    7,
    0xfffffffe,
    Buffer.alloc(300, 0x51),
  );
  transaction.addInput(Buffer.alloc(32, 0x03), 4_294_967_295, 0);
  transaction.addOutput(Buffer.alloc(22, 0x00), 1_000);
  transaction.addOutput(Buffer.alloc(300, 0x6a), 2_000);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 3_000);
  if (withWitness) {
    transaction.setWitness(0, [Buffer.alloc(64, 0x11)]);
    transaction.setWitness(2, [
      Buffer.alloc(300, 0x22),
      Buffer.alloc(33, 0x33),
    ]);
  }
  return transaction.toHex();
}

// A fixed number of empty-script inputs and outputs, so the compact-size
// count prefix is the only thing that changes between fixtures.
function fixedCountTransaction(count: number, withWitness: boolean): string {
  const transaction = new Transaction();
  transaction.version = 2;
  for (let input = 0; input < count; input++) {
    transaction.addInput(Buffer.alloc(32, 0x07), input);
  }
  for (let output = 0; output < count; output++) {
    transaction.addOutput(Buffer.alloc(22, 0x08), 1_000);
  }
  if (withWitness) {
    transaction.setWitness(0, [Buffer.alloc(64, 0x09)]);
  }
  return transaction.toHex();
}

// bitcoinjs-lib's Transaction.toHex() emits the SegWit marker and flag only
// when at least one input carries witness items, so no generated fixture can
// reach a transaction that announces witness data and then supplies none.
// Splice one by hand: marker and flag after the version, then one zero witness
// item count per input in front of the locktime.
function segwitMarkerWithEmptyWitnessesTransaction(): string {
  const legacy = testTransaction(false);
  const locktimeStart = legacy.length - LOCKTIME_HEX_LENGTH;
  return [
    legacy.slice(0, VERSION_HEX_LENGTH),
    SEGWIT_MARKER_AND_FLAG_HEX,
    legacy.slice(VERSION_HEX_LENGTH, locktimeStart),
    EMPTY_WITNESS_ITEM_COUNT_HEX.repeat(TEST_TRANSACTION_INPUT_COUNT),
    legacy.slice(locktimeStart),
  ].join("");
}

function seededU32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

function seededBytes(next: () => number, length: number): Buffer {
  return Buffer.from(Uint8Array.from({ length }, () => (next() >>> 24) & 0xff));
}

function seededTransactionCorpus(): string[] {
  const next = seededU32(TXID_DIFFERENTIAL_SEED);

  return Array.from(
    { length: TXID_DIFFERENTIAL_FIXTURE_COUNT },
    (_, fixture) => {
      const transaction = new Transaction();
      transaction.version = next() | 0;
      transaction.locktime = next();

      const inputCount = 1 + (next() % RANDOM_ITEM_COUNT_BOUND);
      const outputCount = 1 + (next() % RANDOM_ITEM_COUNT_BOUND);
      for (let input = 0; input < inputCount; input++) {
        const scriptLength =
          RANDOM_SCRIPT_LENGTHS[next() % RANDOM_SCRIPT_LENGTHS.length]!;
        transaction.addInput(
          seededBytes(next, 32),
          next(),
          next(),
          seededBytes(next, scriptLength),
        );
      }
      for (let output = 0; output < outputCount; output++) {
        const scriptLength =
          RANDOM_SCRIPT_LENGTHS[next() % RANDOM_SCRIPT_LENGTHS.length]!;
        transaction.addOutput(seededBytes(next, scriptLength), next());
      }

      if (fixture % 2 === 1) {
        const requiredWitnessInput = next() % inputCount;
        for (let input = 0; input < inputCount; input++) {
          const itemCount =
            input === requiredWitnessInput ? 1 + (next() % 3) : next() % 3;
          transaction.setWitness(
            input,
            Array.from({ length: itemCount }, () => {
              const itemLength =
                RANDOM_WITNESS_ITEM_LENGTHS[
                  next() % RANDOM_WITNESS_ITEM_LENGTHS.length
                ]!;
              return seededBytes(next, itemLength);
            }),
          );
        }
      }

      return transaction.toHex();
    },
  );
}

// Deterministic (peginTxHash, depositor) pairs: SHA-256 of the fixture index,
// then SHA-256 of that digest for the 20-byte address. No randomness, so a
// failure reproduces exactly.
/**
 * The two arguments are varied independently rather than walked along a
 * diagonal. `derivePeginVaultId` hashes a (bytes32, address) pair, so a fault
 * that conflates the two - deriving one from the other, using one twice, or
 * encoding them without fixed widths so two different pairs collide - agrees
 * on every point where one input already determines the other. Crossing the
 * axes is what makes those visible. The two ends of each axis cover the values
 * sha256 never emits, which is where a padding or length fault would show.
 */
function vaultIdFixtures(): { peginTxHash: Hex; depositor: Address }[] {
  // Distinct domain prefixes, so no depositor can coincide with a value
  // derived from a transaction hash.
  const peginTxHashes: Hex[] = [
    `0x${"00".repeat(32)}`,
    `0x${"ff".repeat(32)}`,
    ...Array.from({ length: 8 }, (_, index) =>
      bytesToHex(sha256(Uint8Array.of(0x01, index))),
    ),
  ];
  const depositors: Address[] = [
    getAddress(`0x${"00".repeat(20)}`),
    getAddress(`0x${"ff".repeat(20)}`),
    ...Array.from({ length: 8 }, (_, index) =>
      getAddress(bytesToHex(sha256(Uint8Array.of(0x02, index)).slice(0, 20))),
    ),
  ];

  return peginTxHashes.flatMap((peginTxHash) =>
    depositors.map((depositor) => ({ peginTxHash, depositor })),
  );
}

describe("ETH-only pegin transaction derivation", () => {
  // Every other txid fixture is generated by bitcoinjs-lib and then judged by
  // bitcoinjs-lib, so a shared misunderstanding of the encoding would agree with
  // itself. This one is anchored outside the repo: the Bitcoin genesis block's
  // coinbase transaction, whose id is a published constant. It is the only
  // vector here that would survive both implementations being wrong the same
  // way. The vault-id half has the Rust golden vector and the curve half has the
  // generator point; this is the txid half's equivalent.
  it("reproduces the published txid of the Bitcoin genesis coinbase", () => {
    expect(calculatePeginTxHash(GENESIS_COINBASE_TX_HEX)).toBe(
      GENESIS_COINBASE_TXID,
    );
  });

  it("matches bitcoinjs-lib txid calculation for a legacy transaction", () => {
    const txHex = testTransaction(false);
    expect(calculatePeginTxHash(txHex)).toBe(calculateBtcTxHash(txHex));
  });

  it("strips witness data and matches bitcoinjs-lib for a SegWit transaction", () => {
    const txHex = testTransaction(true);
    expect(calculatePeginTxHash(txHex)).toBe(calculateBtcTxHash(txHex));
  });

  it("matches bitcoinjs-lib for a multi-input, multi-output legacy transaction", () => {
    const txHex = multiInputOutputTransaction(false);
    expect(calculatePeginTxHash(txHex)).toBe(calculateBtcTxHash(txHex));
  });

  it("matches bitcoinjs-lib for a multi-input SegWit transaction with a partly empty witness", () => {
    const txHex = multiInputOutputTransaction(true);
    expect(calculatePeginTxHash(txHex)).toBe(calculateBtcTxHash(txHex));
  });

  it("matches bitcoinjs-lib across fixed-seed randomized transactions", () => {
    for (const [fixture, txHex] of seededTransactionCorpus().entries()) {
      expect(
        calculatePeginTxHash(txHex),
        `seed 0x${TXID_DIFFERENTIAL_SEED.toString(16)}, fixture ${fixture}`,
      ).toBe(calculateBtcTxHash(txHex));
    }
  });

  // The two upper boundaries each build a 9.4 MB transaction, so this case does
  // real work rather than the millisecond the default budget assumes. It runs in
  // about a second unloaded and comfortably over five seconds on a contended
  // runner, which is a timeout rather than a defect.
  it(
    "matches bitcoinjs-lib either side of both reachable compact-size count boundaries",
    { timeout: COMPACT_SIZE_BOUNDARY_TIMEOUT_MS },
    () => {
      for (const count of COMPACT_SIZE_COUNT_BOUNDARIES) {
        for (const withWitness of [false, true]) {
          const txHex = fixedCountTransaction(count, withWitness);
          expect(
            calculatePeginTxHash(txHex),
            `${count} inputs and outputs, witness ${withWitness}`,
          ).toBe(calculateBtcTxHash(txHex));
        }
      }
    },
  );

  it("rejects a SegWit marker whose witness stacks are all empty, as bitcoinjs-lib does", () => {
    const txHex = segwitMarkerWithEmptyWitnessesTransaction();
    expect(() => calculateBtcTxHash(txHex)).toThrow(/superfluous witness data/);
    expect(() => calculatePeginTxHash(txHex)).toThrow(
      /superfluous witness marker/,
    );
  });

  it("rejects a transaction that ends before the parser has read every field", () => {
    expect(() => calculatePeginTxHash("deadbeef")).toThrow(/Truncated/);
  });

  it("rejects trailing bytes after a complete transaction", () => {
    expect(() => calculatePeginTxHash(`${testTransaction(false)}00`)).toThrow(
      /trailing byte/,
    );
  });

  // The two cases below are the only input classes found where this parser and
  // bitcoinjs-lib do not agree. Both are pinned rather than left implicit: a
  // divergence nobody wrote down is the exact failure CLAUDE.md section 9
  // exists to catch. Neither is reachable by a transaction that can confirm on
  // Bitcoin, and they differ in opposite directions.

  // Stricter than the oracle, deliberately. varuint-bitcoin does not check
  // canonicality, so bitcoinjs-lib accepts an over-long count, re-serialises it
  // canonically in getId() and returns the canonical txid. Bitcoin Core rejects
  // the transaction outright, so that txid belongs to nothing that can confirm.
  // Refusing to hash it is the safe direction.
  //
  // All three prefixes are covered because the guards are what keep this parser
  // byte-equal to the oracle here: it re-emits every compact size verbatim
  // (`transaction.slice(start, offset)`), where bitcoinjs-lib re-encodes it. Drop
  // any one guard and that prefix is accepted and hashed as written, producing a
  // txid the oracle does not produce - with nothing else in the suite failing.
  it("rejects an input count encoded in more bytes than it needs, where bitcoinjs-lib accepts it", () => {
    const legacy = testTransaction(false);
    const canonicalTxid = calculateBtcTxHash(legacy);

    for (const [prefix, encoded] of Object.entries(
      NON_CANONICAL_INPUT_COUNT_ENCODINGS,
    )) {
      const txHex = `${legacy.slice(0, VERSION_HEX_LENGTH)}${encoded}${legacy.slice(VERSION_HEX_LENGTH + CANONICAL_INPUT_COUNT_HEX_LENGTH)}`;
      expect(() => calculatePeginTxHash(txHex), prefix).toThrow(
        /Non-canonical input count/,
      );
      expect(calculateBtcTxHash(txHex), prefix).toBe(canonicalTxid);
    }
  });

  // The registration path always passes prefixed hex - PeginManager.ts:1416
  // hashes `ensureHexPrefix(depositorSignedPeginTx)` - and no generated fixture
  // carries a prefix, because Transaction.toHex() never emits one.
  it("accepts the 0x-prefixed hex the registration path passes", () => {
    const legacy = testTransaction(false);
    expect(calculatePeginTxHash(`0x${legacy}`)).toBe(
      calculateBtcTxHash(legacy),
    );
  });

  // More permissive than the oracle. bitcoinjs-lib reads the 8-byte value
  // through verifuint and throws above 2^53 - 1; this parser copies the field
  // verbatim, so it hashes what the oracle refuses. The consensus money cap is
  // 2.1e15 satoshis, well under 2^53, so no transaction that can confirm
  // reaches the gap - it opens only for a value no supply can fund.
  it("hashes an output value above bitcoinjs-lib's 2^53 read limit, which the oracle refuses", () => {
    const legacy = testTransaction(false);
    const aboveOracleReadLimit = legacy.replace(
      TEST_TRANSACTION_OUTPUT_VALUE_HEX,
      "ffffffffffffffff",
    );
    expect(aboveOracleReadLimit).not.toBe(legacy);
    expect(() => calculateBtcTxHash(aboveOracleReadLimit)).toThrow(
      /value out of range/,
    );
    expect(calculatePeginTxHash(aboveOracleReadLimit)).toMatch(
      /^0x[0-9a-f]{64}$/,
    );
  });

  // The largest value a confirmable transaction can carry is inside the range
  // both implementations read, so the gap above is not reachable from the money
  // supply. This is the assertion that makes that claim testable.
  it("agrees with bitcoinjs-lib at the consensus money cap", () => {
    const atMoneyCap = testTransaction(false).replace(
      TEST_TRANSACTION_OUTPUT_VALUE_HEX,
      MAX_MONEY_SATOSHIS_LE_HEX,
    );
    expect(calculatePeginTxHash(atMoneyCap)).toBe(
      calculateBtcTxHash(atMoneyCap),
    );
  });

  // Golden vector from the btc-vault Rust tests
  // (crates/eth-client/src/vault_id.rs): peginTxHash = [0xab; 32],
  // depositor = 0x1234567890abcdef1234567890abcdef12345678. Same literal the
  // WASM engine is pinned to in primitives/__tests__/deriveVaultId.test.ts.
  it("matches the Solidity/Rust vault-ID golden vector", () => {
    expect(derivePeginVaultId(GOLDEN_PEGIN_TX_HASH, GOLDEN_DEPOSITOR)).toBe(
      GOLDEN_VAULT_ID,
    );
  });

  it("matches the WASM deriveVaultId engine it will replace on the registration path", async () => {
    const fixtures = [
      { peginTxHash: GOLDEN_PEGIN_TX_HASH, depositor: GOLDEN_DEPOSITOR },
      ...vaultIdFixtures(),
    ];

    for (const { peginTxHash, depositor } of fixtures) {
      const engineVaultId = await deriveVaultId(peginTxHash, depositor);
      expect(derivePeginVaultId(peginTxHash, depositor).toLowerCase()).toBe(
        `0x${engineVaultId.toLowerCase()}`,
      );
    }
  });
});
