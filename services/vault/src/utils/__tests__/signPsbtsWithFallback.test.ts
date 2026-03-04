import { describe, expect, it, vi } from "vitest";

import { signPsbtsWithFallback } from "../btc";

function createMockWallet({ supportsBatch }: { supportsBatch: boolean }) {
  const wallet: any = {
    signPsbt: vi
      .fn()
      .mockImplementation((hex: string) => Promise.resolve(`signed_${hex}`)),
    getPublicKeyHex: vi.fn(),
    getAddress: vi.fn(),
    signMessage: vi.fn(),
    getNetwork: vi.fn(),
  };

  if (supportsBatch) {
    wallet.signPsbts = vi
      .fn()
      .mockImplementation((hexes: string[]) =>
        Promise.resolve(hexes.map((h) => `signed_${h}`)),
      );
  }

  return wallet;
}

describe("signPsbtsWithFallback", () => {
  it("should use batch signing when wallet supports signPsbts", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const psbts = ["psbt_a", "psbt_b", "psbt_c"];

    const result = await signPsbtsWithFallback(wallet, psbts);

    expect(wallet.signPsbts).toHaveBeenCalledWith(psbts, undefined);
    expect(wallet.signPsbt).not.toHaveBeenCalled();
    expect(result).toEqual(["signed_psbt_a", "signed_psbt_b", "signed_psbt_c"]);
  });

  it("should pass sign options to batch signing", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    const psbts = ["psbt_a", "psbt_b"];
    const options = [
      {
        autoFinalized: false,
        signInputs: [{ index: 0, disableTweakSigner: true }],
      },
      {
        autoFinalized: false,
        signInputs: [{ index: 0, disableTweakSigner: true }],
      },
    ];

    await signPsbtsWithFallback(wallet, psbts, options);

    expect(wallet.signPsbts).toHaveBeenCalledWith(psbts, options);
  });

  it("should fall back to sequential signing when signPsbts is not available (mobile)", async () => {
    const wallet = createMockWallet({ supportsBatch: false });
    const psbts = ["psbt_a", "psbt_b"];

    const result = await signPsbtsWithFallback(wallet, psbts);

    expect(wallet.signPsbt).toHaveBeenCalledTimes(2);
    expect(wallet.signPsbt).toHaveBeenCalledWith("psbt_a", undefined);
    expect(wallet.signPsbt).toHaveBeenCalledWith("psbt_b", undefined);
    expect(result).toEqual(["signed_psbt_a", "signed_psbt_b"]);
  });

  it("should pass per-PSBT sign options in sequential fallback", async () => {
    const wallet = createMockWallet({ supportsBatch: false });
    const psbts = ["psbt_a", "psbt_b"];
    const options = [{ autoFinalized: false }, { autoFinalized: true }];

    await signPsbtsWithFallback(wallet, psbts, options);

    expect(wallet.signPsbt).toHaveBeenCalledWith("psbt_a", {
      autoFinalized: false,
    });
    expect(wallet.signPsbt).toHaveBeenCalledWith("psbt_b", {
      autoFinalized: true,
    });
  });

  it("should handle empty array", async () => {
    const wallet = createMockWallet({ supportsBatch: true });

    const result = await signPsbtsWithFallback(wallet, []);

    expect(wallet.signPsbts).toHaveBeenCalledWith([], undefined);
    expect(result).toEqual([]);
  });

  it("should handle single PSBT", async () => {
    const wallet = createMockWallet({ supportsBatch: false });

    const result = await signPsbtsWithFallback(wallet, ["only_one"]);

    expect(wallet.signPsbt).toHaveBeenCalledTimes(1);
    expect(result).toEqual(["signed_only_one"]);
  });

  it("should propagate batch signing errors", async () => {
    const wallet = createMockWallet({ supportsBatch: true });
    wallet.signPsbts.mockRejectedValue(new Error("User rejected"));

    await expect(signPsbtsWithFallback(wallet, ["psbt_a"])).rejects.toThrow(
      "User rejected",
    );
  });

  it("should propagate sequential signing errors", async () => {
    const wallet = createMockWallet({ supportsBatch: false });
    wallet.signPsbt
      .mockResolvedValueOnce("signed_a")
      .mockRejectedValueOnce(new Error("User cancelled"));

    await expect(
      signPsbtsWithFallback(wallet, ["psbt_a", "psbt_b"]),
    ).rejects.toThrow("User cancelled");
  });
});
