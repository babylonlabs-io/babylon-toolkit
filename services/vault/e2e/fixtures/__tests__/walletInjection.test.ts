import { afterEach, describe, expect, it } from "vitest";

import { createMockBtcWallet } from "../mockBtcWallet";
import { createMockEthWallet } from "../mockEthWallet";
import {
  E2E_WALLETS_GLOBAL,
  clearInjectedWallets,
  getInjectedWallets,
  injectWallets,
} from "../walletInjection";

afterEach(() => {
  clearInjectedWallets();
});

describe("walletInjection", () => {
  it("installs the mocks on window under the documented global", () => {
    const btc = createMockBtcWallet();
    const eth = createMockEthWallet();
    injectWallets({ btc, eth });
    expect(window[E2E_WALLETS_GLOBAL]).toBeDefined();
    expect(window[E2E_WALLETS_GLOBAL]?.btc).toBe(btc);
    expect(window[E2E_WALLETS_GLOBAL]?.eth).toBe(eth);
  });

  it("getInjectedWallets returns the installed mocks", () => {
    const btc = createMockBtcWallet();
    injectWallets({ btc });
    expect(getInjectedWallets()?.btc).toBe(btc);
    expect(getInjectedWallets()?.eth).toBeUndefined();
  });

  it("getInjectedWallets returns undefined when nothing is installed", () => {
    expect(getInjectedWallets()).toBeUndefined();
  });

  it("clearInjectedWallets removes the global", () => {
    injectWallets({ btc: createMockBtcWallet() });
    clearInjectedWallets();
    expect(window[E2E_WALLETS_GLOBAL]).toBeUndefined();
  });
});
