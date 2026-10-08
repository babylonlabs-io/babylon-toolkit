import { describe, expect, it, vi } from "vitest";

import type { IBTCProvider } from "@/core/types";
import { ERROR_CODES } from "@/error";

import { UtilaProvider } from "../provider";

const CONTEXT_HASH = "ab".repeat(32);
const CONNECTED_KEY = `02${"a".repeat(64)}`;
const OTHER_KEY = `03${"b".repeat(64)}`;

async function connectedProvider(bitcoin: Record<string, unknown>): Promise<UtilaProvider> {
  const provider = new UtilaProvider({
    bitcoin: { connectWallet: vi.fn(async () => {}), ...bitcoin } as unknown as IBTCProvider,
  });
  await provider.connectWallet();
  return provider;
}

describe("UtilaProvider.deriveContextHash account check", () => {
  it("returns the context hash when the connected account is still selected", async () => {
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => "bc1pcurrent"),
      getPublicKeyHex: vi.fn(async () => CONNECTED_KEY),
      deriveContextHash: vi.fn(async () => CONTEXT_HASH),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).resolves.toBe(CONTEXT_HASH);
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when another account is selected once the derive resolves", async () => {
    let selectedKey = CONNECTED_KEY;
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => "bc1pcurrent"),
      getPublicKeyHex: vi.fn(async () => selectedKey),
      deriveContextHash: vi.fn(async () => {
        selectedKey = OTHER_KEY;
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
      wallet: "Utila",
    });
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when an account event fires during the derive, even if the account is selected again", async () => {
    const handlers = new Map<string, () => void>();
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => "bc1pcurrent"),
      getPublicKeyHex: vi.fn(async () => CONNECTED_KEY),
      on: vi.fn((event: string, callback: () => void) => handlers.set(event, callback)),
      deriveContextHash: vi.fn(async () => {
        handlers.get("accountsChanged")?.();
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    });
  });

  it("rejects with WALLET_ACCOUNT_CHANGED when no account is selected once the derive resolves", async () => {
    let address = "bc1pcurrent";
    const provider = await connectedProvider({
      getAddress: vi.fn(async () => address),
      getPublicKeyHex: vi.fn(async () => CONNECTED_KEY),
      deriveContextHash: vi.fn(async () => {
        address = "";
        return CONTEXT_HASH;
      }),
    });

    await expect(provider.deriveContextHash("babylon-btc-vault", "00")).rejects.toMatchObject({
      code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    });
  });
});
