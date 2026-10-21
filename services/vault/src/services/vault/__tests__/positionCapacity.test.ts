/**
 * The position-capacity gate: which vaults it sizes, which of the depositor's
 * other vaults it counts, what it asks the application, and that every
 * failure refuses.
 *
 * The HTLC count and the hash binding run for real against transactions built
 * with bitcoinjs-lib; only the chain reads are mocked.
 */

import {
  MempoolNotFoundError,
  OnChainBtcVaultStatus,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { opcodes, script, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadAllowedToDeposit = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/application-entry-point/query", () => ({
  readAllowedToDeposit: mockReadAllowedToDeposit,
}));

const mockGetVaultFromChain = vi.hoisted(() => vi.fn());
const mockGetBtcVaultBasicInfoFromChain = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: mockGetVaultFromChain,
  getBtcVaultBasicInfoFromChain: mockGetBtcVaultBasicInfoFromChain,
}));

const mockGetDepositorVaultIdsFromChain = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/btc-vault-registry/depositorVaultIds", () => ({
  getDepositorVaultIdsFromChain: mockGetDepositorVaultIdsFromChain,
}));

const mockGetProtocolInfoBatch = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getProtocolInfoBatch: mockGetProtocolInfoBatch,
  }),
}));

const mockResolvePinnedReadBlock = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/pinnedReadBlock", () => ({
  resolvePinnedReadBlock: mockResolvePinnedReadBlock,
}));

const mockGetTxInfo = vi.hoisted(() => vi.fn());
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
  >()),
  getTxInfo: mockGetTxInfo,
}));

vi.mock("@/clients/btc/config", () => ({
  getMempoolApiUrl: () => "https://mempool.test/api",
}));

import {
  BatchSiblingMismatchError,
  PositionCapacityExceededError,
  PositionCapacityUnavailableError,
} from "@/utils/errors";

import {
  assertPositionAcceptsBatch,
  assertResumePositionCapacity,
} from "../positionCapacity";

const HTLC = script.compile([opcodes.OP_1, Buffer.alloc(32, 1)]);
const AUTH_ANCHOR = script.compile([opcodes.OP_RETURN, Buffer.alloc(32, 2)]);
const PAY_TO_ANCHOR_PROGRAM = Buffer.from("4e73", "hex");
const CPFP_ANCHOR = script.compile([opcodes.OP_1, PAY_TO_ANCHOR_PROGRAM]);

/** A Pre-PegIn with `htlcCount` HTLCs, an auth anchor and a CPFP anchor. */
function prePegin(htlcCount: number): { hex: string; hash: Hex } {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 7), 0);
  for (let i = 0; i < htlcCount; i++) tx.addOutput(HTLC, 100_000);
  tx.addOutput(AUTH_ANCHOR, 0);
  tx.addOutput(CPFP_ANCHOR, 240);
  return { hex: tx.toHex(), hash: `0x${tx.getId()}` };
}

const ONE_HTLC = prePegin(1);
const TWO_HTLCS = prePegin(2);

const VAULT_ID = `0x${"11".repeat(32)}` as Hex;
const SIBLING_ID = `0x${"22".repeat(32)}` as Hex;
const STRANGER_ID = `0x${"33".repeat(32)}` as Hex;
const DEPOSITOR = "0x00000000000000000000000000000000000000d1";
const OTHER_DEPOSITOR = "0x00000000000000000000000000000000000000d2";
const ENTRY_POINT = "0x00000000000000000000000000000000000000e1";
const OTHER_ENTRY_POINT = "0x00000000000000000000000000000000000000e2";
const OTHER_PRE_PEGIN_TX_HASH = `0x${"bb".repeat(32)}` as Hex;
/** The block every read of one check is pinned to. */
const PINNED_BLOCK = 1_000n;

/** The target at HTLC output 0 of `tx`. */
function targetOf(tx: { hash: Hex }) {
  return {
    depositor: DEPOSITOR,
    amount: 100_000n,
    applicationEntryPoint: ENTRY_POINT,
    prePeginTxHash: tx.hash,
    htlcVout: 0,
  } as const;
}

