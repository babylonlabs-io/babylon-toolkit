import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getVaultFromChainWithGrace,
  type OnChainVaultData,
} from "@/clients/eth-contract/btc-vault-registry/query";
import { COPY } from "@/copy";
import { ActivationNotPossibleError } from "@/utils/errors";

import { assertActivationFollowsConstructionOrder } from "../activationOrder";

vi.mock("@/clients/eth-contract/btc-vault-registry/query", async () => {
  const actual = await vi.importActual<
    typeof import("@/clients/eth-contract/btc-vault-registry/query")
  >("@/clients/eth-contract/btc-vault-registry/query");
  return { ...actual, getVaultFromChainWithGrace: vi.fn() };
});

const SACRIFICIAL_ID = `0x${"1".repeat(64)}` as Hex;
const PROTECTED_ID = `0x${"2".repeat(64)}` as Hex;

function vault(
  htlcVout: number,
  status: OnChainBtcVaultStatus,
): OnChainVaultData {
  return {
    depositor: `0x${"a".repeat(40)}`,
    depositorBtcPubKey: `0x${"b".repeat(64)}`,
    depositorSignedPeginTx: "0x01",
    applicationEntryPoint: `0x${"c".repeat(40)}`,
    vaultProvider: `0x${"d".repeat(40)}`,
    universalChallengersVersion: 1,
    appVaultKeepersVersion: 1,
    offchainParamsVersion: 1,
    vaultCoreVersion: 1,
    hashlock: `0x${"e".repeat(64)}`,
    htlcVout,
    amount: 1n,
    prePeginTxHash: `0x${"f".repeat(64)}`,
    vaultProviderCommissionBps: 1,
    status,
    createdAt: 1n,
  };
}

describe("assertActivationFollowsConstructionOrder", () => {
  beforeEach(() => {
    vi.mocked(getVaultFromChainWithGrace).mockReset();
  });

  it("refuses index 1 while index 0 is not activated", async () => {
    vi.mocked(getVaultFromChainWithGrace).mockResolvedValue(
      vault(0, OnChainBtcVaultStatus.VERIFIED),
    );

    await expect(
      assertActivationFollowsConstructionOrder(
        PROTECTED_ID,
        vault(1, OnChainBtcVaultStatus.VERIFIED),
        [PROTECTED_ID, SACRIFICIAL_ID],
      ),
    ).rejects.toThrow(COPY.pegin.messages.activationOrderBlocked);
  });

  it("allows index 1 after index 0 is active", async () => {
    vi.mocked(getVaultFromChainWithGrace).mockResolvedValue(
      vault(0, OnChainBtcVaultStatus.ACTIVE),
    );

    await expect(
      assertActivationFollowsConstructionOrder(
        PROTECTED_ID,
        vault(1, OnChainBtcVaultStatus.VERIFIED),
        [PROTECTED_ID, SACRIFICIAL_ID],
      ),
    ).resolves.toBeUndefined();
  });

  it("allows index 1 when index 0 expired and can never be queued", async () => {
    vi.mocked(getVaultFromChainWithGrace).mockResolvedValue(
      vault(0, OnChainBtcVaultStatus.EXPIRED),
    );

    await expect(
      assertActivationFollowsConstructionOrder(
        PROTECTED_ID,
        vault(1, OnChainBtcVaultStatus.VERIFIED),
        [PROTECTED_ID, SACRIFICIAL_ID],
      ),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the lower construction index is missing", async () => {
    await expect(
      assertActivationFollowsConstructionOrder(
        PROTECTED_ID,
        vault(1, OnChainBtcVaultStatus.VERIFIED),
        [PROTECTED_ID],
      ),
    ).rejects.toThrow(COPY.pegin.messages.activationOrderUnavailable);
  });

  it("reports a failed sibling read as unavailable, not as its raw error", async () => {
    vi.mocked(getVaultFromChainWithGrace).mockRejectedValue(
      new Error("execution reverted: 0xdeadbeef"),
    );

    await expect(
      assertActivationFollowsConstructionOrder(
        PROTECTED_ID,
        vault(1, OnChainBtcVaultStatus.VERIFIED),
        [PROTECTED_ID, SACRIFICIAL_ID],
      ),
    ).rejects.toThrow(COPY.pegin.messages.activationOrderUnavailable);
  });

  it("treats a sibling with another depositor as terminal", async () => {
    vi.mocked(getVaultFromChainWithGrace).mockResolvedValue({
      ...vault(0, OnChainBtcVaultStatus.ACTIVE),
      depositor: `0x${"9".repeat(40)}`,
    });

    await expect(
      assertActivationFollowsConstructionOrder(
        PROTECTED_ID,
        vault(1, OnChainBtcVaultStatus.VERIFIED),
        [PROTECTED_ID, SACRIFICIAL_ID],
      ),
    ).rejects.toBeInstanceOf(ActivationNotPossibleError);
  });

  it("fails closed when the target construction index is malformed", async () => {
    await expect(
      assertActivationFollowsConstructionOrder(
        PROTECTED_ID,
        vault(Number.NaN, OnChainBtcVaultStatus.VERIFIED),
        [PROTECTED_ID, SACRIFICIAL_ID],
      ),
    ).rejects.toThrow(COPY.pegin.messages.activationOrderInconsistent);

    expect(getVaultFromChainWithGrace).not.toHaveBeenCalled();
  });
});
