import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeFundedPrePeginFee } from "../fundedPrePeginFee";

const mempool = vi.hoisted(() => ({ getUtxoInfo: vi.fn() }));
vi.mock("../../clients/mempool", () => mempool);

const API = "https://mempool.example/api";

function tx(): string {
  const t = new Transaction();
  t.version = 2;
  t.addInput(Buffer.alloc(32, 0x11), 3);
  t.addInput(Buffer.alloc(32, 0x22), 0);
  t.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 70_000);
  t.addOutput(Buffer.from(`0014${"00".repeat(20)}`, "hex"), 20_000);
  return t.toHex();
}

describe("computeFundedPrePeginFee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sums every prevout by display-order txid and subtracts the outputs", async () => {
    mempool.getUtxoInfo.mockImplementation((txid: string, vout: number) =>
      Promise.resolve({
        txid,
        vout,
        value: txid.startsWith("11") ? 60_000 : 31_500,
        scriptPubKey: "5120",
      }),
    );

    await expect(computeFundedPrePeginFee(tx(), API)).resolves.toBe(1_500n);
    expect(mempool.getUtxoInfo).toHaveBeenCalledWith("11".repeat(32), 3, API);
    expect(mempool.getUtxoInfo).toHaveBeenCalledWith("22".repeat(32), 0, API);
  });

  it("refuses inputs that do not cover the outputs", async () => {
    mempool.getUtxoInfo.mockResolvedValue({ value: 10, scriptPubKey: "5120" });

    await expect(computeFundedPrePeginFee(tx(), API)).rejects.toThrow(
      /do not cover its outputs/,
    );
  });

  it("refuses a fee above the SDK's reasonable-fee bound", async () => {
    mempool.getUtxoInfo.mockResolvedValue({
      value: 10_000_000,
      scriptPubKey: "5120",
    });

    await expect(computeFundedPrePeginFee(tx(), API)).rejects.toThrow(
      /exceeds the maximum reasonable fee/,
    );
  });
});
