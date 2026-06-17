import { describe, expect, it } from "vitest";

import {
  CborDecodeError,
  CborReader,
  type CborTagged,
  decodeCbor,
} from "../cborDecode";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("decodeCbor", () => {
  it("decodes small unsigned integers inline", () => {
    expect(decodeCbor(bytes(0x00))).toBe(0);
    expect(decodeCbor(bytes(0x17))).toBe(23);
  });

  it("decodes multi-byte unsigned integers (1/2/4 byte arguments)", () => {
    expect(decodeCbor(bytes(0x18, 0x18))).toBe(24);
    expect(decodeCbor(bytes(0x19, 0x01, 0x00))).toBe(256);
    expect(decodeCbor(bytes(0x1a, 0x65, 0x53, 0xf1, 0x00))).toBe(1_700_000_000);
  });

  it("decodes negative integers", () => {
    // 0x20 = -1, 0x37 = -24, 0x38 0x2e = -47 (the ES256K alg id).
    expect(decodeCbor(bytes(0x20))).toBe(-1);
    expect(decodeCbor(bytes(0x37))).toBe(-24);
    expect(decodeCbor(bytes(0x38, 0x2e))).toBe(-47);
  });

  it("decodes byte strings as raw bytes", () => {
    expect(decodeCbor(bytes(0x43, 0x01, 0x02, 0x03))).toEqual(
      bytes(0x01, 0x02, 0x03),
    );
  });

  it("decodes text strings as UTF-8", () => {
    // 0x6a + "Signature1"
    const sig = bytes(0x6a, ...new TextEncoder().encode("Signature1"));
    expect(decodeCbor(sig)).toBe("Signature1");
  });

  it("decodes arrays", () => {
    expect(decodeCbor(bytes(0x83, 0x01, 0x02, 0x03))).toEqual([1, 2, 3]);
  });

  it("decodes maps with integer keys", () => {
    // {1: 2, 3: 4}
    const map = decodeCbor(bytes(0xa2, 0x01, 0x02, 0x03, 0x04));
    expect(map).toBeInstanceOf(Map);
    expect((map as Map<number, number>).get(1)).toBe(2);
    expect((map as Map<number, number>).get(3)).toBe(4);
  });

  it("decodes tagged values", () => {
    // tag(18) wrapping uint 5
    const tagged = decodeCbor(bytes(0xd2, 0x05)) as CborTagged;
    expect(tagged.tag).toBe(18);
    expect(tagged.value).toBe(5);
  });

  it("rejects indefinite-length encodings", () => {
    // 0x5f = indefinite-length byte string.
    expect(() => decodeCbor(bytes(0x5f))).toThrow(CborDecodeError);
  });

  it("rejects reserved additional-info values", () => {
    // 0x1c = major 0, additional info 28 (reserved).
    expect(() => decodeCbor(bytes(0x1c))).toThrow(CborDecodeError);
  });

  it("rejects input that ends mid-item", () => {
    // Array of 2 declared, only 1 element present.
    expect(() => decodeCbor(bytes(0x82, 0x01))).toThrow(CborDecodeError);
  });

  it("rejects a byte string whose length overruns the buffer", () => {
    expect(() => decodeCbor(bytes(0x43, 0x01))).toThrow(CborDecodeError);
  });
});

describe("CborReader", () => {
  it("advances pos so callers can slice an item's exact encoded bytes", () => {
    // [protected-bstr h'a0', uint 7]
    const buf = bytes(0x82, 0x41, 0xa0, 0x07);
    const reader = new CborReader(buf);
    reader.readHead(); // array header

    const start = reader.pos;
    const content = reader.readByteString();
    const encoded = buf.subarray(start, reader.pos);

    expect(content).toEqual(bytes(0xa0));
    expect(encoded).toEqual(bytes(0x41, 0xa0)); // head + content
    expect(reader.readValue()).toBe(7);
  });

  it("readByteString throws on a non-byte-string item", () => {
    expect(() => new CborReader(bytes(0x07)).readByteString()).toThrow(
      CborDecodeError,
    );
  });
});
