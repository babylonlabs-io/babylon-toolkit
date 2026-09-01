import { describe, expect, it } from "vitest";

import type { Connectors } from "@/context/Chain.context";
import {
  createConfirmationReceipt,
  isLiveConfirmationReceiptValid,
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
  it("records every connected chain, not just the required ones", () => {
    const receipt = createConfirmationReceipt(
      [connection("ETH", "metamask", ETH_ACCOUNT), connection("BTC", "unisat", BTC_ACCOUNT)],
      connectors({ btcWallet: wallet("unisat", BTC_ACCOUNT), ethWallet: wallet("metamask", ETH_ACCOUNT) }),
    );

    expect(JSON.parse(receipt)).toMatchObject({
      version: 2,
      entries: [
        { chain: "BTC", walletId: "unisat", address: "bc1pdepositor", network: "signet" },
        { chain: "ETH", walletId: "metamask", address: "0xDepositor", network: "11155111" },
      ],
    });
  });
});

describe("isValidConfirmationReceipt", () => {
  const live = connectors({ btcWallet: wallet("unisat", BTC_ACCOUNT), ethWallet: wallet("metamask", ETH_ACCOUNT) });
  const receipt = createConfirmationReceipt(
    [connection("BTC", "unisat", BTC_ACCOUNT), connection("ETH", "metamask", ETH_ACCOUNT)],
    live,
  );

  it("accepts a receipt matching the live connections", () => {
    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], live)).toBe(true);
  });

  it("ignores the order the required set is declared in", () => {
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

  it("rejects a receipt that does not name a newly required chain", () => {
    const ethOnly = createConfirmationReceipt([connection("ETH", "metamask", ETH_ACCOUNT)], live);

    expect(isValidConfirmationReceipt(ethOnly, ["BTC", "ETH"], live)).toBe(false);
  });

  // A host that derives its requirements per route narrows and widens this set
  // as the user navigates. An approval covering both chains has to satisfy each
  // leg, or routine navigation signs the user out.
  it("accepts a receipt covering more chains than are currently required", () => {
    expect(isValidConfirmationReceipt(receipt, ["BBN"], live)).toBe(false);
    expect(isValidConfirmationReceipt(receipt, ["ETH"], live)).toBe(true);
    expect(isValidConfirmationReceipt(receipt, ["BTC"], live)).toBe(true);
    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], live)).toBe(true);
  });

  it("rejects missing, malformed and wrong-version receipts", () => {
    expect(isValidConfirmationReceipt(undefined, ["ETH"], live)).toBe(false);
    expect(isValidConfirmationReceipt("not json", ["ETH"], live)).toBe(false);
    expect(isValidConfirmationReceipt(JSON.stringify({ version: 1, entries: [] }), ["ETH"], live)).toBe(false);
  });

  it("rejects a receipt when the required chain is no longer connected", () => {
    const disconnected = connectors({ ethWallet: wallet("metamask", ETH_ACCOUNT) });

    expect(isValidConfirmationReceipt(receipt, ["BTC", "ETH"], disconnected)).toBe(false);
  });
});

describe("isLiveConfirmationReceiptValid", () => {
  function liveWallet(
    id: string,
    approved: Account,
    current: { account: Account; network: string | number; identityCurrent?: boolean },
  ): IWallet {
    return {
      ...wallet(id, approved),
      provider: {
        connectWallet: async () => {},
        getAddress: async () => current.account.address,
        getPublicKeyHex: async () => current.account.publicKeyHex,
        getNetwork: async () => current.network,
        getChainId: async () => current.network,
        isIdentityCurrent: () => current.identityCurrent !== false,
      },
    } as IWallet;
  }

  it("rejects a live account change that the connector cache has not received", async () => {
    const current = { account: BTC_ACCOUNT, network: "signet" };
    const btcWallet = liveWallet("unisat", BTC_ACCOUNT, current);
    const live = connectors({ btcWallet });
    const receipt = createConfirmationReceipt([connection("BTC", "unisat", BTC_ACCOUNT)], live);

    current.account = { address: "bc1psomeoneelse", publicKeyHex: `02${"c".repeat(64)}` };

    await expect(isLiveConfirmationReceiptValid(receipt, ["BTC"], live)).resolves.toBe(false);
  });

  it("rejects an adapter cache invalidated by a provider event", async () => {
    const current = { account: BTC_ACCOUNT, network: "signet", identityCurrent: true };
    const btcWallet = liveWallet("unisat", BTC_ACCOUNT, current);
    const live = connectors({ btcWallet });
    const receipt = createConfirmationReceipt([connection("BTC", "unisat", BTC_ACCOUNT)], live);

    current.identityCurrent = false;

    await expect(isLiveConfirmationReceiptValid(receipt, ["BTC"], live)).resolves.toBe(false);
  });

  it("rejects a live network change", async () => {
    const current = { account: ETH_ACCOUNT, network: 11155111 };
    const ethWallet = liveWallet("metamask", ETH_ACCOUNT, current);
    const live = connectors({ ethWallet });
    const receipt = createConfirmationReceipt([connection("ETH", "metamask", ETH_ACCOUNT)], live);

    current.network = 1;

    await expect(isLiveConfirmationReceiptValid(receipt, ["ETH"], live)).resolves.toBe(false);
  });

  it("ignores a changed optional wallet", async () => {
    const btc = { account: BTC_ACCOUNT, network: "signet" };
    const eth = { account: ETH_ACCOUNT, network: 11155111 };
    const btcWallet = liveWallet("unisat", BTC_ACCOUNT, btc);
    const ethWallet = liveWallet("metamask", ETH_ACCOUNT, eth);
    const live = connectors({ btcWallet, ethWallet });
    const receipt = createConfirmationReceipt(
      [connection("BTC", "unisat", BTC_ACCOUNT), connection("ETH", "metamask", ETH_ACCOUNT)],
      live,
    );

    btc.account = { address: "bc1psomeoneelse", publicKeyHex: `02${"c".repeat(64)}` };

    await expect(isLiveConfirmationReceiptValid(receipt, ["ETH"], live)).resolves.toBe(true);
  });
});
