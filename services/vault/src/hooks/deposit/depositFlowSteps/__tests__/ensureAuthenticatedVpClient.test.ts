import { deriveAuthAnchor } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  VpTokenRegistry,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureAuthenticatedVpClient } from "../ensureAuthenticatedVpClient";

const mockGetVaultProviderBtcPubKey = vi.fn();
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultProviderBtcPubKey: mockGetVaultProviderBtcPubKey,
  }),
}));

vi.mock("@/utils/rpc", () => ({
  getVpProxyUrl: (addr: string) => `https://proxy.test/rpc/${addr}`,
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@babylonlabs-io/ts-sdk/tbv/core")>();
  return {
    ...actual,
    parseFundingOutpointsFromTx: () => [{ txid: new Uint8Array(32), vout: 0 }],
    deriveAuthAnchor: vi.fn(),
  };
});

const PEGIN_TXID = "a".repeat(64);
const PEGIN_TX_HASH = `0x${PEGIN_TXID}`;
const PROVIDER_ADDRESS = `0x${"1".repeat(40)}`;
const VALID_XONLY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const fakeWallet = {
  deriveContextHash: vi.fn(),
} as never;

describe("ensureAuthenticatedVpClient", () => {
  beforeEach(() => {
    (vpTokenRegistry as VpTokenRegistry).clear();
    mockGetVaultProviderBtcPubKey.mockResolvedValue(VALID_XONLY);
    (deriveAuthAnchor as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Uint8Array(32).fill(0xab),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    (vpTokenRegistry as VpTokenRegistry).clear();
  });

  it("cold-start: derives the auth anchor (one popup) and fetches the pubkey on cache miss", async () => {
    await ensureAuthenticatedVpClient({
      btcWallet: fakeWallet,
      unsignedPrePeginTxHex: "deadbeef",
      peginTxHash: PEGIN_TX_HASH,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: "ab".repeat(32),
    });

    expect(deriveAuthAnchor).toHaveBeenCalledOnce();
    expect(mockGetVaultProviderBtcPubKey).toHaveBeenCalledOnce();
    expect(vpTokenRegistry.peek(PEGIN_TXID)).toBeDefined();
  });

  it("cache hit: skips wallet derivation and on-chain read", async () => {
    await ensureAuthenticatedVpClient({
      btcWallet: fakeWallet,
      unsignedPrePeginTxHex: "deadbeef",
      peginTxHash: PEGIN_TX_HASH,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: "ab".repeat(32),
    });
    vi.clearAllMocks();

    await ensureAuthenticatedVpClient({
      btcWallet: fakeWallet,
      unsignedPrePeginTxHex: "deadbeef",
      peginTxHash: PEGIN_TX_HASH,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: "ab".repeat(32),
    });

    expect(deriveAuthAnchor).not.toHaveBeenCalled();
    expect(mockGetVaultProviderBtcPubKey).not.toHaveBeenCalled();
  });
});
