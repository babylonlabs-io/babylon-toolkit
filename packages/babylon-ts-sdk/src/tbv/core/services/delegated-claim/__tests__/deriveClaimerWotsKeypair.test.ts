/**
 * Re-derivation of the WOTS keypair a delegated claim needs.
 *
 * The keypair is never stored, so the only thing standing between a wallet
 * that derives the wrong one and an Assert nobody can verify is the pair of
 * checks here: against the vault's on-chain commitment, and against the
 * graph. Both must run before the keypair is handed back, and the secrets
 * they run on must not outlive the call.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../../shared/wallets/interfaces";
import { deriveClaimerWotsKeypair } from "../deriveClaimerWotsKeypair";

const wasm = vi.hoisted(() => ({
  wotsKeypairFromSeed: vi.fn(),
  validateWotsKeypairAgainstGraph: vi.fn(),
}));

const secrets = vi.hoisted(() => ({
  expandWotsSeed: vi.fn(),
}));

vi.mock("../../../wasm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../wasm")>()),
  ...wasm,
}));

vi.mock("../../../vault-secrets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../vault-secrets")>()),
  ...secrets,
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

async function derive(expectedWotsPkHash = PK_HASH) {
  return deriveClaimerWotsKeypair({
    btcWallet: makeWallet(),
    vaultContext: VAULT_CONTEXT,
    htlcVout: 0,
    txGraphJson: "{graph}",
    txGraphVersion: 3,
    expectedWotsPkHash,
  });
}

/** The vault root handed to `expandWotsSeed`, as the call saw it. */
function capturedRoot(): Uint8Array {
  return secrets.expandWotsSeed.mock.calls[0][0] as Uint8Array;
}

/** The WOTS seed handed to `wotsKeypairFromSeed`, as the call saw it. */
function capturedSeed(): Uint8Array {
  return wasm.wotsKeypairFromSeed.mock.calls[0][0] as Uint8Array;
}

describe("deriveClaimerWotsKeypair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secrets.expandWotsSeed.mockImplementation(() =>
      Promise.resolve(new Uint8Array(64).fill(0x33)),
    );
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

  it("rejects when the keypair does not match the graph", async () => {
    wasm.validateWotsKeypairAgainstGraph.mockRejectedValue(
      new Error("WOTS keypair public keys do not match"),
    );

    await expect(derive()).rejects.toThrow(/do not match/);
  });

  it("rejects a derivation the vault did not commit to on chain", async () => {
    // The graph check alone would pass this: it compares against bytes the
    // vault provider served, not against the vault's own commitment.
    await expect(derive(`0x${"cd".repeat(32)}`)).rejects.toThrow(
      /does not match the vault's on-chain depositorWotsPkHash/,
    );
  });

  it("does not consult the graph when the on-chain hash already disagrees", async () => {
    await expect(derive(`0x${"cd".repeat(32)}`)).rejects.toThrow();

    expect(wasm.validateWotsKeypairAgainstGraph).not.toHaveBeenCalled();
  });

  it("matches an on-chain hash that differs only in prefix and case", async () => {
    await expect(derive("AB".repeat(32))).resolves.toBeDefined();
  });

  it("zeroes the vault root and the WOTS seed once it is done with them", async () => {
    await derive();

    expect(capturedRoot().every((byte) => byte === 0)).toBe(true);
    expect(capturedSeed().every((byte) => byte === 0)).toBe(true);
  });

  it("zeroes the vault root when the seed expansion throws", async () => {
    secrets.expandWotsSeed.mockRejectedValue(new Error("expander failed"));

    await expect(derive()).rejects.toThrow("expander failed");

    expect(capturedRoot().every((byte) => byte === 0)).toBe(true);
  });

  it("zeroes the WOTS seed when the keypair derivation throws", async () => {
    wasm.wotsKeypairFromSeed.mockRejectedValue(new Error("derivation failed"));

    await expect(derive()).rejects.toThrow("derivation failed");

    expect(capturedSeed().every((byte) => byte === 0)).toBe(true);
  });
});
