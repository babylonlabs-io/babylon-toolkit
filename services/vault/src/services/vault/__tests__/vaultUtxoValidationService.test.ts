/** Tests for UTXO validation service (I/O wrapper over the SDK's outpoint check). */

import {
  getOutspend,
  getUtxoInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { InputPrevoutMismatchError } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { UtxoNotAvailableError } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { Transaction } from "bitcoinjs-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { mapDepositError } from "@/utils/errors/depositErrors";

import { assertUtxosAvailable } from "../vaultUtxoValidationService";

// Partial: the error mapper under test imports `JsonRpcError` from the same
// module, so only the two readers are replaced.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
  >()),
  getOutspend: vi.fn(),
  getUtxoInfo: vi.fn(),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn(() => "https://mempool.space/api"),
}));

const mockedGetOutspend = vi.mocked(getOutspend);
const mockedGetUtxoInfo = vi.mocked(getUtxoInfo);

const RECEIVE_TXID = "a".repeat(64);
const CHANGE_TXID = "b".repeat(64);
const RECEIVE_SCRIPT = "5120" + "aa".repeat(32);
const CHANGE_SCRIPT = "5120" + "bb".repeat(32);

/**
 * One input on the receive address, one on the change address. Built with
 * the global Buffer, not the `buffer` polyfill: polyfill instances fail
 * bitcoinjs/typeforce's `Buffer.isBuffer` (see fundingInputCap.ts).
 */
function twoAddressTxHex(): string {
  const GlobalBuffer = (globalThis as { Buffer: BufferConstructor }).Buffer;
  const tx = new Transaction();
  tx.addInput(GlobalBuffer.from(RECEIVE_TXID, "hex").reverse(), 3);
  tx.addInput(GlobalBuffer.from(CHANGE_TXID, "hex").reverse(), 0);
  tx.addOutput(GlobalBuffer.from("0014" + "11".repeat(20), "hex"), 90_000);
  return tx.toHex();
}

const CHAIN_VALUE = 100_000;

const SELECTED = {
  [`${RECEIVE_TXID}:3`]: { scriptPubKey: RECEIVE_SCRIPT, value: CHAIN_VALUE },
  [`${CHANGE_TXID}:0`]: { scriptPubKey: CHANGE_SCRIPT, value: CHAIN_VALUE },
};

function chainScripts(
  scripts: Record<string, string>,
  values: Record<string, number> = {},
) {
  mockedGetUtxoInfo.mockImplementation(async (txid, vout) => ({
    txid,
    vout,
    value: values[`${txid}:${vout}`] ?? CHAIN_VALUE,
    scriptPubKey: scripts[`${txid}:${vout}`],
  }));
}

