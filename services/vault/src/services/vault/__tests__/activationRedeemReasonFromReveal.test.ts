import { BTCVaultRegistryABI } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  type Address,
  type Hex,
  type Log,
  type TransactionReceipt,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { activationRedeemReasonFromReveal } from "../activationRedeemReasonFromReveal";

// Inline literals because vi.mock factories are hoisted.
vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xE976a4f2B90E64A9A9374453bC526e67625cC750",
    AAVE_ADAPTER: "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd",
  },
}));

vi.mock("@/infrastructure", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), event: vi.fn() },
}));

const REGISTRY = "0xE976a4f2B90E64A9A9374453bC526e67625cC750" as Address;
const AAVE_ADAPTER = "0xCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCdCd";
const OTHER_APPLICATION = "0x1111111111111111111111111111111111111111";
const DEPOSITOR = "0x8c5283a3F2995ecF78319bb1ca3BD9a179b3E740" as Address;
const VAULT_ID = `0x${"aa".repeat(32)}` as Hex;
const SECRET = `0x${"11".repeat(32)}` as Hex;
const PEGIN_TX_HASH = `0x${"22".repeat(32)}` as Hex;
const VP_KEY = `0x${"33".repeat(32)}` as Hex;
const DEPOSITOR_KEY = `0x${"44".repeat(32)}` as Hex;

function makeLog(logIndex: number, topics: readonly unknown[], data: Hex): Log {
  return {
    address: REGISTRY,
    logIndex,
    topics,
    data,
    blockHash: null,
    blockNumber: null,
    transactionHash: null,
    transactionIndex: null,
    removed: false,
  } as unknown as Log;
}

function peginActivatedLog(logIndex: number): Log {
  return makeLog(
    logIndex,
    encodeEventTopics({
      abi: BTCVaultRegistryABI,
      eventName: "PeginActivated",
      args: { vaultId: VAULT_ID, depositor: DEPOSITOR },
    }),
    encodeAbiParameters([{ type: "bytes32" }], [SECRET]),
  );
}

function vaultClaimableByLog(claimerPK: Hex, logIndex: number): Log {
  const event = getAbiItem({
    abi: BTCVaultRegistryABI,
    name: "VaultClaimableBy",
  });
  const dataInputs = event.inputs.filter((input) => !input.indexed);
  return makeLog(
    logIndex,
    encodeEventTopics({
      abi: BTCVaultRegistryABI,
      eventName: "VaultClaimableBy",
      args: { vaultId: VAULT_ID, peginTxHash: PEGIN_TX_HASH, claimerPK },
    }),
    encodeAbiParameters(
      dataInputs,
      dataInputs.map(() => 1),
    ),
  );
}

/** PeginActivated, then the depositor redeem: the VP key, then the depositor key. */
function returnedReceipt(): TransactionReceipt {
  return {
    logs: [
      peginActivatedLog(0),
      vaultClaimableByLog(VP_KEY, 1),
      vaultClaimableByLog(DEPOSITOR_KEY, 2),
    ],
  } as unknown as TransactionReceipt;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("activationRedeemReasonFromReveal", () => {
  it("classifies a returned activation from the reveal receipt", () => {
    expect(
      activationRedeemReasonFromReveal({
        receipt: returnedReceipt(),
        vaultId: VAULT_ID,
        minActivationGasAtSend: 5_000_000n,
        applicationEntryPoint: AAVE_ADAPTER,
      }),
    ).toEqual({ kind: "cap_exceeded" });
  });

  it("is unknown when the gate was absent at send time", () => {
    expect(
      activationRedeemReasonFromReveal({
        receipt: returnedReceipt(),
        vaultId: VAULT_ID,
        minActivationGasAtSend: null,
        applicationEntryPoint: AAVE_ADAPTER,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("is unknown when the application is not the Aave adapter", () => {
    expect(
      activationRedeemReasonFromReveal({
        receipt: returnedReceipt(),
        vaultId: VAULT_ID,
        minActivationGasAtSend: 5_000_000n,
        applicationEntryPoint: OTHER_APPLICATION,
      }),
    ).toEqual({ kind: "unknown" });
  });

  it("is unknown and does not throw when the receipt logs are malformed", () => {
    const receipt = {
      logs: [{ ...peginActivatedLog(0), address: "not-an-address" }],
    } as unknown as TransactionReceipt;

    expect(
      activationRedeemReasonFromReveal({
        receipt,
        vaultId: VAULT_ID,
        minActivationGasAtSend: 5_000_000n,
        applicationEntryPoint: AAVE_ADAPTER,
      }),
    ).toEqual({ kind: "unknown" });
    // Only the vault id reaches the log: never the receipt or its logs.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0][1]).toEqual({
      category: "activation",
      vaultId: VAULT_ID,
    });
  });

  it("is unknown and does not throw when the logs are malformed and logging throws", () => {
    vi.mocked(logger.warn).mockImplementationOnce(() => {
      throw new Error("logger failed");
    });
    const receipt = {
      logs: [{ ...peginActivatedLog(0), address: "not-an-address" }],
    } as unknown as TransactionReceipt;

    expect(
      activationRedeemReasonFromReveal({
        receipt,
        vaultId: VAULT_ID,
        minActivationGasAtSend: 5_000_000n,
        applicationEntryPoint: AAVE_ADAPTER,
      }),
    ).toEqual({ kind: "unknown" });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
