/**
 * Tests for the funding-prevout binding checks.
 */

import { payments } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import {
  assertKeyOwnsScript,
  assertPrevoutMatchesChain,
  isMultiAddressFunding,
  requireFundingPrevout,
  type FundingPrevout,
} from "../prevoutBinding";

// BIP-340 test keys: the generator point's x coordinate and 2G's.
const RECEIVE_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const CHANGE_KEY =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

function p2trScript(internalPubkeyHex: string): string {
  const { output } = payments.p2tr({
    internalPubkey: Buffer.from(internalPubkeyHex, "hex"),
  });
  if (!output) throw new Error("test fixture: p2tr produced no output");
  return output.toString("hex");
}

const RECEIVE_SCRIPT = p2trScript(RECEIVE_KEY);
const CHANGE_SCRIPT = p2trScript(CHANGE_KEY);

const TXID =
  "0000000000000000000000000000000000000000000000000000000000000001";

describe("isMultiAddressFunding", () => {
  it("is false when no prevouts were declared", () => {
    expect(isMultiAddressFunding(undefined)).toBe(false);
  });

  it("is false when no prevout declares an owning key", () => {
    const prevouts: Record<string, FundingPrevout> = {
      [`${TXID}:0`]: { scriptPubKey: RECEIVE_SCRIPT, value: 800_000 },
      [`${TXID}:1`]: { scriptPubKey: RECEIVE_SCRIPT, value: 500_000 },
    };
    expect(isMultiAddressFunding(prevouts)).toBe(false);
  });

  it("is true when any prevout declares an owning key", () => {
    const prevouts: Record<string, FundingPrevout> = {
      [`${TXID}:0`]: { scriptPubKey: RECEIVE_SCRIPT, value: 800_000 },
      [`${TXID}:1`]: {
        scriptPubKey: CHANGE_SCRIPT,
        value: 500_000,
        internalPubkeyHex: CHANGE_KEY,
      },
    };
    expect(isMultiAddressFunding(prevouts)).toBe(true);
  });
});

describe("requireFundingPrevout", () => {
  it("returns the prevout declared for the outpoint", () => {
    const prevouts: Record<string, FundingPrevout> = {
      [`${TXID}:1`]: {
        scriptPubKey: CHANGE_SCRIPT,
        value: 500_000,
        internalPubkeyHex: CHANGE_KEY,
      },
    };

    const prevout = requireFundingPrevout(prevouts, TXID, 1);

    expect(prevout.internalPubkeyHex).toBe(CHANGE_KEY);
    expect(prevout.scriptPubKey).toBe(CHANGE_SCRIPT);
    expect(prevout.value).toBe(500_000);
  });

  it("throws when the outpoint has no declared prevout", () => {
    const prevouts: Record<string, FundingPrevout> = {
      [`${TXID}:0`]: {
        scriptPubKey: RECEIVE_SCRIPT,
        value: 800_000,
        internalPubkeyHex: RECEIVE_KEY,
      },
    };

    expect(() => requireFundingPrevout(prevouts, TXID, 7)).toThrow(
      `No funding prevout declared for ${TXID}:7`,
    );
  });

  it("throws rather than fall back to the depositor key when a prevout declares none", () => {
    const prevouts: Record<string, FundingPrevout> = {
      [`${TXID}:0`]: { scriptPubKey: RECEIVE_SCRIPT, value: 800_000 },
    };

    expect(() => requireFundingPrevout(prevouts, TXID, 0)).toThrow(
      /carries no internalPubkeyHex/,
    );
  });
});

describe("assertKeyOwnsScript", () => {
  it("accepts a key that derives the declared script", () => {
    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, CHANGE_KEY, CHANGE_SCRIPT),
    ).not.toThrow();
  });

  it("accepts an uppercase declared script", () => {
    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, CHANGE_KEY, CHANGE_SCRIPT.toUpperCase()),
    ).not.toThrow();
  });

  it("rejects the receive key paired with the change address's script", () => {
    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, RECEIVE_KEY, CHANGE_SCRIPT),
    ).toThrow(/key does not own its script/);
  });

  it("rejects a key that is not 64 hex characters", () => {
    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, CHANGE_KEY.slice(0, 62), CHANGE_SCRIPT),
    ).toThrow(/invalid internalPubkeyHex/);
  });

  it("rejects a 0x-prefixed key rather than silently stripping it", () => {
    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, `0x${CHANGE_KEY}`, CHANGE_SCRIPT),
    ).toThrow(/invalid internalPubkeyHex/);
  });

  it("rejects a 64-character key that is not hex", () => {
    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, "z".repeat(64), CHANGE_SCRIPT),
    ).toThrow(/invalid internalPubkeyHex/);
  });

  it("refuses a P2WPKH prevout instead of reporting a key/script mismatch", () => {
    // Native SegWit funding is a supported shape on this path, but an x-only
    // internal key says nothing about who owns a P2WPKH script.
    expect(() =>
      assertKeyOwnsScript(
        `${TXID}:1`,
        CHANGE_KEY,
        "0014751e76e8199196d454941c45d1b3a323f1433bd6",
      ),
    ).toThrow(/its script is P2WPKH, not P2TR/);
  });

  it("names the outpoint when the key is 64 hex characters but off the curve", () => {
    // Field-size minus one: well-formed hex, not an x coordinate of any point.
    const offCurve = "f".repeat(64);

    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, offCurve, CHANGE_SCRIPT),
    ).toThrow(
      `Funding prevout ${TXID}:1 has an internalPubkeyHex that is not a valid ` +
        `x-only public key on the secp256k1 curve.`,
    );
  });

  it("refuses an untweaked raw-key script, which no P2TR output can be", () => {
    // `5120<internalPubkey>` is the shape a naive derivation produces: the
    // right length and prefix, but the internal key instead of the output key.
    expect(() =>
      assertKeyOwnsScript(`${TXID}:1`, CHANGE_KEY, `5120${CHANGE_KEY}`),
    ).toThrow(/key does not own its script/);
  });
});

describe("assertPrevoutMatchesChain", () => {
  it("accepts a declaration equal to the chain's prevout", () => {
    expect(() =>
      assertPrevoutMatchesChain(
        `${TXID}:1`,
        {
          scriptPubKey: CHANGE_SCRIPT,
          value: 500_000,
          internalPubkeyHex: CHANGE_KEY,
        },
        { scriptPubKey: CHANGE_SCRIPT, value: 500_000 },
      ),
    ).not.toThrow();
  });

  it("rejects an outpoint labelled with another address's script", () => {
    expect(() =>
      assertPrevoutMatchesChain(
        `${TXID}:1`,
        {
          scriptPubKey: RECEIVE_SCRIPT,
          value: 500_000,
          internalPubkeyHex: RECEIVE_KEY,
        },
        { scriptPubKey: CHANGE_SCRIPT, value: 500_000 },
      ),
    ).toThrow(/script does not match the chain/);
  });

  it("rejects a declared value the chain disagrees with", () => {
    expect(() =>
      assertPrevoutMatchesChain(
        `${TXID}:1`,
        {
          scriptPubKey: CHANGE_SCRIPT,
          value: 500_000,
          internalPubkeyHex: CHANGE_KEY,
        },
        { scriptPubKey: CHANGE_SCRIPT, value: 499_000 },
      ),
    ).toThrow(/value does not match the chain/);
  });
});
