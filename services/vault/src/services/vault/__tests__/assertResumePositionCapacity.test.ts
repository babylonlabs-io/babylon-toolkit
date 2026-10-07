/**
 * The resume broadcast's position-capacity gate: which vaults it sizes, what
 * it asks the application, and that every failure refuses.
 *
 * The HTLC count and the hash binding run for real against transactions built
 * with bitcoinjs-lib; only the chain reads are mocked.
 */

import { opcodes, script, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadAllowedToDeposit = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/application-entry-point/query", () => ({
  readAllowedToDeposit: mockReadAllowedToDeposit,
}));

const mockGetVaultFromChain = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: mockGetVaultFromChain,
}));

const mockGetProtocolInfoBatch = vi.hoisted(() => vi.fn());
vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getProtocolInfoBatch: mockGetProtocolInfoBatch,
  }),
}));

import {
  PositionCapacityExceededError,
  PositionCapacityUnavailableError,
} from "@/utils/errors";

import { assertResumePositionCapacity } from "../assertResumePositionCapacity";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockReadAllowedToDeposit.mockResolvedValue(true);
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
      vaultId: VAULT_ID,
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

  it("ignores a listed vault registered on another Pre-PegIn without reading its full record", async () => {
    chainHas({
      [STRANGER_ID]: onChainVault({
        prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH,
        htlcVout: 1,
      }),
    });

    await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(ONE_HTLC),
      unsignedTxHex: ONE_HTLC.hex,
      batchVaultIds: [VAULT_ID, STRANGER_ID],
    });

    expect(mockGetVaultFromChain).not.toHaveBeenCalled();
    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ nVaultsToDeposit: 1n }),
    );
  });

  it("refuses when the only vault at an HTLC output belongs to another depositor", async () => {
    chainHas({
      [STRANGER_ID]: onChainVault({
        prePeginTxHash: TWO_HTLCS.hash,
        htlcVout: 1,
        depositor: OTHER_DEPOSITOR,
      }),
    });

    await expect(
      assertResumePositionCapacity({
        vaultId: VAULT_ID,
        target: targetOf(TWO_HTLCS),
        unsignedTxHex: TWO_HTLCS.hex,
        batchVaultIds: [VAULT_ID, STRANGER_ID],
      }),
    ).rejects.toBeInstanceOf(PositionCapacityUnavailableError);
    expect(mockReadAllowedToDeposit).not.toHaveBeenCalled();
  });

  it("leaves another depositor's vault out of the count when this depositor's vault holds the output", async () => {
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

    await assertResumePositionCapacity({
      vaultId: VAULT_ID,
      target: targetOf(TWO_HTLCS),
      unsignedTxHex: TWO_HTLCS.hex,
      batchVaultIds: [VAULT_ID, SIBLING_ID, STRANGER_ID],
    });

    expect(mockReadAllowedToDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        nVaultsToDeposit: 2n,
        amountToDeposit: 150_000n,
      }),
    );
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
