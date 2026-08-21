/**
 * Byte-level tests for the raw GET_EXTENDED_PUBKEY read.
 *
 * The APDU layout here is the load-bearing contract with the device — provider
 * tests mock this module away, so this file is the only coverage the connect
 * path's one device read gets. Golden values come from the published BIP-86
 * test vectors, driven through the real extended-key decode.
 */

import { HDKey } from "@scure/bip32";
import { describe, expect, it } from "vitest";

import { getExtendedPublicKey, getMasterFingerprintHex, getXOnlyPublicKeyHex } from "../derivation";

/** BIP-86 test vectors (mnemonic "abandon ... about"), published in the BIP. */
const BIP86_ACCOUNT_XPUB =
  "xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ";
const BIP86_FIRST_XONLY = "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";

const MAINNET_VERSIONS = { public: 0x0488b21e, private: 0x0488ade4 };
const TESTNET_VERSIONS = { public: 0x043587cf, private: 0x04358394 };

const HARDENED = 0x80000000;
const MAINNET_LEAF_PATH = [86 + HARDENED, 0 + HARDENED, 0 + HARDENED, 0, 0];
const MAINNET_ACCOUNT_PATH = [86 + HARDENED, 0 + HARDENED, 0 + HARDENED];

/** A sender that records the APDU and answers with a fixed payload. */
function fakeSender(responseBytes: Uint8Array) {
  const sent: { cla: number; ins: number; p1: number; p2: number; data: Uint8Array }[] = [];
  const send = async (apdu: (typeof sent)[number]) => {
    sent.push(apdu);
    return responseBytes;
  };
  return { send, sent };
}

function asciiXpubAtLeaf(versions: { public: number; private: number }): Uint8Array {
  const leaf = HDKey.fromExtendedKey(BIP86_ACCOUNT_XPUB, MAINNET_VERSIONS).deriveChild(0).deriveChild(0);
  // Re-encode under the requested version bytes so the same key material can
  // exercise both the xpub and tpub decode paths.
  const reversioned = new HDKey({
    publicKey: leaf.publicKey!,
    chainCode: leaf.chainCode!,
    versions,
  });
  return new TextEncoder().encode(reversioned.publicExtendedKey);
}

describe("getXOnlyPublicKeyHex", () => {
  it("sends the exact GET_EXTENDED_PUBKEY bytes for a 5-level BIP-86 path", async () => {
    const { send, sent } = fakeSender(asciiXpubAtLeaf(MAINNET_VERSIONS));

    await getXOnlyPublicKeyHex(send, MAINNET_LEAF_PATH, MAINNET_VERSIONS);

    expect(sent).toHaveLength(1);
    const apdu = sent[0];
    expect([apdu.cla, apdu.ins, apdu.p1, apdu.p2]).toEqual([0xe1, 0x00, 0x00, 0x01]);
    // display=0 (silent) ‖ n=5 ‖ five u32BE levels
    expect(Buffer.from(apdu.data).toString("hex")).toBe(
      "00" + "05" + "80000056" + "80000000" + "80000000" + "00000000" + "00000000",
    );
  });

  it("decodes the device's ASCII xpub to the published BIP-86 x-only key", async () => {
    const { send } = fakeSender(asciiXpubAtLeaf(MAINNET_VERSIONS));

    await expect(getXOnlyPublicKeyHex(send, MAINNET_LEAF_PATH, MAINNET_VERSIONS)).resolves.toBe(BIP86_FIRST_XONLY);
  });

  it("decodes a tpub when given testnet version bytes", async () => {
    // The signet build returns a tpub; without the version override the decode
    // throws "Version mismatch". Same key material, different serialization.
    const { send } = fakeSender(asciiXpubAtLeaf(TESTNET_VERSIONS));

    await expect(getXOnlyPublicKeyHex(send, MAINNET_LEAF_PATH, TESTNET_VERSIONS)).resolves.toBe(BIP86_FIRST_XONLY);
  });

  it.each([0, 11])("rejects a %d-level path before any device I/O", async (levels) => {
    // The base app rejects paths past MAX_BIP32_PATH_STEPS with a bare status
    // word; bounding here also keeps the 1-byte length field from truncating.
    const { send, sent } = fakeSender(asciiXpubAtLeaf(MAINNET_VERSIONS));

    await expect(getXOnlyPublicKeyHex(send, Array(levels).fill(0), MAINNET_VERSIONS)).rejects.toThrow(/1\.\.10 levels/);
    expect(sent).toHaveLength(0);
  });

  it("rejects a malformed device response rather than deriving from it", async () => {
    const { send } = fakeSender(new TextEncoder().encode("not-an-extended-key"));

    await expect(getXOnlyPublicKeyHex(send, MAINNET_LEAF_PATH, MAINNET_VERSIONS)).rejects.toThrow();
  });
});

describe("getMasterFingerprintHex", () => {
  it("sends GET_MASTER_FINGERPRINT (INS 0x05, empty data) and returns the 4 bytes as lowercase hex", async () => {
    const { send, sent } = fakeSender(new Uint8Array([0xf5, 0xac, 0xc2, 0xfd]));

    const fingerprint = await getMasterFingerprintHex(send);

    expect(fingerprint).toBe("f5acc2fd");
    expect(sent).toHaveLength(1);
    expect([sent[0].cla, sent[0].ins, sent[0].p1, sent[0].p2]).toEqual([0xe1, 0x05, 0x00, 0x01]);
    expect(sent[0].data).toHaveLength(0);
  });

  it("rejects a response that is not exactly 4 bytes", async () => {
    const { send } = fakeSender(new Uint8Array([0xf5, 0xac, 0xc2]));
    await expect(getMasterFingerprintHex(send)).rejects.toThrow(/4-byte master fingerprint/);
  });
});

describe("getExtendedPublicKey", () => {
  it("returns the device's extended key string verbatim for a 3-level account path", async () => {
    const { send, sent } = fakeSender(new TextEncoder().encode(BIP86_ACCOUNT_XPUB));

    const xpub = await getExtendedPublicKey(send, MAINNET_ACCOUNT_PATH, MAINNET_VERSIONS);

    expect(xpub).toBe(BIP86_ACCOUNT_XPUB);
    expect([sent[0].cla, sent[0].ins, sent[0].p1, sent[0].p2]).toEqual([0xe1, 0x00, 0x00, 0x01]);
    // display=0 (silent) ‖ n=3 ‖ three u32BE levels
    expect(Buffer.from(sent[0].data).toString("hex")).toBe("00" + "03" + "80000056" + "80000000" + "80000000");
  });

  it("rejects an extended key that does not decode under the requested version bytes", async () => {
    // A mainnet xpub read under testnet versions: the device build and the host
    // network disagree — surface it here, before the string is embedded in a policy.
    const { send } = fakeSender(new TextEncoder().encode(BIP86_ACCOUNT_XPUB));
    await expect(getExtendedPublicKey(send, MAINNET_ACCOUNT_PATH, TESTNET_VERSIONS)).rejects.toThrow();
  });

  it("rejects an empty response", async () => {
    const { send } = fakeSender(new Uint8Array(0));
    await expect(getExtendedPublicKey(send, MAINNET_ACCOUNT_PATH, MAINNET_VERSIONS)).rejects.toThrow(
      /empty extended key/,
    );
  });
});
