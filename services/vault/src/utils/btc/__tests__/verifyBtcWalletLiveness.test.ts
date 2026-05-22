import { describe, expect, it, vi } from "vitest";

import {
  BtcWalletLivenessError,
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

describe("verifyBtcWalletLiveness", () => {
  it("resolves when connectWallet succeeds and the wallet returns the expected address", async () => {
    const connectWallet = vi.fn(async () => {});
    const wallet = makeWallet({
      connectWallet,
      getAddress: async () => EXPECTED_ADDRESS,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).resolves.toBeUndefined();
    // The round-trip probe must run before trusting the (possibly cached) address.
    expect(connectWallet).toHaveBeenCalledOnce();
  });

  it("throws BtcWalletLivenessError when connectWallet rejects (locked or unresponsive wallet)", async () => {
    const getAddress = vi.fn(async () => EXPECTED_ADDRESS);
    const wallet = makeWallet({
      connectWallet: async () => {
        throw new Error("Connection to Unisat Wallet was rejected");
      },
      getAddress,
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("not responding"),
    });
    // A locked wallet must fail the probe before the cached address is read.
    expect(getAddress).not.toHaveBeenCalled();
  });

  it("throws BtcWalletLivenessError when getAddress rejects after a successful probe", async () => {
    const wallet = makeWallet({
      connectWallet: async () => {},
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
    const wallet = makeWallet({
      connectWallet: async () => {},
      getAddress: async () => "",
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("did not return an address"),
    });
  });

  it("throws BtcWalletLivenessError when the wallet's address differs from the expected one (account changed)", async () => {
    const wallet = makeWallet({
      connectWallet: async () => {},
      getAddress: async () => "tb1qdifferentaccountaddressxxxxxxxxxxxxxxxxxx",
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("account has changed"),
    });
  });

  it("skips the probe when the wallet has no connectWallet method", async () => {
    const wallet = makeWallet({ getAddress: async () => EXPECTED_ADDRESS });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).resolves.toBeUndefined();
  });

  it("exposes BtcWalletLivenessError as an Error subclass", async () => {
    const wallet = makeWallet({
      connectWallet: async () => {},
      getAddress: async () => "",
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toBeInstanceOf(BtcWalletLivenessError);
  });
});
