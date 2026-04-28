/**
 * Tests for `deriveVaultRoot` — the SDK helper that wires a wallet's
 * `deriveContextHash` API to the canonical `vaultContext` encoding.
 *
 * The helper is a thin pass-through; tests pin the wiring contract:
 *  - Forwards the hardcoded `appName` "babylon-vault" verbatim.
 *  - Forwards the hex of the 72-byte `vaultContext` (lowercase, 144 chars).
 *  - Decodes the wallet's 64-char hex output to 32 bytes.
 *  - Rejects malformed wallet output (wrong length / non-hex / uppercase).
 *  - Propagates wallet errors unchanged (user rejection, not-supported, etc.).
 */

import { describe, expect, it, vi } from "vitest";

import { uint8ArrayToHex } from "../../primitives/utils/bitcoin";
import { buildVaultContext, type FundingOutpoint } from "../context";
import {
  deriveVaultRoot,
  VAULT_APP_NAME,
  type DeriveContextHashCapableWallet,
} from "../deriveVaultRoot";

const txid = (byte: number) => new Uint8Array(32).fill(byte);

const SAMPLE_INPUT = {
  depositorBtcPubkey: new Uint8Array(32).fill(0x02),
  fundingOutpoints: [
    { txid: txid(0xaa), vout: 0 } satisfies FundingOutpoint,
    { txid: txid(0xbb), vout: 1 } satisfies FundingOutpoint,
  ],
};

const VALID_ROOT_HEX = "a".repeat(64);

function makeMockWallet(
  override: (appName: string, context: string) => Promise<string>,
): DeriveContextHashCapableWallet {
  return { deriveContextHash: vi.fn(override) };
}

describe("deriveVaultRoot — happy path wiring", () => {
  it("forwards the canonical appName 'babylon-vault'", async () => {
    const spy = vi.fn(async () => VALID_ROOT_HEX);
    await deriveVaultRoot({ deriveContextHash: spy }, SAMPLE_INPUT);
    expect(spy).toHaveBeenCalledWith(VAULT_APP_NAME, expect.any(String));
    expect(VAULT_APP_NAME).toBe("babylon-vault");
  });

  it("forwards hex of buildVaultContext output as the context arg", async () => {
    const expectedContextHex = uint8ArrayToHex(buildVaultContext(SAMPLE_INPUT));
    const spy = vi.fn(async () => VALID_ROOT_HEX);
    await deriveVaultRoot({ deriveContextHash: spy }, SAMPLE_INPUT);
    expect(spy).toHaveBeenCalledWith(VAULT_APP_NAME, expectedContextHex);
  });

  it("context is exactly 144 lowercase hex chars (72 bytes)", async () => {
    let captured = "";
    await deriveVaultRoot(
      makeMockWallet(async (_app, ctx) => {
        captured = ctx;
        return VALID_ROOT_HEX;
      }),
      SAMPLE_INPUT,
    );
    expect(captured).toHaveLength(144);
    expect(captured).toMatch(/^[0-9a-f]+$/);
  });

  it("decodes a valid 64-char hex output to 32 bytes", async () => {
    const sentinel = "0123456789abcdef".repeat(4);
    expect(sentinel).toHaveLength(64);
    const root = await deriveVaultRoot(
      makeMockWallet(async () => sentinel),
      SAMPLE_INPUT,
    );
    expect(root).toBeInstanceOf(Uint8Array);
    expect(root).toHaveLength(32);
    expect(uint8ArrayToHex(root)).toBe(sentinel);
  });

  it("is deterministic for the same input + wallet", async () => {
    const wallet = makeMockWallet(async (app, ctx) => {
      // Mock that mixes inputs into a stable output, so identical
      // inputs produce identical outputs.
      const seed = `${app}|${ctx}`;
      let acc = 0;
      for (let i = 0; i < seed.length; i++) acc = (acc * 31 + seed.charCodeAt(i)) >>> 0;
      const single = acc.toString(16).padStart(8, "0");
      return single.repeat(8);
    });
    const root1 = await deriveVaultRoot(wallet, SAMPLE_INPUT);
    const root2 = await deriveVaultRoot(wallet, SAMPLE_INPUT);
    expect(uint8ArrayToHex(root1)).toBe(uint8ArrayToHex(root2));
  });
});

