import { describe, expect, it, vi } from "vitest";

import type { BitcoinWallet } from "../../../../shared";
import {
  forwardDepositApproval,
  supportsDepositApproval,
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
});
