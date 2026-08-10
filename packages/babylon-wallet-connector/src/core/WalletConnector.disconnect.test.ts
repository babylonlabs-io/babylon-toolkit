import { describe, expect, it, vi } from "vitest";

import { Wallet } from "./Wallet";
import { WalletConnector } from "./WalletConnector";

describe("WalletConnector disconnect", () => {
  it("clears state before provider teardown and emits exactly once under re-entrancy", async () => {
    const connectorRef: {
      current?: WalletConnector<string, any, object>;
    } = {};
    const provider = {
      connectWallet: vi.fn(async () => {}),
      getAddress: vi.fn(async () => "address"),
      getPublicKeyHex: vi.fn(async () => "public-key"),
      disconnect: vi.fn(async () => {
        await connectorRef.current?.disconnect();
      }),
    };
    const wallet = new Wallet({
      id: "wallet",
      name: "Wallet",
      icon: "",
      origin: {},
      provider,
      docs: "",
      networks: [],
    });
    const connector = new WalletConnector("ETH", "Ethereum", "", [wallet], {});
    connectorRef.current = connector;
    const onDisconnect = vi.fn();
    connector.on("disconnect", onDisconnect);
    await connector.connect(wallet);

    await connector.disconnect();

    expect(provider.disconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledOnce();
    expect(onDisconnect).toHaveBeenCalledWith(wallet);
    expect(connector.connectedWallet).toBeNull();
  });
});
