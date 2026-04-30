import { describe, expect, it, vi } from "vitest";

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "../../../../../shared/wallets";
import { signPsbtsWithFallback } from "../signPsbtsWithFallback";

function makeWallet(
  overrides: Partial<BitcoinWallet> = {},
): BitcoinWallet {
  // Construct a minimal stub satisfying the structural shape used by
  // signPsbtsWithFallback. Other BitcoinWallet methods are not invoked
  // and are therefore left as throwing placeholders.
  const stub: Partial<BitcoinWallet> = {
    signPsbt: vi.fn(),
    ...overrides,
  };
  return stub as BitcoinWallet;
}

describe("signPsbtsWithFallback", () => {
  it("uses native batch signing when wallet.signPsbts is a function", async () => {
    const signPsbts = vi
      .fn<NonNullable<BitcoinWallet["signPsbts"]>>()
      .mockResolvedValue(["signed-a", "signed-b"]);
    const signPsbt = vi.fn<BitcoinWallet["signPsbt"]>();
    const wallet = makeWallet({ signPsbts, signPsbt });
    const psbts = ["a", "b"];
    const opts: SignPsbtOptions[] = [
      { autoFinalized: false },
      { autoFinalized: false },
    ];

    const out = await signPsbtsWithFallback(wallet, psbts, opts);

    expect(out).toEqual(["signed-a", "signed-b"]);
    expect(signPsbts).toHaveBeenCalledTimes(1);
    expect(signPsbts).toHaveBeenCalledWith(psbts, opts);
    expect(signPsbt).not.toHaveBeenCalled();
  });

  it("throws if native batch returns a different number of signed PSBTs", async () => {
    // Pin the arity invariant: the batch path must not silently drop or
    // pad PSBTs. The error message must surface both counts so callers
    // can debug a non-conformant wallet adapter.
    const signPsbts = vi
      .fn<NonNullable<BitcoinWallet["signPsbts"]>>()
      .mockResolvedValue(["only-one"]);
    const wallet = makeWallet({ signPsbts });

    await expect(
      signPsbtsWithFallback(wallet, ["a", "b"], [
        { autoFinalized: false },
        { autoFinalized: false },
      ]),
    ).rejects.toThrow(/Expected 2 signed PSBTs but received 1/);
  });

  it("falls back to sequential signPsbt when wallet.signPsbts is missing", async () => {
    // Older adapters expose only signPsbt. The fallback must visit each
    // PSBT in order with its corresponding options entry.
    const signPsbt = vi
      .fn<BitcoinWallet["signPsbt"]>()
      .mockImplementation(async (psbtHex) => `signed-${psbtHex}`);
    const wallet = makeWallet({ signPsbts: undefined, signPsbt });

    const opts: SignPsbtOptions[] = [
      { autoFinalized: false },
      { autoFinalized: true },
    ];
    const out = await signPsbtsWithFallback(wallet, ["a", "b"], opts);

    expect(out).toEqual(["signed-a", "signed-b"]);
    expect(signPsbt).toHaveBeenCalledTimes(2);
    expect(signPsbt).toHaveBeenNthCalledWith(1, "a", opts[0]);
    expect(signPsbt).toHaveBeenNthCalledWith(2, "b", opts[1]);
  });

  it("returns an empty array for empty input regardless of which path is used", async () => {
    const signPsbts = vi
      .fn<NonNullable<BitcoinWallet["signPsbts"]>>()
      .mockResolvedValue([]);
    const batchWallet = makeWallet({ signPsbts });
    expect(
      await signPsbtsWithFallback(batchWallet, [], []),
    ).toEqual([]);

    const signPsbt = vi.fn<BitcoinWallet["signPsbt"]>();
    const fallbackWallet = makeWallet({ signPsbts: undefined, signPsbt });
    expect(
      await signPsbtsWithFallback(fallbackWallet, [], []),
    ).toEqual([]);
    expect(signPsbt).not.toHaveBeenCalled();
  });
});
