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
  getVpExplorerHomeUrl,
  getVpExplorerProviderUrl,
  getVpExplorerVaultUrl,
} from "../explorer";

const EXPLORER_BASE = "https://explorer.test.example";

describe("getVpExplorerProviderUrl", () => {
  beforeEach(() => {
    envMock.ENV.VP_EXPLORER_URL = undefined;
  });

  it("builds a /provider/<address> URL against the configured explorer base", () => {
    envMock.ENV.VP_EXPLORER_URL = EXPLORER_BASE;
    const address = "0x1234567890abcdef1234567890abcdef12345678";

    expect(getVpExplorerProviderUrl(address)).toBe(
      `${EXPLORER_BASE}/provider/${address}`,
    );
  });

  it("lowercases a checksummed address (the explorer keys addresses lowercase)", () => {
    envMock.ENV.VP_EXPLORER_URL = EXPLORER_BASE;

    expect(
      getVpExplorerProviderUrl("0xAbC1230000000000000000000000000000000DEF"),
    ).toBe(
      `${EXPLORER_BASE}/provider/0xabc1230000000000000000000000000000000def`,
    );
  });

  it("returns undefined when the explorer base URL is not configured", () => {
    envMock.ENV.VP_EXPLORER_URL = undefined;

    expect(
      getVpExplorerProviderUrl("0x1234567890abcdef1234567890abcdef12345678"),
    ).toBeUndefined();
  });

  it("returns undefined for an empty address (no broken /provider/ link)", () => {
    envMock.ENV.VP_EXPLORER_URL = EXPLORER_BASE;

    expect(getVpExplorerProviderUrl("")).toBeUndefined();
  });
});

describe("getVpExplorerVaultUrl", () => {
  beforeEach(() => {
    envMock.ENV.VP_EXPLORER_URL = undefined;
  });

  it("builds a /vault/<id> URL against the configured explorer base", () => {
    envMock.ENV.VP_EXPLORER_URL = EXPLORER_BASE;
    const vaultId =
      "0x134a8d1a5ba0673a3ecab0522336fce3585082161af260a2debc09574c26b0d4";

    expect(getVpExplorerVaultUrl(vaultId)).toBe(
      `${EXPLORER_BASE}/vault/${vaultId}`,
    );
  });

  it("lowercases the id (the explorer keys vault ids lowercase)", () => {
    envMock.ENV.VP_EXPLORER_URL = EXPLORER_BASE;

    expect(getVpExplorerVaultUrl("0xABCDEF")).toBe(
      `${EXPLORER_BASE}/vault/0xabcdef`,
    );
  });

  it("returns undefined when the explorer base URL is not configured", () => {
    expect(getVpExplorerVaultUrl("0xabc")).toBeUndefined();
  });

  it("returns undefined for an empty/undefined vault id", () => {
    envMock.ENV.VP_EXPLORER_URL = EXPLORER_BASE;

    expect(getVpExplorerVaultUrl("")).toBeUndefined();
    expect(getVpExplorerVaultUrl(undefined)).toBeUndefined();
  });
});

describe("getVpExplorerHomeUrl", () => {
  beforeEach(() => {
    envMock.ENV.VP_EXPLORER_URL = undefined;
  });

  it("returns the configured explorer base URL", () => {
    envMock.ENV.VP_EXPLORER_URL = EXPLORER_BASE;

    expect(getVpExplorerHomeUrl()).toBe(EXPLORER_BASE);
  });

  it("returns undefined when the explorer base URL is not configured", () => {
    expect(getVpExplorerHomeUrl()).toBeUndefined();
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
