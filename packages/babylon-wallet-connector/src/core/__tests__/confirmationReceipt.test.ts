import { describe, expect, it } from "vitest";

import type { Connectors } from "@/context/Chain.context";
import {
  createConfirmationReceipt,
  isValidConfirmationReceipt,
  type ConfirmationConnection,
} from "@/core/confirmationReceipt";
import type { Account, IWallet } from "@/core/types";

const BTC_ACCOUNT: Account = { address: "bc1pdepositor", publicKeyHex: `02${"a".repeat(64)}` };
const ETH_ACCOUNT: Account = { address: "0xDepositor", publicKeyHex: `04${"b".repeat(64)}` };

function wallet(id: string, account: Account): IWallet {
  return { id, name: id, icon: "", docs: "", installed: true, account } as IWallet;
}

/**
 * Stands in for the connector map. Only `config` and `connectedWallet` are read
 * by the receipt, so the rest of the connector surface is deliberately absent.
 */
function connectors({
  btcWallet,
  ethWallet,
  btcNetwork = "signet",
  ethChainId = 11155111,
}: {
  btcWallet?: IWallet;
  ethWallet?: IWallet;
  btcNetwork?: string;
  ethChainId?: number;
}): Connectors {
  return {
    BTC: btcWallet ? ({ config: { network: btcNetwork }, connectedWallet: btcWallet } as any) : null,
    ETH: ethWallet ? ({ config: { chainId: ethChainId }, connectedWallet: ethWallet } as any) : null,
    BBN: null,
  };
}

function connection(chain: "BTC" | "ETH", walletId: string, account: Account): ConfirmationConnection {
  return { chain, wallet: wallet(walletId, account), account };
}

describe("createConfirmationReceipt", () => {
  it("returns undefined when a required chain has no connection", () => {
    const receipt = createConfirmationReceipt(
      ["BTC", "ETH"],
      [connection("ETH", "metamask", ETH_ACCOUNT)],
      connectors({ ethWallet: wallet("metamask", ETH_ACCOUNT) }),
    );

    expect(receipt).toBeUndefined();
  });

  it("records only the required chains, ignoring connected optional ones", () => {
    const receipt = createConfirmationReceipt(
      ["ETH"],
      [connection("ETH", "metamask", ETH_ACCOUNT), connection("BTC", "unisat", BTC_ACCOUNT)],
      connectors({ btcWallet: wallet("unisat", BTC_ACCOUNT), ethWallet: wallet("metamask", ETH_ACCOUNT) }),
    );

    expect(JSON.parse(receipt!)).toMatchObject({
      version: 1,
      requiredChains: ["ETH"],
      entries: [{ chain: "ETH", walletId: "metamask", address: "0xDepositor", network: "11155111" }],
    });
  });
});

describe("isValidConfirmationReceipt", () => {
  const live = connectors({ btcWallet: wallet("unisat", BTC_ACCOUNT), ethWallet: wallet("metamask", ETH_ACCOUNT) });
  const receipt = createConfirmationReceipt(
    ["BTC", "ETH"],
    [connection("BTC", "unisat", BTC_ACCOUNT), connection("ETH", "metamask", ETH_ACCOUNT)],
    live,
  );

  it("accepts a receipt matching the live connections", () => {
    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], live)).toBe(true);
  });

  it("accepts the same required set declared in a different order", () => {
    expect(isValidConfirmationReceipt(receipt, ["ETH", "BTC"], live)).toBe(true);
  });

  it("rejects a different account on a required chain", () => {
    const switched = connectors({
      btcWallet: wallet("unisat", BTC_ACCOUNT),
      ethWallet: wallet("metamask", { address: "0xSomeoneElse", publicKeyHex: `04${"c".repeat(64)}` }),
    });

    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], switched)).toBe(false);
  });

  it("rejects a different wallet holding the same account", () => {
    const switched = connectors({
      btcWallet: wallet("okx", BTC_ACCOUNT),
      ethWallet: wallet("metamask", ETH_ACCOUNT),
    });

    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], switched)).toBe(false);
  });

  it("rejects a receipt minted against a different network", () => {
    const mainnet = connectors({
      btcWallet: wallet("unisat", BTC_ACCOUNT),
      ethWallet: wallet("metamask", ETH_ACCOUNT),
      btcNetwork: "mainnet",
    });

    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], mainnet)).toBe(false);
  });

  it("rejects a receipt that does not cover a newly required chain", () => {
    const ethOnly = createConfirmationReceipt(["ETH"], [connection("ETH", "metamask", ETH_ACCOUNT)], live);

    expect(isValidConfirmationReceipt(ethOnly, ["BTC", "ETH"], live)).toBe(false);
  });

  it("rejects missing, malformed and wrong-version receipts", () => {
    expect(isValidConfirmationReceipt(undefined, ["ETH"], live)).toBe(false);
    expect(isValidConfirmationReceipt("not json", ["ETH"], live)).toBe(false);
    expect(
      isValidConfirmationReceipt(
        JSON.stringify({ version: 2, requiredChains: ["ETH"], entries: [] }),
        ["ETH"],
        live,
      ),
    ).toBe(false);
  });

  it("rejects a receipt when the required chain is no longer connected", () => {
    const disconnected = connectors({ ethWallet: wallet("metamask", ETH_ACCOUNT) });

    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], disconnected)).toBe(false);
  });
});
