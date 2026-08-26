import { describe, expect, it } from "vitest";

import { resolveDisplayWallets } from "../resolveDisplayWallets";

// Fake connector exposing only the fields the resolver reads.
const connector = (
  wallets: { name: string; icon: string; installed: boolean }[],
  connectedWallet: {
    name: string;
    icon: string;
    installed: boolean;
  } | null = null,
) => ({ connectedWallet, wallets });

const APPKIT = { name: "AppKit", icon: "appkit-icon", installed: true };
const UNISAT = { name: "UniSat", icon: "unisat-icon", installed: true };

describe("resolveDisplayWallets", () => {
  it("falls back to the connector's installed wallet when selectedWallets is missing the chain", () => {
    // The reported bug: ETH connected (address present) but selectedWallets.ETH
    // was missed on refresh — the icon must still resolve from the connector.
    const result = resolveDisplayWallets({
      selectedWallets: { BTC: { name: "UniSat", icon: "unisat-icon" } },
      btcConnected: true,
      ethConnected: true,
      btcConnector: connector([UNISAT]),
      ethConnector: connector([APPKIT]),
    });

    expect(result["ETH"]).toEqual({ name: "AppKit", icon: "appkit-icon" });
    expect(result["BTC"]).toEqual({ name: "UniSat", icon: "unisat-icon" });
  });

  it("prefers selectedWallets metadata over the connector fallback", () => {
    const result = resolveDisplayWallets({
      selectedWallets: { ETH: { name: "MetaMask", icon: "metamask-icon" } },
      btcConnected: false,
      ethConnected: true,
      btcConnector: null,
      ethConnector: connector([APPKIT]),
    });

    expect(result["ETH"]).toEqual({ name: "MetaMask", icon: "metamask-icon" });
  });

  it("uses connectedWallet before scanning installed wallets", () => {
    const connected = {
      name: "Connected",
      icon: "connected-icon",
      installed: true,
    };
    const result = resolveDisplayWallets({
      selectedWallets: {},
      btcConnected: false,
      ethConnected: true,
      btcConnector: null,
      ethConnector: connector([APPKIT], connected),
    });

    expect(result["ETH"]).toEqual({
      name: "Connected",
      icon: "connected-icon",
    });
  });

  it("omits a chain whose provider is not connected even if a wallet is resolvable", () => {
    const result = resolveDisplayWallets({
      selectedWallets: { ETH: { name: "AppKit", icon: "appkit-icon" } },
      btcConnected: false,
      ethConnected: false,
      btcConnector: connector([UNISAT]),
      ethConnector: connector([APPKIT]),
    });

    expect(result).toEqual({});
  });

  it("omits a connected chain when nothing is resolvable", () => {
    const result = resolveDisplayWallets({
      selectedWallets: {},
      btcConnected: true,
      ethConnected: false,
      // No connector and no selected wallet → cannot resolve an icon.
      btcConnector: null,
      ethConnector: null,
    });

    expect(result).toEqual({});
  });

  it("ignores a not-installed wallet in the connector fallback", () => {
    const result = resolveDisplayWallets({
      selectedWallets: {},
      btcConnected: true,
      ethConnected: false,
      btcConnector: connector([
        { name: "UniSat", icon: "unisat-icon", installed: false },
      ]),
      ethConnector: null,
    });

    expect(result).toEqual({});
  });
});
