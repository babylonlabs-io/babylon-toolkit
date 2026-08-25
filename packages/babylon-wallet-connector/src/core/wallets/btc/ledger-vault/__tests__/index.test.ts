import { describe, expect, it } from "vitest";

import { createWallet } from "@/core";
import { Network, type BTCConfig } from "@/core/types";

import metadata from "../index";

const config = { network: Network.SIGNET } as BTCConfig;

describe("ledger-vault wallet metadata — WebHID availability probe", () => {
  it("reports installed on a context with navigator.hid (Chromium)", async () => {
    const wallet = await createWallet({
      metadata,
      context: { navigator: { hid: {} } },
      config,
    });

    expect(wallet.installed).toBe(true);
  });

  it("reports not installed where navigator.hid is absent (Firefox/Safari)", async () => {
    const wallet = await createWallet({
      metadata,
      context: { navigator: {} },
      config,
    });

    expect(wallet.installed).toBe(false);
  });
});
