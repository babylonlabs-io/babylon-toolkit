import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFromHex } = vi.hoisted(() => ({ mockFromHex: vi.fn() }));
vi.mock("bitcoinjs-lib", () => ({
  Transaction: { fromHex: mockFromHex },
}));
vi.mock("../vaultUtxoDerivationService", () => ({
  fetchUTXOFromMempool: vi.fn(),
}));

import { resolveFundedTxFeeAndUtxos } from "../resolveFundedTxFee";
import { fetchUTXOFromMempool } from "../vaultUtxoDerivationService";

// Bitcoin stores the prev-txid in reverse (internal) byte order; the display txid
// is the reverse of what sits in `input.hash`. Non-palindromic txids so a missing
// reverse in production would produce the wrong key and fail the assertions.
const TXID_A = "a1".repeat(31) + "b2";
const TXID_B = "c3".repeat(31) + "d4";

function internalHash(displayTxid: string): Buffer {
  return Buffer.from(Buffer.from(displayTxid, "hex").reverse());
}

/** A mock parsed tx with the exact `ins`/`outs` shape resolveFundedTxFee reads. */
function mockTx(
  ins: { txid: string; vout: number }[],
  outValues: number[],
): void {
  mockFromHex.mockReturnValue({
    ins: ins.map((i) => ({ hash: internalHash(i.txid), index: i.vout })),
    outs: outValues.map((value) => ({ value })),
  });
}

describe("resolveFundedTxFeeAndUtxos", () => {
  beforeEach(() => {
    mockFromHex.mockReset();
    vi.mocked(fetchUTXOFromMempool).mockReset();
  });

  it("computes fee = Σin − Σout, reuses same-device prevouts, mempool-resolves the rest", async () => {
    mockTx(
      [
        { txid: TXID_A, vout: 0 },
        { txid: TXID_B, vout: 1 },
      ],
      [1000, 500],
    );
    const sameDevice = {
      [`${TXID_A}:0`]: { scriptPubKey: "0014aa", value: 1200 },
    };
    vi.mocked(fetchUTXOFromMempool).mockResolvedValue({
      scriptPubKey: "0014bb",
      value: 800,
    });

    const { expectedUtxos, fundedTxFee } = await resolveFundedTxFeeAndUtxos(
      "deadbeef",
      sameDevice,
    );

    // (1200 + 800) − (1000 + 500)
    expect(fundedTxFee).toBe(500n);
    // Only the input NOT in sameDevice hit the mempool.
    expect(fetchUTXOFromMempool).toHaveBeenCalledTimes(1);
    expect(fetchUTXOFromMempool).toHaveBeenCalledWith(TXID_B, 1);
    // Complete record so the broadcast never re-resolves.
    expect(Object.keys(expectedUtxos).sort()).toEqual([
      `${TXID_A}:0`,
      `${TXID_B}:1`,
    ]);
  });

  it("keys prevouts by display-order txid (the format broadcastPrePeginTransaction looks up)", async () => {
    mockTx([{ txid: TXID_A, vout: 3 }], [999]);
    vi.mocked(fetchUTXOFromMempool).mockResolvedValue({
      scriptPubKey: "0014aa",
      value: 5000,
    });

    const { expectedUtxos } = await resolveFundedTxFeeAndUtxos(
      "deadbeef",
      undefined,
    );

    // Same key resolveInputUtxo builds: `${reverse(input.hash).toString("hex")}:${vout}`.
    expect(expectedUtxos[`${TXID_A}:3`]).toEqual({
      scriptPubKey: "0014aa",
      value: 5000,
    });
  });

  it("throws when the fee is not positive", async () => {
    mockTx([{ txid: TXID_A, vout: 0 }], [1000]);
    const sameDevice = {
      [`${TXID_A}:0`]: { scriptPubKey: "0014aa", value: 1000 },
    };

    await expect(
      resolveFundedTxFeeAndUtxos("deadbeef", sameDevice),
    ).rejects.toThrow(/fee.*is 0|expected > 0/);
  });
});
