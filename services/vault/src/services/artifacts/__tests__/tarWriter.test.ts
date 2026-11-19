import { describe, expect, it } from "vitest";

import {
  tarEndOfArchive,
  tarEntryBytes,
  tarHeader,
  tarPadding,
  tarPaddingBytes,
} from "../tarWriter";

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  new TextDecoder().decode(bytes.subarray(start, start + length));
const range = (a: number, b: number) =>
  Array.from({ length: b - a }, (_, i) => a + i);

describe("tarHeader", () => {
  it("lays out a ustar header for a regular file with mtime 0", () => {
    const header = tarHeader("claim.json", 1_234);
    expect(header.byteLength).toBe(512);
    expect(ascii(header, 0, 10)).toBe("claim.json");
    expect(header[10]).toBe(0);
    expect(ascii(header, 100, 8)).toBe("0000644\0");
    expect(ascii(header, 108, 8)).toBe("0000000\0");
    expect(ascii(header, 116, 8)).toBe("0000000\0");
    expect(ascii(header, 124, 12)).toBe("00000002322\0"); // 1234 = 0o2322
    expect(ascii(header, 136, 12)).toBe("00000000000\0");
    expect(ascii(header, 156, 1)).toBe("0");
    expect(ascii(header, 257, 6)).toBe("ustar\0");
    expect(ascii(header, 263, 2)).toBe("00");
    expect(ascii(header, 329, 8)).toBe("0000000\0");
    expect(ascii(header, 337, 8)).toBe("0000000\0");
    for (const i of [
      ...range(157, 257),
      ...range(265, 329),
      ...range(345, 512),
    ])
      expect(header[i]).toBe(0);
  });

  it("stores the checksum as six octal digits, NUL, space over a space-filled field", () => {
    const header = tarHeader("sessions/" + "ab".repeat(32) + ".cbor", 0);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
    expect(ascii(header, 148, 8)).toBe(
      sum.toString(8).padStart(6, "0") + "\0 ",
    );
  });

  it("refuses names over 100 bytes, names with NUL, and sizes outside 11 octal digits", () => {
    expect(() => tarHeader("x".repeat(101), 0)).toThrow(RangeError);
    expect(() => tarHeader("é".repeat(51), 0)).toThrow(RangeError); // 102 UTF-8 bytes
    expect(() => tarHeader("a\0b", 0)).toThrow(RangeError);
    expect(() => tarHeader("a", -1)).toThrow(RangeError);
    expect(() => tarHeader("a", 1.5)).toThrow(RangeError);
    expect(() => tarHeader("a", 0o77777777777 + 1)).toThrow(RangeError);
    expect(() => tarHeader("a", 0o77777777777)).not.toThrow();
  });
});

describe("padding", () => {
  it.each([
    [0, 0],
    [1, 511],
    [511, 1],
    [512, 0],
    [513, 511],
    [88_064_670, 354],
  ])("pads %i bytes with %i", (size, pad) => {
    expect(tarPaddingBytes(size)).toBe(pad);
    expect(tarPadding(size).byteLength).toBe(pad);
    expect(tarPadding(size).every((b) => b === 0)).toBe(true);
    expect(tarEntryBytes(size)).toBe(512 + size + pad);
  });

  it("keeps every entry on a 512-byte boundary for random sizes", () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let i = 0; i < 200; i++) {
      const size = next() % 300_000;
      expect((512 + size + tarPaddingBytes(size)) % 512).toBe(0);
      expect(tarPaddingBytes(size)).toBeLessThan(512);
      expect(tarEntryBytes(size)).toBeGreaterThanOrEqual(512 + size);
    }
  });

  it("ends the archive with two zero blocks", () => {
    const end = tarEndOfArchive();
    expect(end.byteLength).toBe(1024);
    expect(end.every((b) => b === 0)).toBe(true);
  });
});
