import { describe, expect, it, vi } from "vitest";

import {
  BtcWalletLivenessError,
  shouldProbeWalletLiveness,
  verifyBtcWalletLiveness,
} from "../verifyBtcWalletLiveness";

const EXPECTED_ADDRESS = "tb1qexampledepositoraddressxxxxxxxxxxxxxxxxx";

function makeWallet(opts: {
  getAddress: () => Promise<string>;
  connectWallet?: () => Promise<void>;
}) {
  return {
    getAddress: opts.getAddress,
    connectWallet: opts.connectWallet,
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
});
