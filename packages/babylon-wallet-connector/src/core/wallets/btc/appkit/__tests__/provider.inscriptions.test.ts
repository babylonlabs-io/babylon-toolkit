import { describe, expect, it } from "vitest";

import type { BTCConfig } from "@/core/types";
import { Network } from "@/core/types";
import { ERROR_CODES } from "@/error";

import { AppKitBTCProvider } from "../provider";

describe("AppKitBTCProvider inscriptions", () => {
  it("rejects getInscriptions with WALLET_METHOD_NOT_SUPPORTED, as AppKit exposes no inscription index", async () => {
    const provider = new AppKitBTCProvider({ network: Network.SIGNET } as BTCConfig);

    await expect(provider.getInscriptions()).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
      wallet: "AppKit",
    });
  });
});
