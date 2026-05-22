import { expect, test } from "@playwright/test";

import { createWalletConnector } from "../../src/core";
import type { ChainMetadata, HashMap } from "../../src/core/types";

// A persisted-session auto-reconnect must NOT block connector creation: a
// locked/unresponsive BTC extension whose `connectWallet()` never settles would
// otherwise hang `ChainProvider.init()` and leave the whole wallet UI loading.
// This locks in the fire-and-forget behaviour from `createWalletConnector`.
test.describe("createWalletConnector — auto-reconnect is non-blocking", () => {
  const buildMetadata = (connectWallet: () => Promise<void>): ChainMetadata<string, any, any> => ({
    chain: "BTC",
    name: "Bitcoin",
    icon: "",
    wallets: [
      {
        id: "fake",
        name: "Fake",
        icon: "",
        docs: "",
        networks: [],
        // Truthy origin so the wallet is detected as installed.
        wallet: () => ({}),
        createProvider: () => ({
          connectWallet,
          getAddress: async () => "addr",
          getPublicKeyHex: async () => "pk",
        }),
      },
    ],
  });

  const storageWith = (walletId: string | undefined): HashMap => ({
    get: () => walletId,
    set: () => {},
    delete: () => {},
    has: () => walletId !== undefined,
  });

  test("resolves before a hanging reconnect settles", async () => {
    // connectWallet never resolves — simulates a wedged extension.
    const connector = await Promise.race([
      createWalletConnector({
        persistent: true,
        metadata: buildMetadata(() => new Promise<void>(() => {})),
        context: {},
        config: {},
        accountStorage: storageWith("fake"),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("createWalletConnector blocked on reconnect")), 1000)),
    ]);

    // The connector exists and, because the reconnect is still pending, has not
    // yet recorded a connected wallet — proving creation did not await it.
    expect((connector as { id: string }).id).toBe("BTC");
    expect((connector as { connectedWallet: unknown }).connectedWallet).toBeNull();
  });

  test("still records the connection once a fast reconnect settles", async () => {
    const connector = await createWalletConnector({
      persistent: true,
      metadata: buildMetadata(async () => {}),
      context: {},
      config: {},
      accountStorage: storageWith("fake"),
    });

    // Let the fire-and-forget reconnect microtasks flush.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(connector.connectedWallet?.id).toBe("fake");
  });
});
