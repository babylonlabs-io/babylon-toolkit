/**
 * Tests for binding a resumed Pre-PegIn's resolved prevouts to the wallet's
 * funding addresses.
 */

import { describe, expect, it } from "vitest";

import type { FundingAddress } from "../../../deposit-terms";
import { bindPrevoutsToFundingAddresses } from "../bindPrevoutsToFundingAddresses";

// BIP-86 test vectors, mnemonic "abandon abandon … about", account 0 on
// mainnet: https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki#test-vectors
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

// Second receive address (m/86'/0'/0'/0/1): a script the wallet owns but does
// not enumerate, for the "built elsewhere" case.
const SECOND_RECEIVE_SCRIPT =
  "5120a82f29944d65b86ae6b5e5cc75e294ead6c59391a1edc5e016e3498c67fc7bbb";

const ADDRESSES: FundingAddress[] = [
  { address: RECEIVE_ADDRESS, internalPubkeyHex: RECEIVE_KEY },
  { address: CHANGE_ADDRESS, internalPubkeyHex: CHANGE_KEY },
];

const RECEIVE_OUTPOINT = `${"a".repeat(64)}:0`;
const CHANGE_OUTPOINT = `${"b".repeat(64)}:1`;

function bind(
  prevouts: Record<string, { scriptPubKey: string; value: number }>,
) {
  return bindPrevoutsToFundingAddresses({
    prevouts,
    addresses: ADDRESSES,
    network: "bitcoin",
  });
}

describe("bindPrevoutsToFundingAddresses", () => {
  it("annotates each input with the key of the address whose script it spends", () => {
    const bound = bind({
      [RECEIVE_OUTPOINT]: { scriptPubKey: RECEIVE_SCRIPT, value: 800_000 },
      [CHANGE_OUTPOINT]: { scriptPubKey: CHANGE_SCRIPT, value: 200_000 },
    });

    expect(bound).toEqual({
      [RECEIVE_OUTPOINT]: {
        scriptPubKey: RECEIVE_SCRIPT,
        value: 800_000,
        internalPubkeyHex: RECEIVE_KEY,
      },
      [CHANGE_OUTPOINT]: {
        scriptPubKey: CHANGE_SCRIPT,
        value: 200_000,
        internalPubkeyHex: CHANGE_KEY,
      },
    });
  });

  it("refuses an input whose script belongs to none of the wallet's addresses", () => {
    // The wallet's own second receive address, which it does not enumerate:
    // the transaction was built for another device, account or address set.
    expect(() =>
      bind({
        [RECEIVE_OUTPOINT]: { scriptPubKey: RECEIVE_SCRIPT, value: 800_000 },
        [CHANGE_OUTPOINT]: {
          scriptPubKey: SECOND_RECEIVE_SCRIPT,
          value: 200_000,
        },
      }),
    ).toThrow(
      `Input ${CHANGE_OUTPOINT} spends a script (${SECOND_RECEIVE_SCRIPT}) that belongs to none`,
    );
  });

  it("refuses a transaction that resolved no inputs", () => {
    expect(() => bind({})).toThrow(/resolved no inputs/);
  });

  it("matches a script case-insensitively and emits it lowercase", () => {
    const bound = bind({
      [CHANGE_OUTPOINT]: {
        scriptPubKey: CHANGE_SCRIPT.toUpperCase(),
        value: 200_000,
      },
    });

    expect(bound[CHANGE_OUTPOINT].scriptPubKey).toBe(CHANGE_SCRIPT);
  });

  it("emits the owning key lowercase, which is the only form the signer accepts", () => {
    const bound = bindPrevoutsToFundingAddresses({
      prevouts: {
        [CHANGE_OUTPOINT]: { scriptPubKey: CHANGE_SCRIPT, value: 200_000 },
      },
      addresses: [
        ADDRESSES[0],
        { ...ADDRESSES[1], internalPubkeyHex: CHANGE_KEY.toUpperCase() },
      ],
      network: "bitcoin",
    });

    expect(bound[CHANGE_OUTPOINT].internalPubkeyHex).toBe(CHANGE_KEY);
  });

  it("validates the address set before looking at any input", () => {
    // The receive address paired with the change key: the same set validation
    // the UTXO collector applies, so a wrong pairing never reaches binding.
    expect(() =>
      bindPrevoutsToFundingAddresses({
        prevouts: {
          [RECEIVE_OUTPOINT]: { scriptPubKey: RECEIVE_SCRIPT, value: 800_000 },
        },
        addresses: [{ ...ADDRESSES[0], internalPubkeyHex: CHANGE_KEY }],
        network: "bitcoin",
      }),
    ).toThrow(/is not the address its own key derives on bitcoin/);
  });
});
