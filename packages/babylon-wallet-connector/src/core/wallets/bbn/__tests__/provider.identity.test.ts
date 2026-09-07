import { describe, expect, it, vi } from "vitest";

import type { BBNConfig, IBBNProvider } from "@/core/types";
import { KeplrProvider } from "@/core/wallets/bbn/keplr/provider";
import { LeapProvider } from "@/core/wallets/bbn/leap/provider";
import { OKXBabylonProvider } from "@/core/wallets/bbn/okx/provider";

const config = {
  chainId: "bbn-test-5",
  rpc: "https://rpc.example.com",
  chainData: {},
} as BBNConfig;

describe.each([
  ["Keplr", (wallet: unknown) => new KeplrProvider(wallet as ConstructorParameters<typeof KeplrProvider>[0], config)],
  ["Leap", (wallet: unknown) => new LeapProvider(wallet, config)],
  ["OKX", (wallet: unknown) => new OKXBabylonProvider({ keplr: wallet }, config)],
])("%s Babylon provider identity", (_name, createProvider) => {
  it("reads the current key instead of the connection cache", async () => {
    let key = { bech32Address: "bbn1old", pubKey: Uint8Array.from([1, 2, 3]) };
    const wallet = {
      enable: vi.fn(async () => {}),
      getKey: vi.fn(async () => key),
    };
    const provider = createProvider(wallet) as IBBNProvider;

    await provider.connectWallet();
    key = { bech32Address: "bbn1new", pubKey: Uint8Array.from([4, 5, 6]) };

    await expect(provider.getAddress()).resolves.toBe("bbn1new");
    await expect(provider.getPublicKeyHex()).resolves.toBe("040506");
  });
});
