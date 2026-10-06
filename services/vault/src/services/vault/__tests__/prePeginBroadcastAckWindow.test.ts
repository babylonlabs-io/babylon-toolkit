import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { VaultLifecycleStateError } from "@/utils/errors";

import { assertPrePeginBroadcastAckWindowOpen } from "../prePeginBroadcastAckWindow";

const mockGetHeadBlockNumber = vi.hoisted(() => vi.fn());
const mockHeadAgeSeconds = vi.hoisted(() => ({ value: 0n }));
vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    // The head is read as a block with a timestamp: "now" unless a test sets
    // `mockHeadAgeSeconds` to simulate a node that is behind.
    getPublicClient: () => ({
      getBlock: async () => ({
        number: await mockGetHeadBlockNumber(),
        timestamp:
          BigInt(Math.floor(Date.now() / 1000)) - mockHeadAgeSeconds.value,
      }),
    }),
  },
}));

const mockGetTBVProtocolParams = vi.hoisted(() => vi.fn());
const mockGetOffchainParamsByVersion = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn().mockResolvedValue({
    getTBVProtocolParams: mockGetTBVProtocolParams,
    getOffchainParamsByVersion: mockGetOffchainParamsByVersion,
  }),
}));

const VAULT_ID = "0xvault" as Hex;
const STAMPED_OFFCHAIN_PARAMS_VERSION = 7;
// createdAt 1000 + timeout 1000: the contract accepts an ACK mined at block
// 2000 or earlier. At depth 6 the margin is 425 blocks (6 × 10 min + 10 min
// of pipeline + 15 min of finalized event delivery, in 12 s slots), so head
// 1574 (426 left) is the last that broadcasts and head 1575 (425 left) the
// first that refuses.
const CREATED_AT = 1_000n;
const PEGIN_ACK_TIMEOUT = 1_000n;
const ACK_DEADLINE_BLOCK = 2_000n;
const LAST_BROADCASTING_HEAD = 1_574n;
const FIRST_REFUSING_HEAD = 1_575n;

const target = {
  vaultId: VAULT_ID,
  status: OnChainBtcVaultStatus.PENDING,
  createdAt: CREATED_AT,
  offchainParamsVersion: STAMPED_OFFCHAIN_PARAMS_VERSION,
};

describe("assertPrePeginBroadcastAckWindowOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadAgeSeconds.value = 0n;
    mockGetHeadBlockNumber.mockResolvedValue(CREATED_AT);
    mockGetTBVProtocolParams.mockResolvedValue({
      pegInAckTimeout: PEGIN_ACK_TIMEOUT,
    });
    mockGetOffchainParamsByVersion.mockResolvedValue({ minPrepeginDepth: 6 });
    // The mocked head and the head reader each read the clock. Freeze it, so
    // a second that ticks over between the two reads cannot add a block of
    // lag and move these tests off the edge they pin.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes while a comfortable margin remains", async () => {
    await expect(
      assertPrePeginBroadcastAckWindowOpen(target),
    ).resolves.toBeUndefined();
  });

  it("passes on the last head that still clears the margin", async () => {
    mockGetHeadBlockNumber.mockResolvedValue(LAST_BROADCASTING_HEAD);

    await expect(
      assertPrePeginBroadcastAckWindowOpen(target),
    ).resolves.toBeUndefined();
  });

  it("refuses at the first head that leaves only the margin, reporting the still-PENDING status", async () => {
    mockGetHeadBlockNumber.mockResolvedValue(FIRST_REFUSING_HEAD);

    const caught = await assertPrePeginBroadcastAckWindowOpen(target).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    expect(caught).toMatchObject({
      reason: "ack-window-elapsed",
      stage: "broadcast",
      role: "target",
      // The ACTUAL on-chain status — report lag leaves it PENDING, and the
      // error must not falsify EXPIRED.
      status: OnChainBtcVaultStatus.PENDING,
      vaultId: VAULT_ID,
    });
    // Actionable: the deadline, the head it was measured from, the margin.
    expect((caught as Error).message).toContain(`${ACK_DEADLINE_BLOCK}`);
    expect((caught as Error).message).toContain(`${FIRST_REFUSING_HEAD}`);
    expect((caught as Error).message).toContain("425");
    expect((caught as Error).message).toContain(VAULT_ID);
  });

  it("refuses once the deadline itself has passed", async () => {
    mockGetHeadBlockNumber.mockResolvedValue(ACK_DEADLINE_BLOCK + 500n);

    await expect(
      assertPrePeginBroadcastAckWindowOpen(target),
    ).rejects.toMatchObject({ reason: "ack-window-elapsed" });
  });

  it("counts the head's possible lag against the margin", async () => {
    // 1565 alone leaves 435 blocks. A head 120 s old may lag by 10, so the
    // chain may already be at 1575, where only the margin is left.
    mockGetHeadBlockNumber.mockResolvedValue(1_565n);
    mockHeadAgeSeconds.value = 120n;

    await expect(
      assertPrePeginBroadcastAckWindowOpen(target),
    ).rejects.toMatchObject({ reason: "ack-window-elapsed" });
  });

  it("sizes the margin from the vault's stamped offchain-params version", async () => {
    // The stamped version needs 12 confirmations (margin 725); any other
    // version would need 6 (margin 425). Head 1400 leaves 600 blocks: enough
    // under the wrong version, not under the stamped one.
    mockGetOffchainParamsByVersion.mockImplementation(
      async (version: number) => ({
        minPrepeginDepth: version === STAMPED_OFFCHAIN_PARAMS_VERSION ? 12 : 6,
      }),
    );
    mockGetHeadBlockNumber.mockResolvedValue(1_400n);

    await expect(
      assertPrePeginBroadcastAckWindowOpen(target),
    ).rejects.toMatchObject({ reason: "ack-window-elapsed" });
  });

  // Every read failure fails closed with the copy body as the message — the
  // only text that may reach the depositor — and the node's own words kept as
  // the cause for the log.
  const WINDOW_UNAVAILABLE = COPY.deposit.errors.broadcastAckWindowUnavailable;

  async function rejection(): Promise<unknown> {
    return assertPrePeginBroadcastAckWindowOpen(target).then(
      () => null,
      (err: unknown) => err,
    );
  }

  it("fails closed when the head read rejects", async () => {
    mockGetHeadBlockNumber.mockRejectedValue(new Error("rpc unavailable"));

    const caught = await rejection();

    expect(caught).toMatchObject({
      message: WINDOW_UNAVAILABLE.body,
      cause: { message: "rpc unavailable" },
    });
  });

  it("fails closed when the head is too old to measure the window from", async () => {
    // A node that is behind returns an old head, and each block of lag adds
    // a block to the room left.
    mockHeadAgeSeconds.value = 121n;

    const caught = await rejection();

    expect(caught).toMatchObject({
      message: WINDOW_UNAVAILABLE.body,
      cause: { message: expect.stringMatching(/stale/) },
    });
  });

  it("fails closed when the head is below the vault's registration block", async () => {
    mockGetHeadBlockNumber.mockResolvedValue(CREATED_AT - 1n);

    const caught = await rejection();

    expect(caught).toMatchObject({
      message: WINDOW_UNAVAILABLE.body,
      cause: { message: expect.stringMatching(/below/) },
    });
  });

  it("fails closed when the protocol-params read rejects", async () => {
    mockGetTBVProtocolParams.mockRejectedValue(new Error("params unavailable"));

    const caught = await rejection();

    expect(caught).toMatchObject({
      message: WINDOW_UNAVAILABLE.body,
      cause: { message: "params unavailable" },
    });
  });

  it("fails closed when the stamped offchain-params read rejects", async () => {
    mockGetOffchainParamsByVersion.mockRejectedValue(
      new Error("offchain params unavailable"),
    );

    const caught = await rejection();

    expect(caught).toMatchObject({
      message: WINDOW_UNAVAILABLE.body,
      cause: { message: "offchain params unavailable" },
    });
  });

  it("does not wrap the ack-window refusal itself", async () => {
    // The typed refusal must keep its fields so the mapper can route it.
    mockGetHeadBlockNumber.mockResolvedValue(FIRST_REFUSING_HEAD);

    const caught = await rejection();

    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    expect((caught as Error).message).not.toBe(WINDOW_UNAVAILABLE.body);
  });
});
