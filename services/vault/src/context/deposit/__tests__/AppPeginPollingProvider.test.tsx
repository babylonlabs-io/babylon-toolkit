/**
 * The app's single polling mount. These pin the two properties the collapse
 * depends on: it feeds the provider only from indexer/localStorage deposits
 * (never god-mode demo rows, which would otherwise fire real desktop
 * notifications), and it serves the deposit-flow modal, which has no dashboard
 * above it and previously had to bring a provider of its own.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppPeginPollingProvider } from "../AppPeginPollingProvider";

const REAL_ID = "0xreal";
const DEMO_ID = "0xdemo";

let providerActivities: Array<{ id: string }> = [];
let providerBtcWalletAbsent: boolean | undefined;
let btcConnected = true;

vi.mock("../PeginPollingContext", () => ({
  PeginPollingProvider: ({
    activities,
    btcWalletAbsent,
    children,
  }: {
    activities: Array<{ id: string }>;
    btcWalletAbsent?: boolean;
    children: React.ReactNode;
  }) => {
    providerActivities = activities;
    providerBtcWalletAbsent = btcWalletAbsent;
    return children;
  },
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({ connected: btcConnected }),
  useETHWallet: () => ({ address: "0xdepositor" }),
}));

vi.mock("@/hooks/useBtcPublicKey", () => ({
  useBtcPublicKey: () => ({ publicKey: "0xpub" }),
}));

vi.mock("@/hooks/useVaultDeposits", () => ({
  useVaultDeposits: () => ({
    activities: [{ id: REAL_ID }],
    pendingPegins: [],
  }),
}));

// A demo aggregate exists, but the provider must not be fed from it.
vi.mock("@/overrides/deposits", () => ({
  useDepositOverride: () => ({
    pendingActivities: [{ id: DEMO_ID }],
    resultsById: new Map(),
  }),
}));

describe("AppPeginPollingProvider", () => {
  afterEach(() => {
    btcConnected = true;
    vi.unstubAllEnvs();
  });

  it("feeds the polling provider the wallet's real deposits", () => {
    render(
      <AppPeginPollingProvider>
        <div>child</div>
      </AppPeginPollingProvider>,
    );

    expect(providerActivities.map((a) => a.id)).toContain(REAL_ID);
  });

  it("never feeds god-mode demo deposits into the polling provider", () => {
    // The provider drives useSigningRequiredNotifications, so a simulated
    // ready-to-activate state must never reach it — that would fire a real
    // desktop notification for a deposit that does not exist.
    render(
      <AppPeginPollingProvider>
        <div>child</div>
      </AppPeginPollingProvider>,
    );

    expect(providerActivities.map((a) => a.id)).not.toContain(DEMO_ID);
  });

  it("renders its subtree, so the deposit flow resolves without a dashboard", () => {
    // The deposit-flow modal is a sibling of the router outlet: no dashboard
    // section is mounted above it. It only has polling state because this
    // provider sits above both.
    render(
      <AppPeginPollingProvider>
        <div>deposit flow</div>
      </AppPeginPollingProvider>,
    );

    expect(screen.getByText("deposit flow")).toBeInTheDocument();
  });

  it("marks the Bitcoin wallet absent when the flag is on and Bitcoin is disconnected", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    btcConnected = false;

    render(
      <AppPeginPollingProvider>
        <div>child</div>
      </AppPeginPollingProvider>,
    );

    expect(providerBtcWalletAbsent).toBe(true);
  });

  it("does not mark the Bitcoin wallet absent while Bitcoin is connected", () => {
    // A connected wallet whose key has not loaded yet must poll nothing, not
    // everything, so the provider is told the wallet is present.
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    btcConnected = true;

    render(
      <AppPeginPollingProvider>
        <div>child</div>
      </AppPeginPollingProvider>,
    );

    expect(providerBtcWalletAbsent).toBe(false);
  });

  it("does not mark the Bitcoin wallet absent when the flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "false");
    btcConnected = false;

    render(
      <AppPeginPollingProvider>
        <div>child</div>
      </AppPeginPollingProvider>,
    );

    expect(providerBtcWalletAbsent).toBe(false);
  });
});
