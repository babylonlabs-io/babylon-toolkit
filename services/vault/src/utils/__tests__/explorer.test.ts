import { describe, expect, it } from "vitest";

import { getNetworkConfigETH } from "@/config/network";

import { getEthExplorerAddressUrl } from "../explorer";

describe("getEthExplorerAddressUrl", () => {
  it("builds an explorer address-page URL for the given address", () => {
    const address = "0x1234567890abcdef1234567890abcdef12345678";
    const { explorerUrl } = getNetworkConfigETH();

    expect(getEthExplorerAddressUrl(address)).toBe(
      `${explorerUrl}/address/${address}`,
    );
  });
});