/** An on-chain vault record as `getVaultFromChain` returns the fields read. */
function onChainVault(fields: {
  prePeginTxHash: Hex;
  htlcVout: number;
  amount?: bigint;
  depositor?: string;
  applicationEntryPoint?: string;
}) {
  return {
    depositor: DEPOSITOR,
    applicationEntryPoint: ENTRY_POINT,
    amount: 50_000n,
    status: 0,
    ...fields,
  };
}

/** Serve the given records for the hash prefilter and the full read. */
function chainHas(records: Record<Hex, ReturnType<typeof onChainVault>>) {
  mockGetProtocolInfoBatch.mockImplementation(async (ids: Hex[]) =>
    ids.map((id) => ({ prePeginTxHash: records[id].prePeginTxHash })),
  );
  mockGetVaultFromChain.mockImplementation(async (id: Hex) => records[id]);
}

/**
 * The depositor's registered vaults as the registry lists them, each with the
 * basic info `getBtcVaultBasicInfoFromChain` returns for it. Only the ids the
 * check asks about are answered.
 */
function depositorHas(
  records: Record<
    Hex,
    {
      /** Raw on-chain status, as the registry returns it. */
      status: number;
      amount: bigint;
      applicationEntryPoint?: string;
    }
  >,
) {
  mockGetDepositorVaultIdsFromChain.mockResolvedValue(Object.keys(records));
  mockGetBtcVaultBasicInfoFromChain.mockImplementation(async (ids: Hex[]) => {
    return new Map(
      ids.map((id) => [
        id.toLowerCase(),
        { applicationEntryPoint: ENTRY_POINT, ...records[id] },
      ]),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProtocolInfoBatch.mockReset();
  mockGetTxInfo.mockReset();
  mockReadAllowedToDeposit.mockReset();
  mockResolvePinnedReadBlock.mockResolvedValue(PINNED_BLOCK);
  mockReadAllowedToDeposit.mockResolvedValue(true);
  mockGetDepositorVaultIdsFromChain.mockResolvedValue([]);
  mockGetBtcVaultBasicInfoFromChain.mockResolvedValue(new Map());
});

describe("assertResumePositionCapacity — the question asked", () => {
  it("passes a full two-vault batch with n=2 and the on-chain sum", async () => {
    chainHas({
      [SIBLING_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 1,
        amount: 50_000n,
      }),
    });

    await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, SIBLING_ID],
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 2n,
        amountToDeposit: 150_000n,
      }),
    );
  });

  it("asks the vault's own entry point about the on-chain depositor's position", async () => {
    await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(ONE_HTLC),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [VAULT_ID],
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith({
      applicationEntryPoint: ENTRY_POINT,
      vaultReceiver: DEPOSITOR,
      nVaultsToDeposit: 1n,
      amountToDeposit: 100_000n,
      blockNumber: PINNED_BLOCK,
    });
  });

  it("refuses with the vault count and amount when the application says no", async () => {
    mockReadAllowedToDeposit.mockResolvedValue(false);

    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(ONE_HTLC),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [VAULT_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityExceededError);
    expect(err).toMatchObject({
      checkpoint: { stage: "broadcast", vaultId: VAULT_ID },
      vaultCount: 1,
      amount: 100_000n,
    });
  });

  it("makes no sibling reads for a single-vault batch", async () => {
    await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(ONE_HTLC),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [VAULT_ID],
    });

    expect(mockGetProtocolInfoBatch).not.toHaveBeenCalled();
    expect(mockGetVaultFromChain).not.toHaveBeenCalled();
  });
});

