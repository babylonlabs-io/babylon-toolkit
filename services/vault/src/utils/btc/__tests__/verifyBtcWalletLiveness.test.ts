import { afterEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  BtcWalletLivenessError,
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "../verifyBtcWalletLiveness";

const EXPECTED_ADDRESS = "tb1qexampledepositoraddressxxxxxxxxxxxxxxxxx";

function makeWallet(opts: {
  getAddress: () => Promise<string>;
  connectWallet?: () => Promise<void>;
  getAccounts?: () => Promise<string[]>;
}) {
  return {
    getAddress: opts.getAddress,
    connectWallet: opts.connectWallet,
    getAccounts: opts.getAccounts,
  };
}

describe("shouldProbeWalletLiveness", () => {
  it("allows the round-trip probe for injected extensions", () => {
    expect(shouldProbeWalletLiveness("unisat")).toBe(true);
    expect(shouldProbeWalletLiveness("okx")).toBe(true);
    expect(shouldProbeWalletLiveness("onekey")).toBe(true);
  });

  it("blocks the probe for AppKit, hardware, and unknown/undefined wallets", () => {
    expect(shouldProbeWalletLiveness("appkit-btc-connector")).toBe(false);
    expect(shouldProbeWalletLiveness("ledger_btc")).toBe(false);
    expect(shouldProbeWalletLiveness("ledger_btc_v2")).toBe(false);
    expect(shouldProbeWalletLiveness("keystone")).toBe(false);
    expect(shouldProbeWalletLiveness(undefined)).toBe(false);
  });
});

describe("verifyBtcWalletLiveness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a lost hardware-device session and a wrong-app device through with their typed codes", async () => {
    // The caller needs each code to name the real recovery (reconnect, or open
    // the vault app); the generic "unresponsive wallet" copy would hide it.
    const lost = Object.assign(new Error("Ledger Vault is not connected"), {
      code: "DEVICE_DISCONNECTED",
    });
    const lostWallet = makeWallet({
      getAddress: async () => {
        throw lost;
      },
    });

    await expect(
      verifyBtcWalletLiveness(lostWallet, EXPECTED_ADDRESS),
    ).rejects.toBe(lost);

    const wrongApp = Object.assign(new Error("Open the Ledger vault app"), {
      code: "DEVICE_WRONG_APP",
    });
    const wrongAppWallet = makeWallet({
      getAddress: async () => {
        throw wrongApp;
      },
    });

    await expect(
      verifyBtcWalletLiveness(wrongAppWallet, EXPECTED_ADDRESS),
    ).rejects.toBe(wrongApp);
  });

  it("still reports any other address-read failure as an unresponsive wallet", async () => {
    const wallet = makeWallet({
      getAddress: async () => {
        throw Object.assign(new Error("locked"), { code: "DEVICE_LOCKED" });
      },
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toBeInstanceOf(BtcWalletLivenessError);
  });

  it("does not round-trip via connectWallet unless probeConnection is set", async () => {
    const connectWallet = vi.fn(async () => {});
    const wallet = makeWallet({
      connectWallet,
      getAddress: async () => EXPECTED_ADDRESS,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).resolves.toBeUndefined();
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("round-trips via connectWallet when probeConnection is set", async () => {
    const connectWallet = vi.fn(async () => {});
    const wallet = makeWallet({
      connectWallet,
      getAddress: async () => EXPECTED_ADDRESS,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS, {
        probeConnection: true,
      }),
    ).resolves.toBeUndefined();
    expect(connectWallet).toHaveBeenCalledOnce();
  });

  it("throws BtcWalletLivenessError when the probe's connectWallet rejects (locked wallet)", async () => {
    const getAddress = vi.fn(async () => EXPECTED_ADDRESS);
    const wallet = makeWallet({
      connectWallet: async () => {
        throw new Error("Connection to Unisat Wallet was rejected");
      },
      getAddress,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS, {
        probeConnection: true,
      }),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("not responding"),
    });
    // A locked wallet must fail the probe before the cached address is read.
    expect(getAddress).not.toHaveBeenCalled();
  });

  it("throws BtcWalletLivenessError when getAddress rejects", async () => {
    const wallet = makeWallet({
      getAddress: async () => {
        throw new Error("Wallet extension is locked");
      },
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("not responding"),
    });
  });

  it("throws BtcWalletLivenessError when getAddress resolves with an empty string", async () => {
    const wallet = makeWallet({ getAddress: async () => "" });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("did not return an address"),
    });
  });

  it("throws BtcWalletLivenessError when the wallet's address differs from the expected one (account changed)", async () => {
    const wallet = makeWallet({
      getAddress: async () => "tb1qdifferentaccountaddressxxxxxxxxxxxxxxxxxx",
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("account has changed"),
    });
  });

  it("skips the probe when probeConnection is set but the wallet has no connectWallet method", async () => {
    const wallet = makeWallet({ getAddress: async () => EXPECTED_ADDRESS });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS, {
        probeConnection: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("exposes BtcWalletLivenessError as an Error subclass", async () => {
    const wallet = makeWallet({ getAddress: async () => "" });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toBeInstanceOf(BtcWalletLivenessError);
  });

  it("falls through to connectWallet when the getAccounts read resolves, even empty (locked wallet)", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const getAccounts = vi.fn(async () => []);
    const connectWallet = vi.fn(async () => {});
    const wallet = makeWallet({
      connectWallet,
      getAccounts,
      getAddress: async () => EXPECTED_ADDRESS,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS, {
        probeConnection: true,
      }),
    ).resolves.toBeUndefined();
    expect(getAccounts).toHaveBeenCalledOnce();
    expect(connectWallet).toHaveBeenCalledOnce();
  });

  it("throws the reload copy and skips connectWallet when the getAccounts read times out (CONNECTION_FAILED)", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const connectWallet = vi.fn(async () => {});
    const wallet = makeWallet({
      connectWallet,
      getAccounts: async () => {
        throw Object.assign(
          new Error(
            "Unisat Wallet did not respond while reading its accounts.",
          ),
          { code: "CONNECTION_FAILED" },
        );
      },
      getAddress: async () => EXPECTED_ADDRESS,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS, {
        probeConnection: true,
      }),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: COPY.wallet.liveness.extensionDisconnected,
    });
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("keeps the existing liveness mapping when the getAccounts read rejects for another reason", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const connectWallet = vi.fn(async () => {});
    const wallet = makeWallet({
      connectWallet,
      getAccounts: async () => {
        throw Object.assign(new Error("wallet must has at least one account"), {
          code: 4100,
        });
      },
      getAddress: async () => EXPECTED_ADDRESS,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS, {
        probeConnection: true,
      }),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: COPY.wallet.liveness.unresponsive,
    });
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("skips the getAccounts read on a hidden tab and uses the interactive probe", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const getAccounts = vi.fn(async () => []);
    const connectWallet = vi.fn(async () => {});
    const wallet = makeWallet({
      connectWallet,
      getAccounts,
      getAddress: async () => EXPECTED_ADDRESS,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS, {
        probeConnection: true,
      }),
    ).resolves.toBeUndefined();
    expect(getAccounts).not.toHaveBeenCalled();
    expect(connectWallet).toHaveBeenCalledOnce();
  });
});
