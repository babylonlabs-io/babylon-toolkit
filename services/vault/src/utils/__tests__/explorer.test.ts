import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  ENV: { VP_EXPLORER_URL: undefined as string | undefined },
}));

vi.mock("@/config/env", () => envMock);

import { getVpExplorerProviderUrl } from "../explorer";

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
