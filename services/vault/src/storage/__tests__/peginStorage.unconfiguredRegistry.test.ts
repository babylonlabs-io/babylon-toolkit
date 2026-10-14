/** The legacy-key drop must not run under the zero-address registry fallback. */

import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infrastructure";

import { LocalStorageStatus } from "../../models/peginStateMachine";
import {
  getPendingPegins,
  getPendingPeginsStorageKey,
  type PendingPeginRequest,
} from "../peginStorage";

vi.mock("@/infrastructure", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
  },
}));

// What a missing or invalid NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY resolves to.
vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0x0000000000000000000000000000000000000000",
  },
}));

const ETH_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const legacyStorageKey = `vault-pending-pegins-${ETH_ADDRESS}`;

const pegin: PendingPeginRequest = {
  id: `0x${"1".repeat(64)}` as Hex,
  peginTxHash: `0x${"3".repeat(64)}` as Hex,
  timestamp: 1700000000000,
  status: LocalStorageStatus.PENDING,
  unsignedTxHex: "0xdeadbeef",
  selectedUTXOs: [
    {
      txid: "a".repeat(64),
      vout: 0,
      value: "50000",
      scriptPubKey: "deadbeef",
    },
  ],
  buildOffchainParamsVersion: 7,
  buildAppVaultKeepersVersion: 3,
  buildUniversalChallengersVersion: 5,
  buildVaultCoreVersion: 1,
};

describe("getPendingPegins with an unestablished registry", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("still reads the scoped key but leaves the legacy key alone", () => {
    localStorage.setItem(legacyStorageKey, JSON.stringify([pegin]));
    localStorage.setItem(
      getPendingPeginsStorageKey(ETH_ADDRESS),
      JSON.stringify([{ ...pegin, id: `0x${"2".repeat(64)}` }]),
    );

    expect(getPendingPegins(ETH_ADDRESS).map((p) => p.id)).toEqual([
      `0x${"2".repeat(64)}`,
    ]);
    expect(localStorage.getItem(legacyStorageKey)).not.toBeNull();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
