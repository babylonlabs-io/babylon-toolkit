import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  ENV: { VP_EXPLORER_URL: undefined as string | undefined },
}));

// `vi.hoisted` runs BEFORE module imports, so initializers must not
// reference imported symbols. Use string literals here — the BTC network
// value is a string enum whose `SIGNET`/`MAINNET` members are exactly
// "signet"/"mainnet" at runtime (see wallet-connector `Network`).
const btcNetworkMock = vi.hoisted(() => ({
  current: "signet" as string,
}));

vi.mock("@/config/env", () => envMock);

vi.mock("@/config", () => ({
  getBTCNetwork: () => btcNetworkMock.current,
}));

import {
  getBtcExplorerAddressUrl,
  getBtcExplorerTxUrl,
  getVpExplorerProviderUrl,
} from "../explorer";

describe("getVpExplorerProviderUrl", () => {
  beforeEach(() => {
    envMock.ENV.VP_EXPLORER_URL = undefined;
  });

  it("builds a /provider/<address> URL against the configured explorer base", () => {
    envMock.ENV.VP_EXPLORER_URL = "https://explorer.test.example";
    const address = "0x1234567890abcdef1234567890abcdef12345678";

    expect(getVpExplorerProviderUrl(address)).toBe(
      `https://explorer.test.example/provider/${address}`,
    );
  });

  it("returns undefined when the explorer base URL is not configured", () => {
    envMock.ENV.VP_EXPLORER_URL = undefined;

    expect(
      getVpExplorerProviderUrl("0x1234567890abcdef1234567890abcdef12345678"),
    ).toBeUndefined();
  });
});

describe("BTC explorer URLs ignore the mempool API host", () => {
  it("uses mempool.space/signet for signet, even when the API host is a self-hosted mirror", () => {
    btcNetworkMock.current = "signet";

    expect(
      getBtcExplorerAddressUrl(
        "tb1pm4qdd3w3yk4mtn423ltwnu2k8j0y645vsm0wyyt227nf5pkhna2q90fk8a",
      ),
    ).toBe(
      "https://mempool.space/signet/address/tb1pm4qdd3w3yk4mtn423ltwnu2k8j0y645vsm0wyyt227nf5pkhna2q90fk8a",
    );

    expect(getBtcExplorerTxUrl("0xabcd")).toBe(
      "https://mempool.space/signet/tx/abcd",
    );
  });

  it("uses mempool.space (no network path) for mainnet", () => {
    btcNetworkMock.current = "mainnet";

    expect(getBtcExplorerAddressUrl("bc1qexample")).toBe(
      "https://mempool.space/address/bc1qexample",
    );
    expect(getBtcExplorerTxUrl("dead")).toBe("https://mempool.space/tx/dead");
  });
});
