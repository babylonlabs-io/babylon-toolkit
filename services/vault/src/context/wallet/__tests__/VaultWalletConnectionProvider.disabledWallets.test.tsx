import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// DISABLED_WALLETS is computed at module load from NEXT_PUBLIC_TBV_DISABLED_BTC_WALLETS,
// so each case sets the env, resets the module registry, then re-imports the provider.
// We capture the `disabledWallets` prop the provider hands to the connector's
// WalletProvider to prove the env lever actually reaches the connector filter.
const h = vi.hoisted(() => ({
  captured: { disabledWallets: undefined as string[] | undefined },
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  APPKIT_BTC_CONNECTOR_ID: "appkit_btc",
  WalletProvider: ({
    children,
    disabledWallets,
  }: {
    children: React.ReactNode;
    disabledWallets?: string[];
  }) => {
    h.captured.disabledWallets = disabledWallets;
    return children;
  },
  BTCWalletProvider: ({ children }: { children: React.ReactNode }) => children,
  ETHWalletProvider: ({ children }: { children: React.ReactNode }) => children,
  createWalletConfig: () => ({}),
  useWalletConnect: () => ({ disconnect: vi.fn() }),
  useWidgetState: () => ({ visible: false }),
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

const ENV_KEY = "NEXT_PUBLIC_TBV_DISABLED_BTC_WALLETS";

const renderWithDisabledWallets = async (value?: string) => {
  vi.resetModules();
  if (value === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = value;
  }
  h.captured.disabledWallets = undefined;
  const { WalletConnectionProvider } = await import(
    "../VaultWalletConnectionProvider"
  );
  render(<WalletConnectionProvider>child</WalletConnectionProvider>);
};

describe("WalletConnectionProvider — NEXT_PUBLIC_TBV_DISABLED_BTC_WALLETS lever", () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("disables onekey at the connector when the env lists onekey", async () => {
    await renderWithDisabledWallets("onekey");
    expect(h.captured.disabledWallets).toContain("onekey");
  });

  it("disables both wallets when the env lists onekey,utila", async () => {
    await renderWithDisabledWallets("onekey,utila");
    expect(h.captured.disabledWallets).toEqual(
      expect.arrayContaining(["onekey", "utila"]),
    );
  });

  it("hides no experimental wallet when the env is unset", async () => {
    await renderWithDisabledWallets(undefined);
    expect(h.captured.disabledWallets).not.toContain("onekey");
    expect(h.captured.disabledWallets).not.toContain("utila");
  });
});

describe("WalletConnectionProvider — Ledger vault wallet opt-in", () => {
  const FF_KEY = "NEXT_PUBLIC_FF_ENABLE_LEDGER_VAULT_WALLET";
  const original = process.env[FF_KEY];

  const renderWithFlag = async (value?: string) => {
    vi.resetModules();
    if (value === undefined) delete process.env[FF_KEY];
    else process.env[FF_KEY] = value;
    h.captured.disabledWallets = undefined;
    const { WalletConnectionProvider } = await import(
      "../VaultWalletConnectionProvider"
    );
    render(<WalletConnectionProvider>child</WalletConnectionProvider>);
  };

  afterEach(() => {
    if (original === undefined) delete process.env[FF_KEY];
    else process.env[FF_KEY] = original;
    delete (window.navigator as { hid?: unknown }).hid;
  });

  // jsdom's navigator has no `hid`, so every flag-off case stubs it: otherwise
  // the WebHID term hides the entry on its own and the flag is never exercised.
  const stubWebHid = () => {
    Object.defineProperty(window.navigator, "hid", {
      value: {},
      configurable: true,
    });
  };

  it("hides the Ledger vault wallet when the flag is unset, even with WebHID", async () => {
    // Opt-in, not opt-out: the env disable list defaults to empty, so without
    // this the provider would be visible wherever nobody listed it.
    stubWebHid();
    await renderWithFlag(undefined);
    expect(h.captured.disabledWallets).toContain("ledger_btc_vault");
  });

  it('hides it for any value other than the literal "true", even with WebHID', async () => {
    stubWebHid();
    await renderWithFlag("1");
    expect(h.captured.disabledWallets).toContain("ledger_btc_vault");
  });

  it('reveals it when the flag is exactly "true" and WebHID exists', async () => {
    stubWebHid();
    await renderWithFlag("true");
    expect(h.captured.disabledWallets).not.toContain("ledger_btc_vault");
  });

  it("hides it without WebHID even when the flag is on", async () => {
    // jsdom default: no navigator.hid — the Firefox/Safari case, where the
    // entry would otherwise render clickable and fail only on connect.
    await renderWithFlag("true");
    expect(h.captured.disabledWallets).toContain("ledger_btc_vault");
  });

  it("keeps the legacy staking Ledger adapters hidden even when the vault wallet is revealed", async () => {
    stubWebHid();
    await renderWithFlag("true");
    // Precondition: this is the revealed quadrant, so the stub is load-bearing.
    expect(h.captured.disabledWallets).not.toContain("ledger_btc_vault");
    expect(h.captured.disabledWallets).toEqual(
      expect.arrayContaining(["ledger_btc", "ledger_btc_v2"]),
    );
  });
});
