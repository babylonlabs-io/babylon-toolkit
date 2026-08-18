import { type Hex, zeroAddress } from "viem";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import type {
  VaultBasicInfo,
  VaultRegistryReader,
} from "../../../clients/eth/types";
import {
  PEGIN_ETH_CONFIRMATIONS,
  PeginRegistrationMissingError,
  PeginRegistrationNotFinalError,
  computeRegistrationConfirmations,
  waitForPeginRegistrationDepth,
} from "../peginRegistrationDepth";

const VAULT_ID_A =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const VAULT_ID_B =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;

const DEPOSITOR = "0x1111111111111111111111111111111111111111" as const;
const POLL_MS = 6_000;
/** Mirrors the module-private REGISTRATION_ABSENT_GRACE_POLLS. */
const ABSENT_GRACE_POLLS = 10;

function basicInfo(createdAt: bigint): VaultBasicInfo {
  return {
    depositor: DEPOSITOR,
    depositorBtcPubKey: "0xabcd" as Hex,
    amount: 100_000n,
    vaultProvider: "0x2222222222222222222222222222222222222222",
    status: 0,
    applicationEntryPoint: "0x3333333333333333333333333333333333333333",
    createdAt,
  };
}

/** An unregistered / orphaned record: the contract returns a zero struct. */
function absentInfo(): VaultBasicInfo {
  return { ...basicInfo(0n), depositor: zeroAddress, createdAt: 0n };
}

describe("computeRegistrationConfirmations", () => {
  it("counts the mining block itself as the first confirmation", () => {
    expect(
      computeRegistrationConfirmations({
        currentBlock: 100n,
        createdAtBlock: 100n,
      }),
    ).toBe(1);
  });

  it("reports 8 confirmations seven blocks after the registration block", () => {
    expect(
      computeRegistrationConfirmations({
        currentBlock: 107n,
        createdAtBlock: 100n,
      }),
    ).toBe(8);
  });

  it("clamps to 0 when a reorg puts the registration block above the observed tip", () => {
    expect(
      computeRegistrationConfirmations({
        currentBlock: 100n,
        createdAtBlock: 101n,
      }),
    ).toBe(0);
  });
});

describe("PEGIN_ETH_CONFIRMATIONS", () => {
  // Pinned so changing the protocol's reorg tolerance is a deliberate edit
  // with a failing test attached, not a silent tuning tweak.
  it("is 8", () => {
    expect(PEGIN_ETH_CONFIRMATIONS).toBe(8);
  });
});

