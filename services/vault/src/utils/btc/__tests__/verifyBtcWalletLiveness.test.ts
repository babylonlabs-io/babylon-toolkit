import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { describe, expect, it, vi } from "vitest";

import {
  BtcWalletLivenessError,
  verifyBtcWalletLiveness,
} from "../verifyBtcWalletLiveness";

const EXPECTED_ADDRESS = "tb1qexampledepositoraddressxxxxxxxxxxxxxxxxx";

function makeWallet(getAddress: () => Promise<string>): BitcoinWallet {
  return {
    getAddress,
    getPublicKeyHex: vi.fn(),
    signPsbt: vi.fn(),
    signPsbts: vi.fn(),
    signMessage: vi.fn(),
    getNetwork: vi.fn(),
    deriveContextHash: vi.fn(),
  } as unknown as BitcoinWallet;
}

describe("verifyBtcWalletLiveness", () => {
  it("resolves when the wallet returns the expected address", async () => {
    const wallet = makeWallet(async () => EXPECTED_ADDRESS);

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).resolves.toBeUndefined();
  });

  it("throws BtcWalletLivenessError when getAddress rejects (locked or unresponsive wallet)", async () => {
    const wallet = makeWallet(async () => {
      throw new Error("Wallet extension is locked");
    });

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("not responding"),
    });
  });

  it("throws BtcWalletLivenessError when getAddress resolves with an empty string", async () => {
    const wallet = makeWallet(async () => "");

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("did not return an address"),
    });
  });

  it("throws BtcWalletLivenessError when the wallet's address differs from the expected one (account changed)", async () => {
    const wallet = makeWallet(
      async () => "tb1qdifferentaccountaddressxxxxxxxxxxxxxxxxxx",
    );

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toMatchObject({
      name: "BtcWalletLivenessError",
      message: expect.stringContaining("account has changed"),
    });
  });

  it("exposes BtcWalletLivenessError as an Error subclass", async () => {
    const wallet = makeWallet(async () => "");

    await expect(
      verifyBtcWalletLiveness(wallet, EXPECTED_ADDRESS),
    ).rejects.toBeInstanceOf(BtcWalletLivenessError);
  });
});
