import { sha256 } from "@noble/hashes/sha2.js";
import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";

function decodeHex(value: string, label: string): Uint8Array {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error(`${label} must be non-empty, even-length hex`);
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} contains non-hex characters`);
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    chunks.reduce((length, chunk) => length + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Parse enough of Bitcoin's consensus transaction encoding to serialize the
 * no-witness form used for txid calculation. Every length is bounds-checked;
 * malformed/trailing data is rejected rather than hashed as an opaque blob.
 */
function serializeWithoutWitness(transaction: Uint8Array): Uint8Array {
  let offset = 0;

  const take = (length: number, label: string): Uint8Array => {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error(`Invalid ${label} length ${length}`);
    }
    if (offset + length > transaction.length) {
      throw new Error(`Truncated Bitcoin transaction while reading ${label}`);
    }
    const value = transaction.slice(offset, offset + length);
    offset += length;
    return value;
  };

  const readLittleEndian = (length: number, label: string): bigint => {
    const bytes = take(length, label);
    let value = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
      value = (value << 8n) | BigInt(bytes[i]);
    }
    return value;
  };

  const readCompactSize = (
    label: string,
  ): { encoded: Uint8Array; value: number } => {
    const start = offset;
    const prefix = take(1, label)[0];
    let value: bigint;
    if (prefix < 0xfd) {
      value = BigInt(prefix);
    } else if (prefix === 0xfd) {
      value = readLittleEndian(2, label);
      if (value < 0xfdn) throw new Error(`Non-canonical ${label}`);
    } else if (prefix === 0xfe) {
      value = readLittleEndian(4, label);
      if (value <= 0xffffn) throw new Error(`Non-canonical ${label}`);
    } else {
      value = readLittleEndian(8, label);
      if (value <= 0xffffffffn) throw new Error(`Non-canonical ${label}`);
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label} exceeds JavaScript's safe integer range`);
    }
    return {
      encoded: transaction.slice(start, offset),
      value: Number(value),
    };
  };

  const version = take(4, "version");
  const hasWitness =
    transaction[offset] === 0x00 && transaction[offset + 1] === 0x01;
  if (hasWitness) offset += 2;

  const inputCount = readCompactSize("input count");
  const inputs: Uint8Array[] = [];
  for (let i = 0; i < inputCount.value; i++) {
    const start = offset;
    take(32, `input ${i} previous transaction hash`);
    take(4, `input ${i} previous output index`);
    const scriptLength = readCompactSize(`input ${i} script length`);
    take(scriptLength.value, `input ${i} script`);
    take(4, `input ${i} sequence`);
    inputs.push(transaction.slice(start, offset));
  }

  const outputCount = readCompactSize("output count");
  const outputs: Uint8Array[] = [];
  for (let i = 0; i < outputCount.value; i++) {
    const start = offset;
    take(8, `output ${i} value`);
    const scriptLength = readCompactSize(`output ${i} script length`);
    take(scriptLength.value, `output ${i} script`);
    outputs.push(transaction.slice(start, offset));
  }

  if (hasWitness) {
    let hasWitnessData = false;
    for (let i = 0; i < inputCount.value; i++) {
      const itemCount = readCompactSize(`input ${i} witness item count`);
      hasWitnessData ||= itemCount.value > 0;
      for (let j = 0; j < itemCount.value; j++) {
        const itemLength = readCompactSize(
          `input ${i} witness item ${j} length`,
        );
        take(itemLength.value, `input ${i} witness item ${j}`);
      }
    }
    if (!hasWitnessData) {
      throw new Error("Bitcoin transaction has superfluous witness marker");
    }
  }

  const locktime = take(4, "locktime");
  if (offset !== transaction.length) {
    throw new Error(
      `Bitcoin transaction has ${transaction.length - offset} trailing byte(s)`,
    );
  }

  return concatBytes([
    version,
    inputCount.encoded,
    ...inputs,
    outputCount.encoded,
    ...outputs,
    locktime,
  ]);
}

/** Calculate a Bitcoin txid without importing bitcoinjs-lib. */
export function calculatePeginTxHash(transactionHex: string): Hex {
  const serialized = serializeWithoutWitness(
    decodeHex(transactionHex, "depositorSignedPeginTx"),
  );
  const digest = sha256(sha256(serialized));
  digest.reverse();
  return `0x${encodeHex(digest)}`;
}

/** Derive the Solidity vault ID without loading the Rust/WASM package. */
export function derivePeginVaultId(peginTxHash: Hex, depositor: Address): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(peginTxHash)) {
    throw new Error("peginTxHash must be a 32-byte hex value");
  }
  if (!isAddress(depositor)) {
    throw new Error(`Invalid depositor Ethereum address: ${depositor}`);
  }
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }],
      [peginTxHash, depositor],
    ),
  );
}
