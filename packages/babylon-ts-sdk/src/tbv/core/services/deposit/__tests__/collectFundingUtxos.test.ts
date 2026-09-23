/**
 * Tests for collecting a policy wallet's funding UTXOs across its addresses.
 */

import { describe, expect, it, vi } from "vitest";

import type { MempoolUTXO } from "../../../clients/mempool";
import type { FundingAddress } from "../../../deposit-terms";
import { collectFundingUtxos } from "../collectFundingUtxos";

// BIP-86 test vectors, mnemonic "abandon abandon … about", account 0 on
// mainnet: https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki#test-vectors
// Receive m/86'/0'/0'/0/0, change m/86'/0'/0'/1/0 — different branches, so
// different keys, scripts and addresses. Taken from the BIP rather than
// re-derived, so the address/key binding under test is pinned independently.
const RECEIVE_KEY =
  "cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115";
const RECEIVE_SCRIPT =
  "5120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c";
const RECEIVE_ADDRESS =
  "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr";

const CHANGE_KEY =
  "399f1b2f4393f29a18c937859c5dd8a77350103157eb880f02e8c08214277cef";
const CHANGE_SCRIPT =
  "5120882d74e5d0572d5a816cef0041a96b6c1de832f6f9676d9605c44d5e9a97d3dc";
const CHANGE_ADDRESS =
  "bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7";

// Second receive address (m/86'/0'/0'/0/1), for the wrong-pairing cases.
const SECOND_RECEIVE_KEY =
  "83dfe85a3151d2517290da461fe2815591ef69f2b18a2ce63f01697a8b313145";

const ADDRESSES: FundingAddress[] = [
  {
    address: RECEIVE_ADDRESS,
    internalPubkeyHex: RECEIVE_KEY,
    branch: 0,
    addressIndex: 0,
  },
  {
    address: CHANGE_ADDRESS,
    internalPubkeyHex: CHANGE_KEY,
    branch: 1,
    addressIndex: 0,
  },
];

const RECEIVE_TXID = "a".repeat(64);
const CHANGE_TXID = "b".repeat(64);

function utxo(
  txid: string,
  vout: number,
  value: number,
  scriptPubKey: string,
  confirmed = true,
): MempoolUTXO {
  return { txid, vout, value, scriptPubKey, confirmed };
}

/** Lists each address's own UTXOs, as the mempool client would. */
function listerFor(listings: Record<string, MempoolUTXO[]>) {
  return vi.fn(async (address: string) => listings[address] ?? []);
}

function collect(
  addresses: readonly FundingAddress[],
  listAddressUtxos: (address: string) => Promise<MempoolUTXO[]>,
) {
  return collectFundingUtxos({
    addresses,
    network: "bitcoin",
    listAddressUtxos,
  });
}

