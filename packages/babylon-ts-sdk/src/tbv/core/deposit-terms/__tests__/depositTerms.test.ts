import { describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../shared";
import {
  forwardDepositApproval,
  requireChangeAddress,
  supportsDepositApproval,
  supportsMultiAddressFunding,
} from "../depositTerms";

const base = {} as BitcoinWallet;

describe("forwardDepositApproval", () => {
  it("forwards approveDepositTerms AND getChangeAddress for approval wallets", async () => {
    const wallet = Object.assign(Object.create({}), base, {
      approveDepositTerms: vi.fn(async () => {}),
      getChangeAddress: vi.fn(async () => "tb1pchange"),
    });
    const fwd = forwardDepositApproval(wallet);
    await fwd.approveDepositTerms!({} as never);
    await expect(fwd.getChangeAddress!()).resolves.toBe("tb1pchange");
    expect(wallet.approveDepositTerms).toHaveBeenCalledOnce();
    expect(wallet.getChangeAddress).toHaveBeenCalledOnce();
  });

  it("forwards nothing for software wallets and keeps the probe on approveDepositTerms", () => {
    expect(forwardDepositApproval(base)).toEqual({});
    expect(supportsDepositApproval(base)).toBe(false);
  });

  it("still recognizes an approver that cannot report a change address", () => {
    // The presign/payout ceremonies approve terms without ever creating
    // change, so getChangeAddress is not part of being an approval wallet.
    const approverOnly = Object.assign(Object.create({}), base, {
      approveDepositTerms: vi.fn(async () => {}),
    });

    expect(supportsDepositApproval(approverOnly)).toBe(true);
  });

  it("fails with an actionable error when the Pre-PegIn build needs a change address the wallet lacks", async () => {
    // Calling getChangeAddress off the narrowed value would instead die on
    // `is not a function` in the middle of preparePegin.
    const approverOnly = Object.assign(Object.create({}), base, {
      approveDepositTerms: vi.fn(async () => {}),
    });

    await expect(requireChangeAddress(approverOnly)).rejects.toThrow(
      /getChangeAddress/,
    );
  });

  it("returns the wallet's change address when it has one", async () => {
    const approver = Object.assign(Object.create({}), base, {
      approveDepositTerms: vi.fn(async () => {}),
      getChangeAddress: vi.fn(async () => "tb1pchange"),
    });

    await expect(requireChangeAddress(approver)).resolves.toBe("tb1pchange");
  });

  it("forwards holdsApprovedDepositTerms only when the wallet implements it", async () => {
    const withoutProbe = Object.assign(Object.create({}), base, {
      approveDepositTerms: vi.fn(async () => {}),
      getChangeAddress: vi.fn(async () => "tb1pchange"),
    });
    expect(
      forwardDepositApproval(withoutProbe).holdsApprovedDepositTerms,
    ).toBeUndefined();

    const withProbe = Object.assign(Object.create({}), withoutProbe, {
      holdsApprovedDepositTerms: vi.fn(async () => true),
    });
    const fwd = forwardDepositApproval(withProbe);
    await expect(fwd.holdsApprovedDepositTerms!({} as never)).resolves.toBe(
      true,
    );
    expect(withProbe.holdsApprovedDepositTerms).toHaveBeenCalledOnce();
  });

  it("forwards validateDepositTerms only when the wallet implements it", async () => {
    const withoutValidate = Object.assign(Object.create({}), base, {
      approveDepositTerms: vi.fn(async () => {}),
    });
    expect(
      forwardDepositApproval(withoutValidate).validateDepositTerms,
    ).toBeUndefined();

    const withValidate = Object.assign(Object.create({}), withoutValidate, {
      validateDepositTerms: vi.fn(async () => {}),
    });
    const fwd = forwardDepositApproval(withValidate);
    await fwd.validateDepositTerms!({} as never);
    expect(withValidate.validateDepositTerms).toHaveBeenCalledOnce();
  });
});

describe("supportsMultiAddressFunding", () => {
  it("is false for a wallet that cannot enumerate its addresses", () => {
    // Software wallets expose no account xpub, so their addresses cannot be
    // enumerated — and their change returns to the connected address anyway.
    expect(supportsMultiAddressFunding(base)).toBe(false);
  });

  it("is true for a wallet that reports its funding addresses", () => {
    const policyWallet = Object.assign(Object.create({}), base, {
      getFundingAddresses: vi.fn(async () => []),
    });

    expect(supportsMultiAddressFunding(policyWallet)).toBe(true);
  });

  it("does not require the wallet to also be an approver", () => {
    // The two capabilities are probed independently: nothing about signing
    // terms implies the wallet can list its addresses, or the reverse.
    const approverOnly = Object.assign(Object.create({}), base, {
      approveDepositTerms: vi.fn(async () => {}),
    });

    expect(supportsDepositApproval(approverOnly)).toBe(true);
    expect(supportsMultiAddressFunding(approverOnly)).toBe(false);
  });
});
