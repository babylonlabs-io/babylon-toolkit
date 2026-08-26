import { test, expect } from "@playwright/test";

import { toXOnlyPublicKeyHex } from "../../src/core/utils/publicKey";

const VALID_X_ONLY = "ab".repeat(32); // 64 hex chars
const VALID_COMPRESSED_02 = "02" + VALID_X_ONLY;
const VALID_COMPRESSED_03 = "03" + VALID_X_ONLY;

test("strips 02 prefix from compressed public key", () => {
  expect(toXOnlyPublicKeyHex(VALID_COMPRESSED_02)).toBe(VALID_X_ONLY);
});

test("strips 03 prefix from compressed public key", () => {
  expect(toXOnlyPublicKeyHex(VALID_COMPRESSED_03)).toBe(VALID_X_ONLY);
});

test("returns x-only key as-is", () => {
  expect(toXOnlyPublicKeyHex(VALID_X_ONLY)).toBe(VALID_X_ONLY);
});

test("rejects compressed key with invalid prefix", () => {
  const invalidPrefix = "04" + VALID_X_ONLY;
  expect(() => toXOnlyPublicKeyHex(invalidPrefix)).toThrow(
    /Invalid compressed public key prefix '04'/,
  );
});

test("rejects uncompressed public key (130 chars)", () => {
  const uncompressed = "04" + "ab".repeat(64);
  expect(() => toXOnlyPublicKeyHex(uncompressed)).toThrow(
    /Unexpected public key length 130/,
  );
});

test("rejects non-hex characters", () => {
  const nonHex = "zz" + "ab".repeat(31);
  expect(() => toXOnlyPublicKeyHex(nonHex)).toThrow(/non-hex characters/);
});

test("rejects empty string with descriptive message", () => {
  expect(() => toXOnlyPublicKeyHex("")).toThrow(/must not be empty/);
});

test("rejects unexpected length", () => {
  expect(() => toXOnlyPublicKeyHex("abcd")).toThrow(
    /Unexpected public key length 4/,
  );
});
