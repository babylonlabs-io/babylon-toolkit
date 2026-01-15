/**
 * Test Constants for PSBT Primitive Tests
 *
 * This module contains Bitcoin protocol constants and test fixtures used across
 * PSBT primitive tests.
 *
 * @module primitives/psbt/__tests__/constants
 */

import { Buffer } from "buffer";

// ==================== Bitcoin Protocol Constants ====================

/**
 * Tapscript leaf version as defined in BIP-341.
 *
 * The value 0xc0 (binary: 11000000) represents:
 * - Bit 0: Parity bit for output key y-coordinate
 * - Bits 1-7: Leaf version (0xc0 >> 1 = 0x60)
 *
 * This is the standard leaf version for Tapscript execution.
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
 * @see Rust: bitcoin::taproot::LeafVersion::TapScript
 */
export const TAPSCRIPT_LEAF_VERSION = 0xc0;

/**
 * Maximum sequence value (no relative timelock).
 *
 * When set to 0xffffffff, BIP-68 relative timelocks are disabled.
 * This is equivalent to Bitcoin's Sequence::MAX.
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki
 * @see Rust: bitcoin::Sequence::MAX
 */
export const SEQUENCE_MAX = 0xffffffff;

/**
 * P2WPKH script prefix (OP_0 + 20-byte push).
 *
 * Format: 0x00 (witness version 0) + 0x14 (20 bytes)
 *
 * @see BIP-141: https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki
 */
export const P2WPKH_PREFIX = "0014";

/**
 * P2TR script prefix (OP_1 + 32-byte push).
 *
 * Format: 0x51 (witness version 1 / OP_1) + 0x20 (32 bytes)
 *
 * @see BIP-341: https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
 */
export const P2TR_PREFIX = "5120";

// ==================== Test Transaction IDs ====================

/**
 * All-zeros transaction ID (null/invalid reference).
 *
 * Used in tests to create dummy inputs that don't reference real transactions.
 * Equivalent to Txid::all_zeros() in Rust.
 *
 * @see Rust: bitcoin::Txid::all_zeros()
 */
export const NULL_TXID = Buffer.alloc(32, 0);

/**
 * Dummy transaction ID (filled with 0x01).
 *
 * Used to create distinct dummy transactions for claim outputs.
 */
export const DUMMY_TXID_1 = Buffer.alloc(32, 1);

/**
 * Dummy transaction ID (filled with 0x02).
 *
 * Used to create distinct dummy transactions for assert outputs.
 */
export const DUMMY_TXID_2 = Buffer.alloc(32, 2);

/**
 * All-ones transaction ID (invalid reference).
 *
 * Used in error handling tests to verify behavior with invalid txids.
 */
export const INVALID_TXID = Buffer.alloc(32, 0xff);

// ==================== Test Amounts (in satoshis) ====================

/**
 * Test pegin amount: 100,000 satoshis (0.001 BTC).
 *
 * Represents the vault output value from a peg-in transaction.
 * This is the amount locked in the vault that the depositor can later claim.
 *
 * Equivalent to Rust test constant in pegin_claim_graph.rs.
 */
export const TEST_PEGIN_VALUE = 100_000n;

/**
 * Test claim output value: 50,000 satoshis (0.0005 BTC).
 *
 * Represents a claim transaction output that can be spent in payout.
 * In production, claim transactions have 2 outputs for different spending paths.
 */
export const TEST_CLAIM_VALUE = 50_000n;

/**
 * Test payout output value: 95,000 satoshis (0.00095 BTC).
 *
 * Calculated as: TEST_PEGIN_VALUE - 5,000 sats fee
 * Represents the amount sent to recipient after deducting transaction fees.
 */
export const TEST_PAYOUT_VALUE = 95_000n;

/**
 * Combined payout value with claim inputs: 145,000 satoshis (0.00145 BTC).
 *
 * Calculated as: TEST_PEGIN_VALUE + TEST_CLAIM_VALUE - 5,000 sats fee
 * Used when payout transaction spends both pegin and claim outputs.
 */
export const TEST_COMBINED_VALUE = 145_000n;

/**
 * Witness UTXO value for tests: 100,000 satoshis.
 *
 * Standard test value used for witnessUtxo in PSBT inputs.
 */
export const TEST_WITNESS_UTXO_VALUE = 100_000;

/**
 * Output value after fees: 95,000 satoshis.
 *
 * Standard test value for PSBT outputs.
 */
export const TEST_OUTPUT_VALUE = 95_000;

// ==================== Test Script Generators ====================

/**
 * Creates a dummy P2WPKH scriptPubKey for testing.
 *
 * Format: OP_0 <20-byte-hash>
 * The hash is filled with a repeating character for easy identification in tests.
 *
 * @param fillByte - Hex character to repeat (0-f), defaults to "0"
 * @returns P2WPKH scriptPubKey buffer
 *
 * @example
 * ```typescript
 * createDummyP2WPKH("0"); // 0x0014 + "0".repeat(40)
 * createDummyP2WPKH("a"); // 0x0014 + "a".repeat(40)
 * createDummyP2WPKH("f"); // 0x0014 + "f".repeat(40)
 * ```
 */
export function createDummyP2WPKH(fillByte: string = "0"): Buffer {
  if (fillByte.length !== 1 || !/[0-9a-f]/i.test(fillByte)) {
    throw new Error("fillByte must be a single hex character (0-f)");
  }
  // P2WPKH: OP_0 (0x00) + PUSH_20 (0x14) + 20-byte hash
  return Buffer.from(P2WPKH_PREFIX + fillByte.repeat(40), "hex");
}

/**
 * Creates a dummy P2TR scriptPubKey using secp256k1 generator point.
 *
 * Format: OP_1 <32-byte-x-only-pubkey>
 *
 * @returns P2TR scriptPubKey buffer with generator point
 *
 * @see secp256k1 specification: https://en.bitcoin.it/wiki/Secp256k1
 */
export function createDummyP2TR(): Buffer {
  // secp256k1 generator point G's x-coordinate
  // G = (0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798, ...)
  const G_X_COORDINATE =
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

  // P2TR: OP_1 (0x51) + PUSH_32 (0x20) + 32-byte x-only pubkey
  return Buffer.from(P2TR_PREFIX + G_X_COORDINATE, "hex");
}
