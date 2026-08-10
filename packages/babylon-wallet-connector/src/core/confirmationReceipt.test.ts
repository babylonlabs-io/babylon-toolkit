import { describe, expect, it } from "vitest";

import type { Connectors } from "@/context/Chain.context";
import type { IWallet } from "@/core/types";

import { createConfirmationReceipt, isValidConfirmationReceipt } from "./confirmationReceipt";

function wallet(id: string, address: string, publicKeyHex: string): IWallet {
  return { id, account: { address, publicKeyHex } } as IWallet;
}

describe("confirmation receipt", () => {
  it.each([
    "null",
    "[]",
    "{}",
    JSON.stringify({
      version: 1,
      requiredChains: ["ETH"],
      entries: [null],
    }),
  ])("rejects malformed persisted data without throwing", (serialized) => {
    const eth = wallet("eth-wallet", "0x123", "0x123");
    const connectors = {
      BTC: null,
      BBN: null,
      ETH: {
        id: "ETH",
        config: { chainId: 1 },
        connectedWallet: eth,
      },
    } as unknown as Connectors;

    expect(isValidConfirmationReceipt(serialized, ["ETH"], connectors)).toBe(false);
  });

  it("binds the exact required set and account identity but ignores optional BTC changes", () => {
    const eth = wallet("eth-wallet", "0x123", "0x123");
    const btc = wallet("btc-wallet", "bc1p123", "02abc");
    const connectors = {
      BTC: {
        id: "BTC",
        config: { network: "mainnet" },
        connectedWallet: btc,
      },
      BBN: null,
      ETH: {
        id: "ETH",
        config: { chainId: 1 },
        connectedWallet: eth,
      },
    } as unknown as Connectors;
    const receipt = createConfirmationReceipt(
      ["ETH"],
      [{ chain: "ETH", wallet: eth, account: eth.account! }],
      connectors,
    );

    expect(isValidConfirmationReceipt(receipt, ["ETH"], connectors)).toBe(true);

    (connectors.BTC as any).connectedWallet = wallet("other-btc-wallet", "bc1p456", "03def");
    expect(isValidConfirmationReceipt(receipt, ["ETH"], connectors)).toBe(true);
    expect(isValidConfirmationReceipt(receipt, ["ETH", "BTC"], connectors)).toBe(false);

    (connectors.ETH as any).connectedWallet = wallet("eth-wallet", "0x456", "0x456");
    expect(isValidConfirmationReceipt(receipt, ["ETH"], connectors)).toBe(false);
  });
});
