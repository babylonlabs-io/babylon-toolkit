/** Tests for the UTXO validation service (the app's URL over the SDK's outpoint check). */

import { assertOutpointsAvailable } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { UtxoNotAvailableError } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertUtxosAvailable } from "../vaultUtxoValidationService";

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/services", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/services")
  >()),
  assertOutpointsAvailable: vi.fn(),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.space/api"),
}));

const mockedAssertOutpointsAvailable = vi.mocked(assertOutpointsAvailable);

const TX_HEX = "02000000000100000000";
const SELECTED = {
  [`${"a".repeat(64)}:3`]: {
    scriptPubKey: "5120" + "aa".repeat(32),
    value: 100_000,
  },
};

describe("vaultUtxoValidationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAssertOutpointsAvailable.mockResolvedValue(undefined);
  });

  it("runs the SDK's outpoint check against the app's mempool API", async () => {
    await expect(assertUtxosAvailable(TX_HEX)).resolves.toBeUndefined();

    expect(mockedAssertOutpointsAvailable).toHaveBeenCalledWith({
      unsignedTxHex: TX_HEX,
      mempoolApiUrl: "https://mempool.space/api",
      expectedPrevouts: undefined,
    });
  });

  it("hands the selected UTXOs through for the pre-registration binding", async () => {
    await assertUtxosAvailable(TX_HEX, SELECTED);

    expect(mockedAssertOutpointsAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPrevouts: SELECTED }),
    );
  });

  it("passes the SDK's typed refusals through untouched", async () => {
    const spent = new UtxoNotAvailableError([
      { txid: "a".repeat(64), vout: 3 },
    ]);
    mockedAssertOutpointsAvailable.mockRejectedValue(spent);

    await expect(assertUtxosAvailable(TX_HEX)).rejects.toBe(spent);
  });
});