describe("assertResumePositionCapacity — batch membership and completeness", () => {
  it("refuses an under-listed batch: two HTLCs, only the target listed", async () => {
    await expect(
      assertResumePositionCapacity({
        vaultId: VAULT_ID,
        target: targetOf(TWO_HTLCS),
        unsignedTxHex: TWO_HTLCS.hex,
        batchVaultIds: [VAULT_ID],
      }),
    ).rejects.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses a listed sibling registered on another Pre-PegIn before reading its full record", async () => {
    chainHas({
      [STRANGER_ID]: onChainVault({
        prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH,
        htlcVout: 1,
      }),
    });

    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(ONE_HTLC),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [VAULT_ID, STRANGER_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BatchSiblingMismatchError);
    expect(err).toMatchObject({
      vaultId: VAULT_ID,
      siblingId: STRANGER_ID,
      field: "prePeginTxHash",
    });
    expect(mockGetVaultFromChain).not.toHaveBeenCalled();
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses a listed sibling registered to another depositor", async () => {
    chainHas({
      [SIBLING_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 1,
        amount: 50_000n,
      }),
      [STRANGER_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 1,
        amount: 70_000n,
        depositor: OTHER_DEPOSITOR,
      }),
    });

    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, SIBLING_ID, STRANGER_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BatchSiblingMismatchError);
    expect(err).toMatchObject({
      vaultId: VAULT_ID,
      siblingId: STRANGER_ID,
      field: "depositor",
    });
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses two vaults registered at the same HTLC output", async () => {
    chainHas({
      [SIBLING_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 0,
      }),
    });

    await expect(
      assertResumePositionCapacity({
        vaultId: VAULT_ID,
        target: targetOf(TWO_HTLCS),
        unsignedTxHex: TWO_HTLCS.hex,
        batchVaultIds: [VAULT_ID, SIBLING_ID],
      }),
    ).rejects.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses a vault registered at an output the transaction does not have as an HTLC", async () => {
    chainHas({
      [SIBLING_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 2,
      }),
    });

    await expect(
      assertResumePositionCapacity({
        vaultId: VAULT_ID,
        target: targetOf(TWO_HTLCS),
        unsignedTxHex: TWO_HTLCS.hex,
        batchVaultIds: [VAULT_ID, SIBLING_ID],
      }),
    ).rejects.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("counts a sibling listed twice in different case once", async () => {
    const siblingId = `0x${"ab".repeat(32)}` as Hex;
    const siblingIdUpper = `0x${"AB".repeat(32)}` as Hex;
    chainHas({
      [siblingId]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 1,
      }),
    });

    await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, siblingId, siblingIdUpper],
    });

    expect(mockGetProtocolInfoBatch).toHaveBeenCalledWith([siblingId]);
  });

  it("refuses without asking the application when a sibling is bound to a different application", async () => {
    chainHas({
      [SIBLING_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 1,
        applicationEntryPoint: OTHER_ENTRY_POINT,
      }),
    });

    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, SIBLING_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BatchSiblingMismatchError);
    expect(err).toMatchObject({
      vaultId: VAULT_ID,
      siblingId: SIBLING_ID,
      field: "applicationEntryPoint",
    });
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("throws a caller error, not a capacity verdict, when the batch omits the vault", async () => {
    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(ONE_HTLC),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [SIBLING_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PositionCapacityExceededError);
    expect(err).not.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });
});

describe("assertResumePositionCapacity — the transaction", () => {
  it("refuses a transaction that cannot be parsed", async () => {
    await expect(
      assertResumePositionCapacity({
        vaultId: VAULT_ID,
        target: targetOf(ONE_HTLC),
        unsignedTxHex: "0xdeadbeef",
        batchVaultIds: [VAULT_ID],
      }),
    ).rejects.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses a transaction with no HTLC output", async () => {
    const noHtlcs = prePegin(0);

    await expect(
      assertResumePositionCapacity({
        vaultId: VAULT_ID,
        target: targetOf(noHtlcs),
        unsignedTxHex: noHtlcs.hex,
        batchVaultIds: [VAULT_ID],
      }),
    ).rejects.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses to count a transaction that is not the registered Pre-PegIn", async () => {
    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [VAULT_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });
});

describe("assertResumePositionCapacity — read failures", () => {
  it("refuses with the read failure as cause when the sibling hash read fails", async () => {
    const readFailure = new Error("multicall reverted");
    mockGetProtocolInfoBatch.mockRejectedValue(readFailure);

    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, SIBLING_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect((err as Error).cause).toBe(readFailure);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses with the read failure as cause when a sibling's full record cannot be read", async () => {
    const readFailure = new Error("execution reverted");
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: TWO_HTLCS.hash },
    ]);
    mockGetVaultFromChain.mockRejectedValue(readFailure);

    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, SIBLING_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect((err as Error).cause).toBe(readFailure);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses with the read failure as cause when allowedToDeposit cannot be read", async () => {
    const readFailure = new Error("execution reverted");
    mockReadAllowedToDeposit.mockRejectedValue(readFailure);

    const err = await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(ONE_HTLC),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [VAULT_ID],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect((err as Error).cause).toBe(readFailure);
  });
});