describe("collectFundingUtxos", () => {
  it("annotates each address's UTXOs with the key and path that own them", async () => {
    const listAddressUtxos = listerFor({
      [RECEIVE_ADDRESS]: [
        utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT),
        utxo(RECEIVE_TXID, 1, 10_000, RECEIVE_SCRIPT, false),
      ],
      [CHANGE_ADDRESS]: [utxo(CHANGE_TXID, 0, 200_000, CHANGE_SCRIPT)],
    });

    const collected = await collect(ADDRESSES, listAddressUtxos);

    expect(collected).toHaveLength(3);
    expect(collected.find((u) => u.txid === CHANGE_TXID)).toEqual({
      txid: CHANGE_TXID,
      vout: 0,
      value: 200_000,
      scriptPubKey: CHANGE_SCRIPT,
      confirmed: true,
      internalPubkeyHex: CHANGE_KEY,
      address: CHANGE_ADDRESS,
    });
    // Unconfirmed entries are carried through: confirmation filtering is the
    // caller's concern, ownership is this function's.
    expect(collected.filter((u) => !u.confirmed)).toHaveLength(1);
  });

  it("emits the derived script and a lowercase txid, not the listing's spelling", async () => {
    // The listing's txid validator accepts either case, and its script is one
    // API-supplied value stamped on the whole address. Both are re-emitted
    // canonically: the signing path derives its own lookup key from raw
    // transaction bytes, which are lowercase.
    const listAddressUtxos = listerFor({
      [RECEIVE_ADDRESS]: [
        utxo(
          RECEIVE_TXID.toUpperCase(),
          0,
          800_000,
          RECEIVE_SCRIPT.toUpperCase(),
        ),
      ],
    });

    const [collected] = await collect(ADDRESSES, listAddressUtxos);

    expect(collected.txid).toBe(RECEIVE_TXID);
    expect(collected.scriptPubKey).toBe(RECEIVE_SCRIPT);
  });

  it("queries every address", async () => {
    const listAddressUtxos = listerFor({});

    await collect(ADDRESSES, listAddressUtxos);

    expect(listAddressUtxos).toHaveBeenCalledTimes(2);
    expect(listAddressUtxos).toHaveBeenCalledWith(RECEIVE_ADDRESS);
    expect(listAddressUtxos).toHaveBeenCalledWith(CHANGE_ADDRESS);
  });

  it("rejects a listing whose script the address's key does not derive", async () => {
    // The change address listed with the receive address's script — the
    // mislabelling that would sign over the wrong prevout.
    const listAddressUtxos = listerFor({
      [CHANGE_ADDRESS]: [utxo(CHANGE_TXID, 0, 200_000, RECEIVE_SCRIPT)],
    });

    await expect(collect(ADDRESSES, listAddressUtxos)).rejects.toThrow(
      /does not own the script reported for/,
    );
  });

  it("fails the whole call when one address cannot be listed", async () => {
    const listAddressUtxos = vi.fn(async (address: string) => {
      if (address === CHANGE_ADDRESS) throw new Error("mempool 502");
      return [utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT)];
    });

    await expect(collect(ADDRESSES, listAddressUtxos)).rejects.toThrow(
      `Could not list UTXOs for funding address ${CHANGE_ADDRESS}`,
    );
  });

  it("rejects an empty address set", async () => {
    await expect(collect([], listerFor({}))).rejects.toThrow(
      /reported no funding addresses/,
    );
  });

  describe("address/key pairing", () => {
    it("rejects an address its own key does not derive, before listing anything", async () => {
      // The receive address paired with the second receive address's key.
      // Both are the wallet's, and each part is well-formed — only the
      // pairing is wrong, so querying it would silently report zero.
      const listAddressUtxos = listerFor({});

      await expect(
        collect(
          [{ ...ADDRESSES[0], internalPubkeyHex: SECOND_RECEIVE_KEY }],
          listAddressUtxos,
        ),
      ).rejects.toThrow(/is not the address its own key derives on bitcoin/);

      expect(listAddressUtxos).not.toHaveBeenCalled();
    });

    it("rejects a wrong pairing even when that address holds no UTXOs", async () => {
      // An empty listing exercises no per-entry check, so the pairing is the
      // only thing that can catch it.
      await expect(
        collect(
          [
            ADDRESSES[0],
            { ...ADDRESSES[1], internalPubkeyHex: SECOND_RECEIVE_KEY },
          ],
          listerFor({
            [RECEIVE_ADDRESS]: [utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT)],
          }),
        ),
      ).rejects.toThrow(/is not the address its own key derives/);
    });

    it("rejects an address encoded for another network", async () => {
      // The same key on signet encodes to a tb1p… address; accepting it would
      // list an address that does not exist on the configured network.
      await expect(
        collectFundingUtxos({
          addresses: [ADDRESSES[0]],
          network: "signet",
          listAddressUtxos: listerFor({}),
        }),
      ).rejects.toThrow(/is not the address its own key derives on signet/);
    });
  });

  describe("path validation", () => {
    it("rejects a branch that is not an address branch of the account", async () => {
      await expect(
        collect([{ ...ADDRESSES[0], branch: 2 }], listerFor({})),
      ).rejects.toThrow(/reported branch 2; only 0 and 1 are addresses/);
    });

    it("rejects a hardened address index", async () => {
      // 0x80000000 is a different derivation entirely, and the device path
      // encoder refuses it.
      await expect(
        collect([{ ...ADDRESSES[0], addressIndex: 0x80000000 }], listerFor({})),
      ).rejects.toThrow(/non-hardened index in 0\.\.2147483647/);
    });

    it("rejects a negative address index", async () => {
      await expect(
        collect([{ ...ADDRESSES[0], addressIndex: -1 }], listerFor({})),
      ).rejects.toThrow(/non-hardened index in 0\.\.2147483647/);
    });

    it("names the seam when the wallet omits a field, rather than dying on its type", async () => {
      // No package depends on both the SDK and the wallet adapter, so the
      // shape the provider returns is not compile-checked against
      // FundingAddress. A dropped field must be reported, not crash.
      const withoutKey = {
        address: RECEIVE_ADDRESS,
        branch: 0,
        addressIndex: 0,
      } as FundingAddress;

      await expect(collect([withoutKey], listerFor({}))).rejects.toThrow(
        /missing its address or owning key/,
      );
    });

    it("names the outpoint's address when the key is 64 hex but off the curve", async () => {
      // Field-size minus one: well-formed hex, not an x coordinate of any
      // point. The taproot tweak would otherwise throw naming no address.
      await expect(
        collect(
          [{ ...ADDRESSES[0], internalPubkeyHex: "f".repeat(64) }],
          listerFor({}),
        ),
      ).rejects.toThrow(
        /is not a valid x-only public key on the secp256k1 curve/,
      );
    });

    it("emits the owning key lowercase, which is the only form the signer accepts", async () => {
      const listAddressUtxos = listerFor({
        [RECEIVE_ADDRESS]: [utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT)],
      });

      const [collected] = await collect(
        [{ ...ADDRESSES[0], internalPubkeyHex: RECEIVE_KEY.toUpperCase() }],
        listAddressUtxos,
      );

      expect(collected.internalPubkeyHex).toBe(RECEIVE_KEY);
    });

    it("rejects a malformed owning key before any listing", async () => {
      const listAddressUtxos = listerFor({});

      await expect(
        collect(
          [{ ...ADDRESSES[0], internalPubkeyHex: `0x${RECEIVE_KEY}` }],
          listAddressUtxos,
        ),
      ).rejects.toThrow(/invalid internalPubkeyHex/);

      expect(listAddressUtxos).not.toHaveBeenCalled();
    });
  });

  describe("ambiguity", () => {
    it("rejects a repeated owning key, which is the same address twice", async () => {
      // A key determines its address, so the only way to report one key twice
      // is to report its address twice.
      await expect(
        collect(
          [
            ADDRESSES[0],
            {
              ...ADDRESSES[1],
              address: RECEIVE_ADDRESS,
              internalPubkeyHex: RECEIVE_KEY,
            },
          ],
          listerFor({}),
        ),
      ).rejects.toThrow(`Funding address ${RECEIVE_ADDRESS} was listed twice.`);
    });

    it("rejects an uppercase bech32 spelling rather than treating it as new", async () => {
      // bech32 is case-insensitive, so an uppercase spelling is the same
      // address. The pairing check pins the canonical form the derivation
      // emits, so it never reaches the duplicate check as a distinct entry.
      await expect(
        collect(
          [{ ...ADDRESSES[0], address: RECEIVE_ADDRESS.toUpperCase() }],
          listerFor({}),
        ),
      ).rejects.toThrow(/is not the address its own key derives/);
    });

    it("rejects the same address listed twice", async () => {
      await expect(
        collect([ADDRESSES[0], ADDRESSES[0]], listerFor({})),
      ).rejects.toThrow(`Funding address ${RECEIVE_ADDRESS} was listed twice.`);
    });

    it("rejects two addresses on the same derivation path", async () => {
      await expect(
        collect([ADDRESSES[0], { ...ADDRESSES[1], branch: 0 }], listerFor({})),
      ).rejects.toThrow(/same derivation path 0\/0/);
    });

    it("rejects one outpoint appearing under two addresses", async () => {
      // Physically impossible, so it means the listings disagree — and the
      // owning key would then depend on merge order.
      const listAddressUtxos = listerFor({
        [RECEIVE_ADDRESS]: [utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT)],
        [CHANGE_ADDRESS]: [utxo(RECEIVE_TXID, 0, 800_000, CHANGE_SCRIPT)],
      });

      await expect(collect(ADDRESSES, listAddressUtxos)).rejects.toThrow(
        /owning key is ambiguous/,
      );
    });

    it("rejects one outpoint appearing twice under the same address", async () => {
      const listAddressUtxos = listerFor({
        [RECEIVE_ADDRESS]: [
          utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT),
          utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT),
        ],
      });

      await expect(collect(ADDRESSES, listAddressUtxos)).rejects.toThrow(
        `Outpoint ${RECEIVE_TXID}:0 was listed twice under ${RECEIVE_ADDRESS}`,
      );
    });

    it("rejects the same outpoint under two addresses when only its txid case differs", async () => {
      // txids are hex, so the two spellings are one outpoint. Keying the
      // dedup off the verbatim string would return it twice, annotated with
      // two different owning keys.
      const listAddressUtxos = listerFor({
        [RECEIVE_ADDRESS]: [utxo(RECEIVE_TXID, 0, 800_000, RECEIVE_SCRIPT)],
        [CHANGE_ADDRESS]: [
          utxo(RECEIVE_TXID.toUpperCase(), 0, 800_000, CHANGE_SCRIPT),
        ],
      });

      await expect(collect(ADDRESSES, listAddressUtxos)).rejects.toThrow(
        /owning key is ambiguous/,
      );
    });
  });
});