describe("deriveVaultRoot — wallet output validation", () => {
  it("throws when wallet returns a non-string", async () => {
    const wallet = {
      deriveContextHash: async () => 0xdead as unknown as string,
    };
    await expect(deriveVaultRoot(wallet, SAMPLE_INPUT)).rejects.toThrow(
      /must return a string/,
    );
  });

  it("throws when wallet returns a too-short hex string", async () => {
    await expect(
      deriveVaultRoot(makeMockWallet(async () => "ab".repeat(31)), SAMPLE_INPUT),
    ).rejects.toThrow(/64-character hex/);
  });

  it("throws when wallet returns a too-long hex string", async () => {
    await expect(
      deriveVaultRoot(makeMockWallet(async () => "ab".repeat(33)), SAMPLE_INPUT),
    ).rejects.toThrow(/64-character hex/);
  });

  it("throws when wallet returns uppercase hex (spec mandates lowercase)", async () => {
    await expect(
      deriveVaultRoot(makeMockWallet(async () => "A".repeat(64)), SAMPLE_INPUT),
    ).rejects.toThrow(/lowercase hex/);
  });

  it("throws when wallet returns mixed-case hex", async () => {
    const mixed = "aB".repeat(32);
    await expect(
      deriveVaultRoot(makeMockWallet(async () => mixed), SAMPLE_INPUT),
    ).rejects.toThrow(/lowercase hex/);
  });

  it("throws when wallet returns non-hex characters", async () => {
    await expect(
      deriveVaultRoot(makeMockWallet(async () => "z".repeat(64)), SAMPLE_INPUT),
    ).rejects.toThrow(/lowercase hex/);
  });

  it("throws when wallet returns hex with 0x prefix", async () => {
    // 0x + 62 hex chars = 64 chars total but starts with non-hex 'x'
    await expect(
      deriveVaultRoot(
        makeMockWallet(async () => "0x" + "a".repeat(62)),
        SAMPLE_INPUT,
      ),
    ).rejects.toThrow(/lowercase hex/);
  });

  it("throws when wallet returns empty string", async () => {
    await expect(
      deriveVaultRoot(makeMockWallet(async () => ""), SAMPLE_INPUT),
    ).rejects.toThrow(/64-character hex/);
  });
});

describe("deriveVaultRoot — error propagation", () => {
  it("propagates wallet errors unchanged (user rejection)", async () => {
    const rejectionError = new Error("User rejected the request");
    await expect(
      deriveVaultRoot(
        makeMockWallet(async () => {
          throw rejectionError;
        }),
        SAMPLE_INPUT,
      ),
    ).rejects.toBe(rejectionError);
  });

  it("propagates wallet errors unchanged (not-supported)", async () => {
    class WalletNotSupportedError extends Error {
      readonly code = "WALLET_METHOD_NOT_SUPPORTED";
    }
    const notSupported = new WalletNotSupportedError("not implemented");
    await expect(
      deriveVaultRoot(
        makeMockWallet(async () => {
          throw notSupported;
        }),
        SAMPLE_INPUT,
      ),
    ).rejects.toBe(notSupported);
  });

  it("propagates input-side errors from buildVaultContext", async () => {
    const wallet = makeMockWallet(async () => VALID_ROOT_HEX);
    // Bad input: empty fundingOutpoints array — buildVaultContext
    // throws synchronously before the wallet is consulted.
    const badInput = {
      depositorBtcPubkey: SAMPLE_INPUT.depositorBtcPubkey,
      fundingOutpoints: [],
    };
    await expect(deriveVaultRoot(wallet, badInput)).rejects.toThrow(
      /outpoints must be non-empty/,
    );
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
  });

  it("propagates input-side errors for wrong-size depositor pubkey", async () => {
    const wallet = makeMockWallet(async () => VALID_ROOT_HEX);
    const badInput = {
      depositorBtcPubkey: new Uint8Array(31).fill(0x02), // 31 bytes, not 32
      fundingOutpoints: SAMPLE_INPUT.fundingOutpoints,
    };
    await expect(deriveVaultRoot(wallet, badInput)).rejects.toThrow(
      /depositorBtcPubkey/,
    );
    expect(wallet.deriveContextHash).not.toHaveBeenCalled();
  });
});

describe("deriveVaultRoot — input sensitivity", () => {
  it("changes the derived root when depositorBtcPubkey changes", async () => {
    // Same wallet implementation; different inputs must reach the
    // wallet with different context bytes (so the wallet would
    // produce a different output, given a deterministic
    // implementation).
    const inputs: string[] = [];
    const wallet = makeMockWallet(async (_app, ctx) => {
      inputs.push(ctx);
      return VALID_ROOT_HEX;
    });
    await deriveVaultRoot(wallet, {
      depositorBtcPubkey: new Uint8Array(32).fill(0x02),
      fundingOutpoints: SAMPLE_INPUT.fundingOutpoints,
    });
    await deriveVaultRoot(wallet, {
      depositorBtcPubkey: new Uint8Array(32).fill(0x03),
      fundingOutpoints: SAMPLE_INPUT.fundingOutpoints,
    });
    expect(inputs[0]).not.toBe(inputs[1]);
  });

  it("changes the derived context when fundingOutpoints change", async () => {
    const inputs: string[] = [];
    const wallet = makeMockWallet(async (_app, ctx) => {
      inputs.push(ctx);
      return VALID_ROOT_HEX;
    });
    await deriveVaultRoot(wallet, {
      depositorBtcPubkey: SAMPLE_INPUT.depositorBtcPubkey,
      fundingOutpoints: [{ txid: txid(0xaa), vout: 0 }],
    });
    await deriveVaultRoot(wallet, {
      depositorBtcPubkey: SAMPLE_INPUT.depositorBtcPubkey,
      fundingOutpoints: [{ txid: txid(0xaa), vout: 1 }], // different vout
    });
    expect(inputs[0]).not.toBe(inputs[1]);
  });
});
