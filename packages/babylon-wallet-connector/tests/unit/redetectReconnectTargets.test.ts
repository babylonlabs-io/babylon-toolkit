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
    });

    expect(targets).toEqual([{ connector: btc, walletId: "unisat" }]);
  });

  test("does not reconnect on the interactive (modal-open) trigger", () => {
    const btc = connector("BTC", [{ id: "unisat", installed: true }]);

    const targets = selectRedetectReconnectTargets({
      connectors: [btc],
      storage: storageWith({ BTC: "unisat" }),
      allowReconnect: false,
      persistent: true,
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
    });

    expect(targets).toEqual([]);
  });
});
