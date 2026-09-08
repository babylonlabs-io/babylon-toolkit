import { describe, expect, it, vi } from "vitest";

import { Wallet } from "@/core/Wallet";
import { WalletConnector } from "@/core/WalletConnector";
import type { IBTCProvider } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

function createWallet(provider: Record<string, unknown>) {
  return new Wallet({
    id: "unisat",
    name: "UniSat",
    icon: "icon",
    docs: "https://docs",
    networks: [],
    origin: null,
    provider: provider as unknown as IBTCProvider,
  });
}

describe("WalletConnector disconnect", () => {
  it("keeps a refused wallet without reporting an error until a local disconnect drops it", async () => {
    const refusal = new WalletError({
      code: ERROR_CODES.SHARED_SESSION_DISCONNECT_REFUSED,
      message: "Bitcoin and Ethereum share one wallet session.",
    });
    const disconnect = vi.fn(async (scope: string) => {
      if (scope === "chain") throw refusal;
    });
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect,
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    const onError = vi.fn();
    const onDisconnect = vi.fn();
    connector.on("error", onError);
    connector.on("disconnect", onDisconnect);

    await expect(connector.disconnect()).rejects.toBe(refusal);

    expect(onError).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(connector.connectedWallet).toBe(wallet);

    await connector.disconnect("local");

    expect(disconnect.mock.calls).toEqual([["chain"], ["local"]]);
    expect(onError).not.toHaveBeenCalled();
    expect(onDisconnect).toHaveBeenCalledWith(wallet);
    expect(connector.connectedWallet).toBeNull();
  });

  it("keeps the wallet and reports a failed chain disconnect as error", async () => {
    const failure = new Error("boom");
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect: vi.fn().mockRejectedValue(failure),
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    const onError = vi.fn();
    const onDisconnect = vi.fn();
    connector.on("error", onError);
    connector.on("disconnect", onDisconnect);

    await expect(connector.disconnect()).rejects.toBe(failure);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onDisconnect).not.toHaveBeenCalled();
    expect(connector.connectedWallet).toBe(wallet);
  });

  it("clears the wallet before it emits disconnect", async () => {
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect: vi.fn().mockResolvedValue(undefined),
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    let walletDuringEvent: unknown = wallet;
    connector.on("disconnect", () => {
      walletDuringEvent = connector.connectedWallet;
    });

    await connector.disconnect();

    expect(walletDuringEvent).toBeNull();
  });

  it("emits disconnect and clears the wallet when the provider disconnects", async () => {
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect: vi.fn().mockResolvedValue(undefined),
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    const onError = vi.fn();
    const onDisconnect = vi.fn();
    connector.on("error", onError);
    connector.on("disconnect", onDisconnect);

    await connector.disconnect();

    expect(onDisconnect).toHaveBeenCalledWith(wallet);
    expect(connector.connectedWallet).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("completes an explicit disconnect-all and reports a provider failure as error", async () => {
    const failure = new Error("boom");
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect: vi.fn().mockRejectedValue(failure),
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    const onError = vi.fn();
    const onDisconnect = vi.fn();
    connector.on("error", onError);
    connector.on("disconnect", onDisconnect);

    await connector.disconnect("all");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onDisconnect).toHaveBeenCalledWith(wallet);
    expect(connector.connectedWallet).toBeNull();
  });

  it("completes a local disconnect and reports a provider failure as error", async () => {
    const failure = new Error("boom");
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect: vi.fn().mockRejectedValue(failure),
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    const onError = vi.fn();
    const onDisconnect = vi.fn();
    connector.on("error", onError);
    connector.on("disconnect", onDisconnect);

    await connector.disconnect("local");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onDisconnect).toHaveBeenCalledWith(wallet);
    expect(connector.connectedWallet).toBeNull();
  });

  it("forwards the scope to the provider and defaults to chain", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect,
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);

    await connector.disconnect("all");
    await connector.connect(wallet);
    await connector.disconnect();

    expect(disconnect.mock.calls).toEqual([["all"], ["chain"]]);
  });

  it("disconnects without a provider disconnect method", async () => {
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    const onDisconnect = vi.fn();
    connector.on("disconnect", onDisconnect);

    await connector.disconnect();

    expect(onDisconnect).toHaveBeenCalledWith(wallet);
    expect(connector.connectedWallet).toBeNull();
  });

  it("emits disconnect once when a local disconnect lands during an in-flight chain disconnect", async () => {
    let settleChainDisconnect!: () => void;
    const chainDisconnect = new Promise<void>((resolve) => {
      settleChainDisconnect = resolve;
    });
    const wallet = createWallet({
      connectWallet: vi.fn().mockResolvedValue(undefined),
      getAddress: vi.fn().mockResolvedValue("bc1p"),
      getPublicKeyHex: vi.fn().mockResolvedValue("02ab"),
      disconnect: vi.fn(async (scope: string) => {
        if (scope === "chain") await chainDisconnect;
      }),
    });
    const connector = new WalletConnector("BTC", "Bitcoin", "icon", [wallet], {});
    await connector.connect(wallet);
    const onDisconnect = vi.fn();
    connector.on("disconnect", onDisconnect);

    const chainScope = connector.disconnect("chain");
    await connector.disconnect("local");
    settleChainDisconnect();
    await chainScope;

    expect(onDisconnect.mock.calls).toEqual([[wallet]]);
    expect(connector.connectedWallet).toBeNull();
  });
});