describe("vaultUtxoValidationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetOutspend.mockResolvedValue({ spent: false });
    // Both outputs exist on chain by default; tests narrow from here.
    chainScripts({
      [`${RECEIVE_TXID}:3`]: RECEIVE_SCRIPT,
      [`${CHANGE_TXID}:0`]: CHANGE_SCRIPT,
    });
  });

  it("asks the mempool API about each input's own outpoint, whichever address holds it", async () => {
    await expect(
      assertUtxosAvailable(twoAddressTxHex()),
    ).resolves.toBeUndefined();

    expect(mockedGetOutspend).toHaveBeenCalledWith(
      RECEIVE_TXID,
      3,
      "https://mempool.space/api",
    );
    expect(mockedGetOutspend).toHaveBeenCalledWith(
      CHANGE_TXID,
      0,
      "https://mempool.space/api",
    );
    // The output itself is read for every input too: it is what proves the
    // outpoint exists, which the outspend route alone does not.
    expect(mockedGetUtxoInfo).toHaveBeenCalledTimes(2);
  });

  it("throws UtxoNotAvailableError naming the spent input", async () => {
    mockedGetOutspend.mockImplementation(async (txid) => ({
      spent: txid === CHANGE_TXID,
    }));

    const error = await assertUtxosAvailable(twoAddressTxHex()).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(UtxoNotAvailableError);
    expect((error as UtxoNotAvailableError).missingUtxos).toEqual([
      { txid: CHANGE_TXID, vout: 0 },
    ]);
  });

  it("wraps a failed mempool read in the funds-unavailable wording, keeping the cause, rather than reporting the input spent", async () => {
    // The deposit error mapping files "Failed to get UTXOs" under the
    // retryable callout; a spent input is a different, terminal error.
    const cause = new Error("Network timeout");
    mockedGetOutspend.mockRejectedValue(cause);

    const error = await assertUtxosAvailable(twoAddressTxHex()).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UtxoNotAvailableError);
    expect((error as Error).message).toBe(
      `Failed to get UTXOs for input ${RECEIVE_TXID}:3: Network timeout`,
    );
    expect((error as Error).cause).toBe(cause);
    // Through the real mapper, not a copied literal: the wording and the
    // bucket's phrase must agree, or a mempool outage loses its callout.
    expect(mapDepositError(error)).toEqual(
      COPY.deposit.errors.utxosUnavailable,
    );
  });

  it("wraps an unknown parent transaction the same way — the input is not proven to exist", async () => {
    // The outspend route answers `{spent:false}` for an outpoint the index
    // does not know; only the output read fails for it.
    mockedGetUtxoInfo.mockImplementation(async (txid, vout) => {
      if (txid === CHANGE_TXID) throw new Error("Transaction not found");
      return { txid, vout, value: 100_000, scriptPubKey: RECEIVE_SCRIPT };
    });

    const error = await assertUtxosAvailable(twoAddressTxHex()).catch(
      (e: unknown) => e,
    );

    expect((error as Error).message).toBe(
      `Failed to get UTXOs for input ${CHANGE_TXID}:0: Transaction not found`,
    );
    expect(mapDepositError(error)).toEqual(
      COPY.deposit.errors.utxosUnavailable,
    );
  });

  it("maps an unreadable spend status to the funds-unavailable callout, not to unspent", async () => {
    mockedGetOutspend.mockResolvedValue({} as { spent: boolean });

    const error = await assertUtxosAvailable(twoAddressTxHex()).catch(
      (e: unknown) => e,
    );

    expect(error).not.toBeInstanceOf(UtxoNotAvailableError);
    expect(mapDepositError(error)).toEqual(
      COPY.deposit.errors.utxosUnavailable,
    );
  });

  describe("with the selected UTXOs, before Ethereum registration", () => {
    it("binds each input's script to its outpoint through the SDK's validated read", async () => {
      await expect(
        assertUtxosAvailable(twoAddressTxHex(), SELECTED),
      ).resolves.toBeUndefined();

      expect(mockedGetUtxoInfo).toHaveBeenCalledWith(
        CHANGE_TXID,
        0,
        "https://mempool.space/api",
      );
    });

    it("refuses an input whose outpoint pays another script — the listing mislabelled it", async () => {
      // The change outpoint carrying the receive address's script: what an
      // address listing produces for an outpoint that is not its own. Caught
      // before registration would lock the deposit.
      chainScripts({
        [`${RECEIVE_TXID}:3`]: RECEIVE_SCRIPT,
        [`${CHANGE_TXID}:0`]: RECEIVE_SCRIPT,
      });

      await expect(
        assertUtxosAvailable(twoAddressTxHex(), SELECTED),
      ).rejects.toBeInstanceOf(InputPrevoutMismatchError);
    });

    it("refuses an input whose chain value differs from the listed one, before registration", async () => {
      chainScripts(
        {
          [`${RECEIVE_TXID}:3`]: RECEIVE_SCRIPT,
          [`${CHANGE_TXID}:0`]: CHANGE_SCRIPT,
        },
        { [`${CHANGE_TXID}:0`]: CHAIN_VALUE - 1 },
      );

      const error = await assertUtxosAvailable(
        twoAddressTxHex(),
        SELECTED,
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InputPrevoutMismatchError);
      expect(mapDepositError(error)).toEqual(
        COPY.deposit.errors.inputPrevoutMismatch,
      );
    });
  });
});