const PENDING_ID = `0x${"44".repeat(32)}` as Hex;
const VERIFIED_ID = `0x${"55".repeat(32)}` as Hex;
const ACTIVE_ID = `0x${"66".repeat(32)}` as Hex;
const REDEEMED_ID = `0x${"77".repeat(32)}` as Hex;
const EXPIRED_ID = `0x${"88".repeat(32)}` as Hex;

describe("assertPositionAcceptsBatch — the depositor's other vaults", () => {
  it("asks about the deposit alone when the depositor has no other registered vaults", async () => {
    await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 2,
      amount: 150_000n,
    });

    expect(mockGetDepositorVaultIdsFromChain).toHaveBeenCalledWith(
      DEPOSITOR,
      PINNED_BLOCK,
    );
    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith({
      applicationEntryPoint: ENTRY_POINT,
      vaultReceiver: DEPOSITOR,
      nVaultsToDeposit: 2n,
      amountToDeposit: 150_000n,
      blockNumber: PINNED_BLOCK,
    });
  });

  it("adds the depositor's pending and verified vaults in the same application on top of the deposit", async () => {
    depositorHas({
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
      [VERIFIED_ID]: {
        status: OnChainBtcVaultStatus.VERIFIED,
        amount: 40_000n,
      },
    });

    await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 2,
      amount: 150_000n,
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 4n,
        amountToDeposit: 220_000n,
      }),
    );
  });

  it("does not count active, redeemed or expired vaults", async () => {
    depositorHas({
      [ACTIVE_ID]: { status: OnChainBtcVaultStatus.ACTIVE, amount: 30_000n },
      [REDEEMED_ID]: {
        status: OnChainBtcVaultStatus.REDEEMED,
        amount: 40_000n,
      },
      [EXPIRED_ID]: { status: OnChainBtcVaultStatus.EXPIRED, amount: 50_000n },
    });

    await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 1n,
        amountToDeposit: 100_000n,
      }),
    );
  });

  it("does not count in-flight vaults bound to another application", async () => {
    depositorHas({
      [PENDING_ID]: {
        status: OnChainBtcVaultStatus.PENDING,
        amount: 30_000n,
        applicationEntryPoint: OTHER_ENTRY_POINT,
      },
    });

    await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 1n,
        amountToDeposit: 100_000n,
      }),
    );
  });

  it("counts the batch's own registered vaults once at broadcast, whatever their case", async () => {
    depositorHas({
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [SIBLING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 50_000n },
    });

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [
        VAULT_ID.toUpperCase() as Hex,
        SIBLING_ID.toUpperCase() as Hex,
      ],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 2,
      amount: 150_000n,
    });

    expect(mockGetBtcVaultBasicInfoFromChain).toHaveBeenCalledWith(
      [PENDING_ID],
      PINNED_BLOCK,
    );
    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 3n,
        amountToDeposit: 180_000n,
      }),
    );
  });

  it("does not count at broadcast a pending vault registered after the batch whose Pre-PegIn Bitcoin does not know", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);
    mockGetTxInfo.mockRejectedValue(
      new MempoolNotFoundError("Transaction not found"),
    );

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockGetProtocolInfoBatch).toHaveBeenCalledWith(
      [PENDING_ID],
      PINNED_BLOCK,
    );
    expect(mockGetTxInfo).toHaveBeenCalledWith(
      OTHER_PRE_PEGIN_TX_HASH.slice(2),
      "https://mempool.test/api",
    );
    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 1n,
        amountToDeposit: 100_000n,
      }),
    );
  });

  it("counts at broadcast a pending vault registered after the batch whose Pre-PegIn is already on Bitcoin", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);
    mockGetTxInfo.mockResolvedValue({ status: { confirmed: false } });

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 2n,
        amountToDeposit: 130_000n,
      }),
    );
  });

  it("counts at broadcast a later pending vault whose Pre-PegIn lookup fails", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);
    mockGetTxInfo.mockRejectedValue(new Error("Mempool API error (429)"));

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 2n,
        amountToDeposit: 130_000n,
      }),
    );
  });

  it("refuses as unavailable, not full, when the position is full only with a later vault whose lookup failed", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);
    const lookupFailure = new Error("Mempool API error (429)");
    mockGetTxInfo.mockRejectedValue(lookupFailure);
    mockReadAllowedToDeposit
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const err = await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    }).catch((e: unknown) => e);

    expect(mockReadAllowedToDeposit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 1n,
        amountToDeposit: 100_000n,
      }),
    );
    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect((err as Error).cause).toBe(lookupFailure);
  });

  it("refuses as full when the position is full even without the later vault whose lookup failed", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);
    mockGetTxInfo.mockRejectedValue(new Error("Mempool API error (429)"));
    mockReadAllowedToDeposit.mockResolvedValue(false);

    const err = await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    }).catch((e: unknown) => e);

    expect(mockReadAllowedToDeposit).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(PositionCapacityExceededError);
    expect(err).toMatchObject({
      inFlightVaultCount: 1,
      inFlightAmount: 30_000n,
    });
  });

  it("looks up a later split deposit's shared Pre-PegIn once", async () => {
    const LATER_SIBLING_ID = `0x${"99".repeat(32)}` as Hex;
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
      [LATER_SIBLING_ID]: {
        status: OnChainBtcVaultStatus.PENDING,
        amount: 20_000n,
      },
    });
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);
    mockGetTxInfo.mockRejectedValue(
      new MempoolNotFoundError("Transaction not found"),
    );

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockGetTxInfo).toHaveBeenCalledTimes(1);
    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 1n,
        amountToDeposit: 100_000n,
      }),
    );
  });

  it("refuses at broadcast without asking the application when a later vault's Pre-PegIn hash cannot be read", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    const readFailure = new Error("multicall reverted");
    mockGetProtocolInfoBatch.mockRejectedValue(readFailure);

    const err = await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect((err as Error).cause).toBe(readFailure);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("counts at broadcast a verified vault registered after the batch", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [VERIFIED_ID]: {
        status: OnChainBtcVaultStatus.VERIFIED,
        amount: 40_000n,
      },
    });

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 2n,
        amountToDeposit: 140_000n,
      }),
    );
  });

  it("counts every pending vault at broadcast while the batch is not listed yet", async () => {
    depositorHas({
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 2n,
        amountToDeposit: 130_000n,
      }),
    );
  });

  it("pins every chain read of one check to the same block", async () => {
    depositorHas({
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);
    mockGetTxInfo.mockResolvedValue({ status: { confirmed: false } });

    await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    });

    expect(mockResolvePinnedReadBlock).toHaveBeenCalledTimes(1);
    expect(mockGetDepositorVaultIdsFromChain).toHaveBeenCalledWith(
      DEPOSITOR,
      PINNED_BLOCK,
    );
    expect(mockGetBtcVaultBasicInfoFromChain).toHaveBeenCalledWith(
      [PENDING_ID],
      PINNED_BLOCK,
    );
    expect(mockGetProtocolInfoBatch).toHaveBeenCalledWith(
      [PENDING_ID],
      PINNED_BLOCK,
    );
    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: PINNED_BLOCK }),
    );
  });

  it("refuses without reading the position when the chain head cannot be read", async () => {
    const readFailure = new Error("eth_blockNumber failed");
    mockResolvePinnedReadBlock.mockRejectedValue(readFailure);

    const err = await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect((err as Error).cause).toBe(readFailure);
    expect(mockGetDepositorVaultIdsFromChain).not.toHaveBeenCalled();
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });
});

