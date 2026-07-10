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
