import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock("../trackEvent", () => ({ trackEvent }));

const BTC_ADDRESS = "tb1qexampleaddress0000000000000000000000";
const OTHER_BTC_ADDRESS = "tb1qotheraddress00000000000000000000000000";

// The module keeps per-page-load state; load a fresh copy for each test.
async function loadModule() {
  vi.resetModules();
  return import("../walletConnections");
}

beforeEach(() => {
  trackEvent.mockClear();
});

describe("reportEthSessionConfirmed", () => {
  it("sends a confirmation with no dialog confirmation before it as restored", async () => {
    const { reportEthSessionConfirmed } = await loadModule();

    reportEthSessionConfirmed();

    expect(trackEvent.mock.calls).toEqual([
      ["wallet_connected", { chain: "eth", restored: true }],
    ]);
  });

  it("sends only the confirmation that follows the dialog's onConfirm as the user's", async () => {
    const { markUserConfirmation, reportEthSessionConfirmed } =
      await loadModule();

    markUserConfirmation();
    reportEthSessionConfirmed();
    reportEthSessionConfirmed();

    expect(trackEvent.mock.calls).toEqual([
      ["wallet_connected", { chain: "eth", restored: false }],
      ["wallet_connected", { chain: "eth", restored: true }],
    ]);
  });
});

describe("reportBtcConnected", () => {
  it("sends one event when the provider reports the same connection repeatedly", async () => {
    const { reportBtcConnected } = await loadModule();

    reportBtcConnected(BTC_ADDRESS, false);
    reportBtcConnected(BTC_ADDRESS, true);

    expect(trackEvent.mock.calls).toEqual([
      ["wallet_connected", { chain: "btc", restored: false }],
    ]);
  });

  it("sends a connection to a different address", async () => {
    const { reportBtcConnected } = await loadModule();

    reportBtcConnected(BTC_ADDRESS, true);
    reportBtcConnected(OTHER_BTC_ADDRESS, false);

    expect(trackEvent.mock.calls).toEqual([
      ["wallet_connected", { chain: "btc", restored: true }],
      ["wallet_connected", { chain: "btc", restored: false }],
    ]);
  });

  it("sends the same address again after the app cleared the Bitcoin session", async () => {
    const { forgetBtcConnection, reportBtcConnected } = await loadModule();

    reportBtcConnected(BTC_ADDRESS, true);
    forgetBtcConnection();
    reportBtcConnected(BTC_ADDRESS, false);

    expect(trackEvent.mock.calls).toEqual([
      ["wallet_connected", { chain: "btc", restored: true }],
      ["wallet_connected", { chain: "btc", restored: false }],
    ]);
  });
});
