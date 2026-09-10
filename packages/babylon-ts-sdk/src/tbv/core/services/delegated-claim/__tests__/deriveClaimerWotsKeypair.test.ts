/**
 * Re-derivation of the WOTS keypair a delegated claim needs.
 *
 * The keypair is never stored, so the only thing standing between a wallet
 * that derives the wrong one and an Assert nobody can verify is the check
 * against the graph. That check must run before the keypair is handed back.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import { deriveClaimerWotsKeypair } from "../deriveClaimerWotsKeypair";

const wasm = vi.hoisted(() => ({
  wotsKeypairFromSeed: vi.fn(),
  validateWotsKeypairAgainstGraph: vi.fn(),
}));

vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));

const PK_HASH = `0x${"ab".repeat(32)}`;

const VAULT_CONTEXT = {
  depositorBtcPubkey: new Uint8Array(32).fill(0x11),
  fundingOutpoints: [{ txid: new Uint8Array(32).fill(0x22), vout: 0 }],
};

function makeWallet(): BitcoinWallet {
  return {
    deriveContextHash: vi.fn().mockResolvedValue("42".repeat(32)),
  } as unknown as BitcoinWallet;
}

async function derive() {
  return deriveClaimerWotsKeypair({
    btcWallet: makeWallet(),
    vaultContext: VAULT_CONTEXT,
    htlcVout: 0,
    txGraphJson: "{graph}",
    txGraphVersion: 3,
  });
}

describe("deriveClaimerWotsKeypair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wasm.wotsKeypairFromSeed.mockResolvedValue({
      keypair: { blocks: [["00"]] },
      public_keys: { blocks: [] },
      pk_hash: PK_HASH,
    });
    wasm.validateWotsKeypairAgainstGraph.mockResolvedValue(undefined);
  });

  it("returns the wots_keypair.json content and its committed pk hash", async () => {
    const result = await derive();

    expect(JSON.parse(result.wotsKeypairJson)).toEqual({ blocks: [["00"]] });
    expect(result.pkHash).toBe(PK_HASH);
  });

  it("checks the derived keypair against the graph's committed WOTS keys", async () => {
    await derive();

    expect(wasm.validateWotsKeypairAgainstGraph).toHaveBeenCalledWith(
      3,
      { blocks: [["00"]] },
      "{graph}",
    );
  });

  it("returns nothing when the keypair does not match the graph", async () => {
    wasm.validateWotsKeypairAgainstGraph.mockRejectedValue(
      new Error("WOTS keypair public keys do not match"),
    );

    await expect(derive()).rejects.toThrow(/do not match/);
  });
});
