import {
  deriveVaultRoot,
  expandAuthAnchor,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  VpTokenRegistry,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureAuthenticatedVpClient } from "../ensureAuthenticatedVpClient";

const ON_CHAIN_PRE_PEGIN_HASH = "0xmatching_pre_pegin_hash";
const ATTACKER_HASH = "0xattacker_chosen_hash";

const mockGetVaultProviderBtcPubKey = vi.fn();
const mockGetVaultProtocolInfo = vi.fn();
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultProviderBtcPubKey: mockGetVaultProviderBtcPubKey,
    getVaultProtocolInfo: mockGetVaultProtocolInfo,
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
    deriveVaultRoot: vi.fn(),
    expandAuthAnchor: vi.fn(() => new Uint8Array(32).fill(0xab)),
  };
});

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: vi.fn(() => ON_CHAIN_PRE_PEGIN_HASH),
}));

const PEGIN_TXID = "a".repeat(64);
const PEGIN_TX_HASH = `0x${PEGIN_TXID}`;
const VAULT_ID = `0x${"f".repeat(64)}` as Hex;
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
    mockGetVaultProtocolInfo.mockResolvedValue({
      prePeginTxHash: ON_CHAIN_PRE_PEGIN_HASH,
    });
    vi.mocked(calculateBtcTxHash).mockReturnValue(ON_CHAIN_PRE_PEGIN_HASH);
    (deriveVaultRoot as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Uint8Array(32).fill(0xcc),
    );
    (expandAuthAnchor as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
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
      vaultId: VAULT_ID,
      unsignedPrePeginTxHex: "deadbeef",
      peginTxHash: PEGIN_TX_HASH,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: "ab".repeat(32),
    });

    expect(mockGetVaultProtocolInfo).toHaveBeenCalledOnce();
    expect(mockGetVaultProtocolInfo).toHaveBeenCalledWith(VAULT_ID);
    expect(deriveVaultRoot).toHaveBeenCalledOnce();
    expect(mockGetVaultProviderBtcPubKey).toHaveBeenCalledOnce();
    expect(vpTokenRegistry.peek(PEGIN_TXID)).toBeDefined();
  });

  it("cold-start mismatch: throws before deriveVaultRoot when indexer tx hash does not match on-chain", async () => {
    vi.mocked(calculateBtcTxHash).mockReturnValue(ATTACKER_HASH);

    await expect(
      ensureAuthenticatedVpClient({
        btcWallet: fakeWallet,
        vaultId: VAULT_ID,
        unsignedPrePeginTxHex: "attackerhex",
        peginTxHash: PEGIN_TX_HASH,
        providerAddress: PROVIDER_ADDRESS,
        depositorBtcPubkey: "ab".repeat(32),
      }),
    ).rejects.toThrow(/Pre-PegIn transaction hash mismatch/);

    expect(mockGetVaultProtocolInfo).toHaveBeenCalledOnce();
    expect(deriveVaultRoot).not.toHaveBeenCalled();
    expect(mockGetVaultProviderBtcPubKey).not.toHaveBeenCalled();
    expect(vpTokenRegistry.peek(PEGIN_TXID)).toBeUndefined();
  });

  it("cache hit: skips wallet derivation, on-chain prePeginTxHash read, and pubkey fetch", async () => {
    await ensureAuthenticatedVpClient({
      btcWallet: fakeWallet,
      vaultId: VAULT_ID,
      unsignedPrePeginTxHex: "deadbeef",
      peginTxHash: PEGIN_TX_HASH,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: "ab".repeat(32),
    });
    vi.clearAllMocks();

    await ensureAuthenticatedVpClient({
      btcWallet: fakeWallet,
      vaultId: VAULT_ID,
      unsignedPrePeginTxHex: "deadbeef",
      peginTxHash: PEGIN_TX_HASH,
      providerAddress: PROVIDER_ADDRESS,
      depositorBtcPubkey: "ab".repeat(32),
    });

    expect(deriveVaultRoot).not.toHaveBeenCalled();
    expect(mockGetVaultProtocolInfo).not.toHaveBeenCalled();
    expect(mockGetVaultProviderBtcPubKey).not.toHaveBeenCalled();
  });
});
