import { expect, test } from "@playwright/test";

import { selectRedetectReconnectTargets } from "../../src/hooks/redetectReconnect";

// After a late-injection re-detection re-installs a previously-stored wallet,
// the cold-start triggers must restore that session — but only when it is safe
// to do so. This pins the decision of WHICH redetected connectors get a
// fire-and-forget reconnect. Connectors are faked as plain objects exposing only
// the fields the selector reads (id, connectedWallet, wallets[].id/installed).
const connector = (
  id: string,
  wallets: { id: string; installed: boolean }[],
  connectedWallet: unknown = null,
) => ({ id, connectedWallet, wallets }) as any;

const storageWith = (entries: Record<string, string>) => ({
  get: (key: string) => entries[key],
});

test.describe("selectRedetectReconnectTargets — cold-start session restore", () => {
  test("reconnects a stored wallet that is now installed on a cold-start trigger", () => {
    const btc = connector("BTC", [{ id: "unisat", installed: true }]);

    const targets = selectRedetectReconnectTargets({
      connectors: [btc],
      storage: storageWith({ BTC: "unisat" }),
      allowReconnect: true,
      persistent: true,
      eligibleChainIds: new Set(["BTC"]),
    });

    expect(targets).toEqual([{ connector: btc, walletId: "unisat" }]);
  });

  test("does not reconnect a chain that did not participate in redetection (e.g. ETH/AppKit)", () => {
    // ETH/AppKit is always installed and stored, so without the eligibility
    // gate it would be selected here — and connecting it would pop the AppKit
    // modal on reload. It never late-injects, so it's never eligible.
    const eth = connector("ETH", [
      { id: "appkit-eth-connector", installed: true },
    ]);

    const targets = selectRedetectReconnectTargets({
      connectors: [eth],
      storage: storageWith({ ETH: "appkit-eth-connector" }),
      allowReconnect: true,
      persistent: true,
      eligibleChainIds: new Set(["BTC"]), // only BTC late-injected
    });

    expect(targets).toEqual([]);
  });

  test("does not reconnect on the interactive (modal-open) trigger", () => {
    const btc = connector("BTC", [{ id: "unisat", installed: true }]);

    const targets = selectRedetectReconnectTargets({
      connectors: [btc],
      storage: storageWith({ BTC: "unisat" }),
      allowReconnect: false,
      persistent: true,
      eligibleChainIds: new Set(["BTC"]),
    });

    expect(targets).toEqual([]);
  });

  test("does not reconnect when sessions are not persisted", () => {
    const btc = connector("BTC", [{ id: "unisat", installed: true }]);

    const targets = selectRedetectReconnectTargets({
      connectors: [btc],
      storage: storageWith({ BTC: "unisat" }),
      allowReconnect: true,
      persistent: false,
      eligibleChainIds: new Set(["BTC"]),
    });

    expect(targets).toEqual([]);
  });

  test("does not reconnect when storage has no stored wallet for the chain", () => {
    const btc = connector("BTC", [{ id: "unisat", installed: true }]);

    const targets = selectRedetectReconnectTargets({
      connectors: [btc],
      storage: storageWith({}),
      allowReconnect: true,
      persistent: true,
      eligibleChainIds: new Set(["BTC"]),
    });

    expect(targets).toEqual([]);
  });

  test("does not reconnect when the stored wallet is still not installed", () => {
    const btc = connector("BTC", [{ id: "unisat", installed: false }]);

    const targets = selectRedetectReconnectTargets({
      connectors: [btc],
      storage: storageWith({ BTC: "unisat" }),
      allowReconnect: true,
      persistent: true,
      eligibleChainIds: new Set(["BTC"]),
    });

    expect(targets).toEqual([]);
  });

  test("does not reconnect a connector that is already connected", () => {
    const btc = connector(
      "BTC",
      [{ id: "unisat", installed: true }],
      { id: "unisat" },
    );

    const targets = selectRedetectReconnectTargets({
      connectors: [btc],
      storage: storageWith({ BTC: "unisat" }),
      allowReconnect: true,
      persistent: true,
      eligibleChainIds: new Set(["BTC"]),
    });

    expect(targets).toEqual([]);
  });
});
