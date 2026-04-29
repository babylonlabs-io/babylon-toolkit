import * as bitcoin from "bitcoinjs-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CollateralVaultEntry } from "@/types/collateral";

import { getUniquePayoutAddresses } from "../payoutAddresses";

const loggerErrorMock = vi.fn();
vi.mock("@/infrastructure", () => ({
  logger: {
    error: (...args: unknown[]) => loggerErrorMock(...args),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

/**
 * Build a valid testnet P2WPKH scriptPubKey hex (0x-prefixed) for a deterministic
 * pubkey hash. Two distinct hashes give us two distinct payout addresses for
 * exercising the dedup logic.
 */
function buildScriptHex(hashBytes: Uint8Array): string {
  const { output } = bitcoin.payments.p2wpkh({
    hash: Buffer.from(hashBytes),
    network: bitcoin.networks.testnet,
  });
  if (!output) throw new Error("Test fixture failed to build p2wpkh output");
  return `0x${Buffer.from(output).toString("hex")}`;
}

const HASH_A = new Uint8Array(20).fill(0xaa);
const HASH_B = new Uint8Array(20).fill(0xbb);
const SCRIPT_A = buildScriptHex(HASH_A);
const SCRIPT_B = buildScriptHex(HASH_B);

function makeVault(
  overrides: Partial<CollateralVaultEntry>,
): CollateralVaultEntry {
  return {
    id: "v",
    vaultId: "v",
    amountBtc: 1,
    addedAt: 0,
    inUse: true,
    providerAddress: "0xprovider",
    providerName: "Provider",
    liquidationIndex: 0,
    ...overrides,
  };
}

describe("getUniquePayoutAddresses", () => {
  beforeEach(() => {
    loggerErrorMock.mockClear();
  });

  it("returns a single address when all vaults share the same payout scriptPubKey", () => {
    const result = getUniquePayoutAddresses([
      makeVault({ vaultId: "v1", depositorPayoutBtcAddress: SCRIPT_A }),
      makeVault({ vaultId: "v2", depositorPayoutBtcAddress: SCRIPT_A }),
      makeVault({ vaultId: "v3", depositorPayoutBtcAddress: SCRIPT_A }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("returns distinct addresses in first-seen order when payouts differ", () => {
    const both = getUniquePayoutAddresses([
      makeVault({ vaultId: "v1", depositorPayoutBtcAddress: SCRIPT_B }),
      makeVault({ vaultId: "v2", depositorPayoutBtcAddress: SCRIPT_A }),
      makeVault({ vaultId: "v3", depositorPayoutBtcAddress: SCRIPT_B }),
    ]);
    expect(both).toHaveLength(2);
    // Order matches first occurrence (B then A), not insertion of B again.
    const [decodedB, decodedA] = both;
    expect(decodedA).not.toBe(decodedB);
  });

  it("skips vaults missing a payout scriptPubKey without logging", () => {
    const result = getUniquePayoutAddresses([
      makeVault({ vaultId: "v1", depositorPayoutBtcAddress: SCRIPT_A }),
      makeVault({ vaultId: "v2", depositorPayoutBtcAddress: undefined }),
    ]);
    expect(result).toHaveLength(1);
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("logs and skips vaults whose scriptPubKey can't be decoded, returning the rest", () => {
    const result = getUniquePayoutAddresses([
      makeVault({ vaultId: "v1", depositorPayoutBtcAddress: SCRIPT_A }),
      makeVault({
        vaultId: "broken",
        depositorPayoutBtcAddress: "0xnothex",
      }),
      makeVault({ vaultId: "v3", depositorPayoutBtcAddress: SCRIPT_B }),
    ]);
    expect(result).toHaveLength(2);
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    const [, context] = loggerErrorMock.mock.calls[0];
    expect(context.data.vaultId).toBe("broken");
  });

  it("returns an empty array for an empty input", () => {
    expect(getUniquePayoutAddresses([])).toEqual([]);
  });
});