describe("waitForPeginRegistrationDepth", () => {
  let getVaultBasicInfo: Mock<(vaultId: Hex) => Promise<VaultBasicInfo>>;
  let getBlockNumber: Mock<() => Promise<bigint>>;
  let reader: VaultRegistryReader;

  beforeEach(() => {
    vi.useFakeTimers();
    getVaultBasicInfo = vi.fn<(vaultId: Hex) => Promise<VaultBasicInfo>>();
    getBlockNumber = vi.fn<() => Promise<bigint>>();
    reader = { getVaultBasicInfo } as unknown as VaultRegistryReader;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves without polling when the registration is already 8 blocks deep", async () => {
    getBlockNumber.mockResolvedValue(107n);
    getVaultBasicInfo.mockResolvedValue(basicInfo(100n));

    const result = await waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
    });

    expect(result.confirmations).toBe(8);
    expect(getBlockNumber).toHaveBeenCalledTimes(1);
    expect(getVaultBasicInfo).toHaveBeenCalledTimes(1);
  });

  it("reads the chain tip before the vault record so the depth is never over-counted", async () => {
    const callOrder: string[] = [];
    getBlockNumber.mockImplementation(async () => {
      callOrder.push("tip");
      return 107n;
    });
    getVaultBasicInfo.mockImplementation(async () => {
      callOrder.push("vault");
      return basicInfo(100n);
    });

    await waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
    });

    expect(callOrder).toEqual(["tip", "vault"]);
  });

  it("keeps polling until the required depth and reports each observed depth", async () => {
    getBlockNumber
      .mockResolvedValueOnce(104n)
      .mockResolvedValueOnce(105n)
      .mockResolvedValueOnce(107n);
    getVaultBasicInfo.mockResolvedValue(basicInfo(100n));
    const onProgress = vi.fn();

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
      onProgress,
    });

    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    await expect(pending).resolves.toMatchObject({ confirmations: 8 });

    expect(onProgress.mock.calls.map(([p]) => p.confirmations)).toEqual([
      5, 6, 8,
    ]);
    expect(onProgress).toHaveBeenLastCalledWith({
      confirmations: 8,
      required: 8,
    });
  });

  it("keeps polling when the first read comes back empty, then proceeds once it appears", async () => {
    // The inline deposit flow calls this milliseconds after a 1-confirmation
    // receipt. A load-balanced pool member one block behind answers with a
    // valid zero struct, which no transport retry can absorb — treating that
    // as terminal would tell a user with a paid registration to start over.
    getBlockNumber.mockResolvedValue(107n);
    getVaultBasicInfo
      .mockResolvedValueOnce(absentInfo())
      .mockResolvedValueOnce(absentInfo())
      .mockResolvedValue(basicInfo(100n));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
    });

    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    await expect(pending).resolves.toMatchObject({ confirmations: 8 });
  });

  it("does not arm the terminal branch when the first poll fails transiently", async () => {
    // A read failure on poll 1 must not leave the never-seen state pinned to
    // "first poll" — the count of absent observations is what gates the
    // terminal branch, and a thrown read is not an observation.
    getBlockNumber
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValue(107n);
    getVaultBasicInfo
      .mockResolvedValueOnce(absentInfo())
      .mockResolvedValue(basicInfo(100n));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
    });

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    await expect(pending).resolves.toMatchObject({ confirmations: 8 });
  });

  it("throws PeginRegistrationMissingError once the grace window is spent", async () => {
    getBlockNumber.mockResolvedValue(107n);
    getVaultBasicInfo.mockResolvedValue(absentInfo());
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(
      PeginRegistrationMissingError,
    );

    await vi.advanceTimersByTimeAsync(POLL_MS * (ABSENT_GRACE_POLLS + 1));
    await assertion;
  });

  it("treats createdAt of 0 as absent rather than as an infinitely deep registration", async () => {
    getBlockNumber.mockResolvedValue(107n);
    // A populated depositor with a zero createdAt would compute as 108
    // confirmations and pass the gate if it were not rejected here. It gets
    // the same grace as a zero struct — a half-populated record from a
    // lagging backend is the same class of event.
    getVaultBasicInfo.mockResolvedValue({ ...basicInfo(0n) });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(
      PeginRegistrationMissingError,
    );

    await vi.advanceTimersByTimeAsync(POLL_MS * (ABSENT_GRACE_POLLS + 1));
    await assertion;
  });

  it("survives a reorg that removes and then re-includes the registration", async () => {
    getBlockNumber
      .mockResolvedValueOnce(104n) // seen at 5 confirmations
      .mockResolvedValueOnce(105n) // reorged out
      .mockResolvedValueOnce(106n) // still out
      .mockResolvedValueOnce(107n) // re-included at a later block
      .mockResolvedValueOnce(114n); // now deep enough again
    getVaultBasicInfo
      .mockResolvedValueOnce(basicInfo(100n))
      .mockResolvedValueOnce(absentInfo())
      .mockResolvedValueOnce(absentInfo())
      .mockResolvedValueOnce(basicInfo(107n))
      .mockResolvedValueOnce(basicInfo(107n));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const onProgress = vi.fn();

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
      onProgress,
    });

    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    await expect(pending).resolves.toMatchObject({ confirmations: 8 });

    // The counter rewinds to 0 across the reorg and climbs again from the
    // new inclusion block, rather than the wait aborting.
    expect(onProgress.mock.calls.map(([p]) => p.confirmations)).toEqual([
      5, 0, 0, 1, 8,
    ]);
  });

  it("retries a transient read failure instead of failing the deposit", async () => {
    getBlockNumber
      .mockRejectedValueOnce(new Error("RPC timeout"))
      .mockResolvedValueOnce(107n);
    getVaultBasicInfo.mockResolvedValue(basicInfo(100n));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
    });

    await vi.advanceTimersByTimeAsync(POLL_MS);
    await expect(pending).resolves.toMatchObject({ confirmations: 8 });
  });

  it("throws PeginRegistrationNotFinalError when the depth is not reached in the budget", async () => {
    getBlockNumber.mockResolvedValue(100n);
    getVaultBasicInfo.mockResolvedValue(basicInfo(100n));

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
      timeoutMs: POLL_MS * 3,
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(
      PeginRegistrationNotFinalError,
    );

    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    await assertion;
  });

  it("stops polling promptly when aborted", async () => {
    const controller = new AbortController();
    getBlockNumber.mockResolvedValue(100n);
    getVaultBasicInfo.mockResolvedValue(basicInfo(100n));

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A],
      signal: controller.signal,
    });
    const assertion = expect(pending).rejects.toThrow(/Aborted/);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    const callsAtAbort = getBlockNumber.mock.calls.length;
    controller.abort();
    await assertion;

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(getBlockNumber).toHaveBeenCalledTimes(callsAtAbort);
  });

  it("gates on the shallowest vault when a batch registered several", async () => {
    getBlockNumber.mockResolvedValueOnce(107n).mockResolvedValueOnce(110n);
    // Vault B is three blocks younger, so the batch is not final at tip 107
    // even though vault A alone would be.
    getVaultBasicInfo
      .mockResolvedValueOnce(basicInfo(100n))
      .mockResolvedValueOnce(basicInfo(103n))
      .mockResolvedValueOnce(basicInfo(100n))
      .mockResolvedValueOnce(basicInfo(103n));
    const onProgress = vi.fn();

    const pending = waitForPeginRegistrationDepth({
      vaultRegistryReader: reader,
      getBlockNumber,
      vaultIds: [VAULT_ID_A, VAULT_ID_B],
      onProgress,
    });

    await vi.advanceTimersByTimeAsync(POLL_MS);
    await expect(pending).resolves.toMatchObject({ confirmations: 8 });

    expect(onProgress.mock.calls.map(([p]) => p.confirmations)).toEqual([5, 8]);
  });

  it("rejects an empty vault list rather than vacuously reporting finality", async () => {
    await expect(
      waitForPeginRegistrationDepth({
        vaultRegistryReader: reader,
        getBlockNumber,
        vaultIds: [],
      }),
    ).rejects.toThrow(/at least one vault ID/);
  });
});
