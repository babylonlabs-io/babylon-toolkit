import { describe, expect, it, vi } from "vitest";

import { type BTCConfig, Network } from "@/core/types";
import { OKXProvider } from "@/core/wallets/btc/okx/provider";
import { ERROR_CODES, WalletError } from "@/error";

const config: BTCConfig = {
  coinName: "Signet BTC",
  coinSymbol: "sBTC",
  networkName: "BTC signet",
  mempoolApiUrl: "https://mempool.example",
  network: Network.SIGNET,
};

const PSBT_HEX = "70736274ff01000a0200000000000000000000";
const PUBKEY = "02" + "ab".repeat(32);

// The exact object `mapSignInputsToToSignInputs` produces for a script-path input.
const SCRIPT_PATH_TO_SIGN_INPUT = {
  index: 0,
  publicKey: PUBKEY,
  address: undefined,
  sighashTypes: undefined,
  useTweakedSigner: false,
  disableTweakSigner: true,
};

async function connectedProvider(chain: { signPsbt?: unknown; signPsbts?: unknown }) {
  const bitcoinSignet = {
    connect: vi.fn(async () => ({ address: "tb1pexample", compressedPublicKey: PUBKEY })),
    signPsbt: vi.fn(async () => "signed-by-single-endpoint"),
    signPsbts: vi.fn(async () => ["signed-by-batch-endpoint"]),
    ...chain,
  };
  const wallet = { getVersion: vi.fn(async () => "4.17.11"), bitcoinSignet };
  const provider = new OKXProvider(wallet, config);
  await provider.connectWallet();
  return { provider, bitcoinSignet };
}

describe("OKXProvider.signPsbt", () => {
  it("signs a lone script-path PSBT through the batch endpoint so autoFinalized:false survives", async () => {
    const { provider, bitcoinSignet } = await connectedProvider({});

    const signed = await provider.signPsbt(PSBT_HEX, {
      autoFinalized: false,
      signInputs: [{ index: 0, publicKey: PUBKEY, useTweakedSigner: false }],
    });

    expect(signed).toBe("signed-by-batch-endpoint");
    expect(bitcoinSignet.signPsbts).toHaveBeenCalledWith(
      [PSBT_HEX],
      [{ autoFinalized: false, toSignInputs: [SCRIPT_PATH_TO_SIGN_INPUT] }],
    );
    expect(bitcoinSignet.signPsbt).not.toHaveBeenCalled();
  });

  it("treats signInputs without autoFinalized as autoFinalized:false and uses the batch endpoint", async () => {
    const { provider, bitcoinSignet } = await connectedProvider({});

    await provider.signPsbt(PSBT_HEX, {
      signInputs: [{ index: 0, publicKey: PUBKEY, useTweakedSigner: false }],
    });

    expect(bitcoinSignet.signPsbts).toHaveBeenCalledWith(
      [PSBT_HEX],
      [{ autoFinalized: false, toSignInputs: [SCRIPT_PATH_TO_SIGN_INPUT] }],
    );
    expect(bitcoinSignet.signPsbt).not.toHaveBeenCalled();
  });

  it("honours autoFinalized:false without signInputs through the batch endpoint", async () => {
    const { provider, bitcoinSignet } = await connectedProvider({});

    await provider.signPsbt(PSBT_HEX, { autoFinalized: false });

    expect(bitcoinSignet.signPsbts).toHaveBeenCalledWith(
      [PSBT_HEX],
      [{ autoFinalized: false, toSignInputs: undefined }],
    );
    expect(bitcoinSignet.signPsbt).not.toHaveBeenCalled();
  });

  it("keeps the single endpoint when autoFinalized is true", async () => {
    const { provider, bitcoinSignet } = await connectedProvider({});

    const signed = await provider.signPsbt(PSBT_HEX, {
      autoFinalized: true,
      signInputs: [{ index: 0, publicKey: PUBKEY, useTweakedSigner: false }],
    });

    expect(signed).toBe("signed-by-single-endpoint");
    expect(bitcoinSignet.signPsbt).toHaveBeenCalledWith(PSBT_HEX, {
      autoFinalized: true,
      toSignInputs: [SCRIPT_PATH_TO_SIGN_INPUT],
    });
    expect(bitcoinSignet.signPsbts).not.toHaveBeenCalled();
  });

  it("keeps the single endpoint when no options are given", async () => {
    const { provider, bitcoinSignet } = await connectedProvider({});

    const signed = await provider.signPsbt(PSBT_HEX);

    expect(signed).toBe("signed-by-single-endpoint");
    expect(bitcoinSignet.signPsbt).toHaveBeenCalledWith(PSBT_HEX);
    expect(bitcoinSignet.signPsbts).not.toHaveBeenCalled();
  });

  it("rejects a batch response that is not an array and says what it expected", async () => {
    const { provider } = await connectedProvider({ signPsbts: vi.fn(async () => "not-an-array") });

    await expect(provider.signPsbt(PSBT_HEX, { autoFinalized: false })).rejects.toMatchObject({
      code: ERROR_CODES.SIGNATURE_EXTRACT_ERROR,
      wallet: "OKX",
      message:
        "OKX Wallet returned a malformed response to a single-PSBT batch signing request: expected an array holding exactly one non-empty signed PSBT hex, got string",
    });
  });

  it("rejects a batch response with the wrong number of PSBTs", async () => {
    const { provider } = await connectedProvider({ signPsbts: vi.fn(async () => ["a", "b"]) });

    const failure = provider.signPsbt(PSBT_HEX, { autoFinalized: false });

    await expect(failure).rejects.toBeInstanceOf(WalletError);
    await expect(failure).rejects.toMatchObject({
      code: ERROR_CODES.SIGNATURE_EXTRACT_ERROR,
      message:
        "OKX Wallet returned a malformed response to a single-PSBT batch signing request: expected an array holding exactly one non-empty signed PSBT hex, got an array of 2",
    });
  });

  it("rejects a batch response holding an empty string", async () => {
    const { provider } = await connectedProvider({ signPsbts: vi.fn(async () => [""]) });

    await expect(provider.signPsbt(PSBT_HEX, { autoFinalized: false })).rejects.toMatchObject({
      code: ERROR_CODES.SIGNATURE_EXTRACT_ERROR,
      message:
        "OKX Wallet returned a malformed response to a single-PSBT batch signing request: expected an array holding exactly one non-empty signed PSBT hex, got an array holding an empty string",
    });
  });
});

describe("OKXProvider.signPsbts", () => {
  it("maps a bare autoFinalized:false entry to a non-finalized request, as signPsbt does", async () => {
    const { provider, bitcoinSignet } = await connectedProvider({
      signPsbts: vi.fn(async () => ["signed-a", "signed-b"]),
    });

    const signed = await provider.signPsbts(
      [PSBT_HEX, PSBT_HEX],
      [{ autoFinalized: false }, { signInputs: [{ index: 0, publicKey: PUBKEY, useTweakedSigner: false }] }],
    );

    expect(signed).toEqual(["signed-a", "signed-b"]);
    expect(bitcoinSignet.signPsbts).toHaveBeenCalledWith(
      [PSBT_HEX, PSBT_HEX],
      [
        { autoFinalized: false, toSignInputs: undefined },
        { autoFinalized: false, toSignInputs: [SCRIPT_PATH_TO_SIGN_INPUT] },
      ],
    );
  });
});