describe("assertPositionAcceptsBatch — refusals", () => {
  it("refuses before registration with the in-flight totals on the error", async () => {
    depositorHas({
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
    });
    mockReadAllowedToDeposit.mockResolvedValue(false);

    const err = await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 2,
      amount: 150_000n,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityExceededError);
    expect(err).toMatchObject({
      checkpoint: { stage: "registration" },
      vaultCount: 2,
      amount: 150_000n,
      inFlightVaultCount: 1,
      inFlightAmount: 30_000n,
    });
    expect((err as Error).message).toMatch(/Registration refused\.$/);
  });

  it("refuses at broadcast naming the vault", async () => {
    mockReadAllowedToDeposit.mockResolvedValue(false);

    const err = await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityExceededError);
    expect((err as Error).message).toContain(VAULT_ID);
    expect((err as Error).message).toMatch(/Broadcast refused\.$/);
  });

  it("refuses without asking the application when the depositor's vault list cannot be read", async () => {
    const readFailure = new Error("execution reverted");
    mockGetDepositorVaultIdsFromChain.mockRejectedValue(readFailure);

    const err = await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect(err).toMatchObject({ checkpoint: { stage: "registration" } });
    expect((err as Error).cause).toBe(readFailure);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses without asking the application when a registered vault's status cannot be read", async () => {
    const readFailure = new Error("multicall reverted");
    mockGetDepositorVaultIdsFromChain.mockResolvedValue([PENDING_ID]);
    mockGetBtcVaultBasicInfoFromChain.mockRejectedValue(readFailure);

    const err = await assertPositionAcceptsBatch({
      stage: "registration",
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 1,
      amount: 100_000n,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(PositionCapacityUnavailableError);
    expect((err as Error).cause).toBe(readFailure);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("refuses when a registered vault in the same application is in a status the check does not model", async () => {
    const UNMODELLED_STATUS = 9;
    depositorHas({
      [PENDING_ID]: { status: UNMODELLED_STATUS, amount: 30_000n },
    });

    await expect(
      assertPositionAcceptsBatch({
        stage: "registration",
        applicationEntryPoint: ENTRY_POINT,
        depositor: DEPOSITOR,
        vaultCount: 1,
        amount: 100_000n,
      }),
    ).rejects.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("throws a caller error, not a verdict, when the broadcast batch does not match the vault count", async () => {
    const err = await assertPositionAcceptsBatch({
      stage: "broadcast",
      vaultId: VAULT_ID,
      batchVaultIds: [VAULT_ID],
      applicationEntryPoint: ENTRY_POINT,
      depositor: DEPOSITOR,
      vaultCount: 2,
      amount: 150_000n,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PositionCapacityExceededError);
    expect(err).not.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockGetDepositorVaultIdsFromChain).not.toHaveBeenCalled();
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });
});

describe("assertResumePositionCapacity — the depositor's other vaults", () => {
  it("counts the depositor's other pending vault but not the resumed batch's members", async () => {
    chainHas({
      [SIBLING_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 1,
        amount: 50_000n,
      }),
    });
    depositorHas({
      [PENDING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 30_000n },
      [VAULT_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 100_000n },
      [SIBLING_ID]: { status: OnChainBtcVaultStatus.PENDING, amount: 50_000n },
    });

    await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, SIBLING_ID],
    });

    expect(mockGetBtcVaultBasicInfoFromChain).toHaveBeenCalledWith(
      [PENDING_ID],
      PINNED_BLOCK,
    );
    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 3n,
        amountToDeposit: 180_000n,
      }),
    );
  });
});
