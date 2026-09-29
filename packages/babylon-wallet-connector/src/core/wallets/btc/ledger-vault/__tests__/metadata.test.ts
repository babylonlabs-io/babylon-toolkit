// @vitest-environment node
// Matches provider.test.ts: the Ledger modules load the Bitcoin stack, which
// fails its curve self-check under jsdom. These tests touch no DOM.

import { describe, expect, it } from "vitest";

import { createWallet } from "@/core";
import { type BTCConfig, Network } from "@/core/types";

import metadata from "../index";

const configFor = (network: Network): BTCConfig => ({
  coinName: "BTC",
  coinSymbol: "BTC",
  networkName: "BTC",
  mempoolApiUrl: "https://mempool.space",
  network,
});

describe("Ledger Vault connect guide", () => {
  it("tells a mainnet user to open the Babylon Vault app", async () => {
    const wallet = await createWallet({ metadata, context: {}, config: configFor(Network.MAINNET) });

    expect(wallet.connectGuide?.steps).toContain("Open the Babylon Vault app on your Ledger.");
  });

  it("tells a signet user to open the Babylon Vault Testnet app", async () => {
    const wallet = await createWallet({ metadata, context: {}, config: configFor(Network.SIGNET) });

    expect(wallet.connectGuide?.steps).toContain("Open the Babylon Vault Testnet app on your Ledger.");
  });

  it("tells a user without the app how to install it and when to come back", async () => {
    const wallet = await createWallet({ metadata, context: {}, config: configFor(Network.SIGNET) });

    expect(wallet.connectGuide?.installSteps).toEqual([
      "In Ledger Wallet, open Settings → Experimental features. Turn on My Ledger provider and set it to 4.",
      "Go to My Ledger and install the Babylon Vault Testnet app.",
      "Then close Ledger Wallet and follow the steps at the top.",
    ]);
  });
});
