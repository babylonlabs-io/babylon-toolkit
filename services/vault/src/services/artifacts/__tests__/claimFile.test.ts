import { describe, expect, it } from "vitest";

import {
  buildClaimFile,
  claimFileByteLength,
  sessionEntryName,
  sortSessionKeys,
} from "../claimFile";

const IDENTITY = {
  vaultId: "0x" + "AB".repeat(32),
  peginTxid: "aa".repeat(32),
  depositorPk: "bb".repeat(32),
  depositorEthAddress: "0x" + "12".repeat(20),
  providerAddress: "0x" + "CD".repeat(20),
  signedGraphFingerprint: "ef".repeat(32),
};
const MANIFEST = {
  txGraphJson: '{"pegin_tx":{"note":"café € 😀"}}',
  verifyingKeyHex: "abcd",
};
const PK_HI = "22".repeat(32);
const PK_LO = "11".repeat(32);
const SESSIONS = new Map([
  [PK_HI, { byteLength: 32 * 1024, sha256: "a".repeat(64) }],
  [PK_LO, { byteLength: 32 * 1024 + 1, sha256: "b".repeat(64) }],
]);

describe("buildClaimFile", () => {
  it("emits the schema keys in order, lowercases ids, and sorts sessions", () => {
    const text = new TextDecoder().decode(
      buildClaimFile(IDENTITY, MANIFEST, SESSIONS),
    );
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed)).toEqual([
      "format",
      "format_version",
      "pegin_txid",
      "vault_id",
      "depositor_pk",
      "vault_provider",
      "signed_graph_fingerprint",
      "tx_graph_json",
      "verifying_key_hex",
      "sessions",
    ]);
    expect(parsed.format).toBe("babylon-btc-vault-recovery-kit");
    expect(parsed.format_version).toBe(1);
    expect(parsed.vault_id).toBe("0x" + "ab".repeat(32));
    expect(parsed.vault_provider).toBe("0x" + "cd".repeat(20));
    expect(parsed.tx_graph_json).toBe(MANIFEST.txGraphJson);
    expect(Object.keys(parsed.sessions)).toEqual([PK_LO, PK_HI]);
    expect(parsed.sessions[PK_LO]).toEqual({
      byte_length: 32 * 1024 + 1,
      sha256: "b".repeat(64),
    });
    expect(text).not.toContain("saved_at");
    expect(text).not.toContain('"path"');
  });

  it("refuses a hash that is not 64 lowercase hex", () => {
    const bad = new Map([
      [PK_LO, { byteLength: 32 * 1024, sha256: "A".repeat(64) }],
    ]);
    expect(() => buildClaimFile(IDENTITY, MANIFEST, bad)).toThrow(RangeError);
  });

  it("refuses a 0x-prefixed depositor key", () => {
    const prefixed = { ...IDENTITY, depositorPk: "0x" + "bb".repeat(32) };
    expect(() => buildClaimFile(prefixed, MANIFEST, SESSIONS)).toThrow(
      RangeError,
    );
  });

  it("refuses a compressed depositor key", () => {
    const compressed = { ...IDENTITY, depositorPk: "02" + "bb".repeat(32) };
    expect(() => buildClaimFile(compressed, MANIFEST, SESSIONS)).toThrow(
      RangeError,
    );
  });

  it("refuses a vault id without its 0x prefix", () => {
    const bare = { ...IDENTITY, vaultId: "ab".repeat(32) };
    expect(() => buildClaimFile(bare, MANIFEST, SESSIONS)).toThrow(RangeError);
  });

  it("precomputes the length of a graph with non-ASCII text exactly", () => {
    const lengths = new Map([
      [PK_HI, 32 * 1024],
      [PK_LO, 32 * 1024 + 1],
    ]);
    expect(claimFileByteLength(IDENTITY, MANIFEST, lengths)).toBe(
      buildClaimFile(IDENTITY, MANIFEST, SESSIONS).byteLength,
    );
  });
});

describe("session keys", () => {
  it("names entries and sorts keys bytewise", () => {
    expect(sessionEntryName(PK_LO)).toBe(`sessions/${PK_LO}.cbor`);
    expect(sortSessionKeys([PK_HI, PK_LO])).toEqual([PK_LO, PK_HI]);
    expect(() => sortSessionKeys([PK_LO, PK_LO])).toThrow(RangeError);
  });
});
