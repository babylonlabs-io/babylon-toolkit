import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "@/models/peginStateMachine";
import { getSignedGraphFingerprint } from "@/storage/peginStorage";
import type { VaultActivity } from "@/types/activity";
import { getExpiredArtifactDownloadParams } from "@/utils/artifactDownloadParams";

const featureFlagsMock = vi.hoisted(() => ({
  isHttpArtifactDownloadsEnabled: true,
}));
vi.mock("@/config/featureFlags", () => ({ default: featureFlagsMock }));

vi.mock("@/storage/peginStorage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/storage/peginStorage")>()),
  getSignedGraphFingerprint: vi.fn(),
}));

const ETH_ADDRESS = "0x1111111111111111111111111111111111111111";
const VAULT_ID = `0x${"aa".repeat(32)}` as Hex;
const PEGIN_TXID = `0x${"bb".repeat(32)}` as Hex;

const EXPIRED_ACTIVITY: VaultActivity = {
  id: VAULT_ID,
  collateral: { amount: "0.1", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  peginTxHash: PEGIN_TXID,
  contractStatus: ContractStatus.EXPIRED,
  displayLabel: PEGIN_DISPLAY_LABELS.EXPIRED,
  depositorBtcPubkey: "cd".repeat(32),
  unsignedPrePeginTx: "0xdeadbeef",
  depositorWotsPkHash: "0xwotshash",
  expirationReason: "activation_timeout",
};

describe("getExpiredArtifactDownloadParams", () => {
  beforeEach(() => {
    featureFlagsMock.isHttpArtifactDownloadsEnabled = true;
    vi.mocked(getSignedGraphFingerprint).mockReturnValue({
      status: "found",
      fingerprint: "ee".repeat(32),
    });
  });

  it("returns the download inputs of a vault that expired at activation timeout", () => {
    expect(
      getExpiredArtifactDownloadParams(EXPIRED_ACTIVITY, ETH_ADDRESS),
    ).toEqual({
      vaultId: VAULT_ID,
      providerAddress: "0xprovider",
      peginTxid: PEGIN_TXID,
      depositorPk: "cd".repeat(32),
      unsignedPrePeginTxHex: "0xdeadbeef",
    });
  });

  it("returns the download inputs of an activation-timeout vault redeemed after expiry", () => {
    expect(
      getExpiredArtifactDownloadParams(
        { ...EXPIRED_ACTIVITY, contractStatus: ContractStatus.REDEEMED },
        ETH_ADDRESS,
      ),
    ).not.toBeNull();
  });

  it("returns null for an ack-timeout expiry, which never reached Verified", () => {
    expect(
      getExpiredArtifactDownloadParams(
        { ...EXPIRED_ACTIVITY, expirationReason: "ack_timeout" },
        ETH_ADDRESS,
      ),
    ).toBeNull();
  });

  it("returns null for a vault redeemed at activation without expiring", () => {
    expect(
      getExpiredArtifactDownloadParams(
        {
          ...EXPIRED_ACTIVITY,
          contractStatus: ContractStatus.REDEEMED,
          expirationReason: undefined,
        },
        ETH_ADDRESS,
      ),
    ).toBeNull();
  });

  it("returns null once the vault output is spent after the expired claim", () => {
    expect(
      getExpiredArtifactDownloadParams(
        {
          ...EXPIRED_ACTIVITY,
          contractStatus: ContractStatus.DEPOSITOR_WITHDRAWN,
        },
        ETH_ADDRESS,
      ),
    ).toBeNull();
  });

  it("returns null when artifact downloads do not go over HTTP", () => {
    featureFlagsMock.isHttpArtifactDownloadsEnabled = false;

    expect(
      getExpiredArtifactDownloadParams(EXPIRED_ACTIVITY, ETH_ADDRESS),
    ).toBeNull();
  });

  it("returns null when this device holds no presign fingerprint for the vault", () => {
    vi.mocked(getSignedGraphFingerprint).mockReturnValue({
      status: "no-entry",
    });

    expect(
      getExpiredArtifactDownloadParams(EXPIRED_ACTIVITY, ETH_ADDRESS),
    ).toBeNull();
  });
});
