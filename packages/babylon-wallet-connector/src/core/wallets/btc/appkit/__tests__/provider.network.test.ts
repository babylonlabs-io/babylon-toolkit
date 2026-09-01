import { afterEach, describe, expect, it, vi } from "vitest";

import type { BTCConfig } from "@/core/types";
import { Network } from "@/core/types";

import { APPKIT_BTC_CONNECTED_EVENT } from "../constants";
import { getCaipNetworkForNetwork } from "../network";
import { AppKitBTCProvider } from "../provider";
import { __resetSharedBtcAppKitConfigForTests, setSharedBtcAppKitConfig } from "../sharedConfig";

interface NetworkState {
  caipNetwork?: {
    chainNamespace: string;
    caipNetworkId: string;
  };
}

afterEach(() => {
  __resetSharedBtcAppKitConfigForTests();
});

describe("AppKitBTCProvider network events", () => {
  it("emits only after the active BTC network changes", async () => {
    const connectionEvents = new EventTarget();
    const unsubscribeNetwork = vi.fn();
    let networkListener: ((state: NetworkState) => void) | undefined;
    const modal = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      subscribeNetwork: vi.fn((listener: (state: NetworkState) => void) => {
        networkListener = listener;
        return unsubscribeNetwork;
      }),
    };
    setSharedBtcAppKitConfig({
      modal: modal as never,
      adapter: {} as never,
      network: "signet",
      connectionEvents,
    });
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);
    const onNetworkChanged = vi.fn();
    provider.on("networkChanged", onNetworkChanged);

    const connection = provider.connectWallet();
    connectionEvents.dispatchEvent(
      new CustomEvent(APPKIT_BTC_CONNECTED_EVENT, {
        detail: { address: "bc1pdepositor", publicKey: `02${"a".repeat(64)}` },
      }),
    );
    await connection;

    networkListener?.({ caipNetwork: { chainNamespace: "eip155", caipNetworkId: "eip155:1" } });
    const signetId = getCaipNetworkForNetwork("signet").caipNetworkId;
    const mainnetId = getCaipNetworkForNetwork("mainnet").caipNetworkId;
    networkListener?.({ caipNetwork: { chainNamespace: "bip122", caipNetworkId: signetId } });
    expect(onNetworkChanged).not.toHaveBeenCalled();

    networkListener?.({ caipNetwork: { chainNamespace: "bip122", caipNetworkId: mainnetId } });
    expect(onNetworkChanged).toHaveBeenCalledWith(mainnetId);

    await provider.disconnect();
    expect(unsubscribeNetwork).toHaveBeenCalledTimes(1);
  });
});
