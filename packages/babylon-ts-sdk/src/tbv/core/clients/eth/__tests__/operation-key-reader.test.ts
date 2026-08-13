import type { Address, Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import { ViemOperationKeyReader } from "../operation-key-reader";
import type { KeyEpochs, OperationKeyQuery } from "../types";

const MOCK_CONTRACTS = {
  btcVaultRegistry: "0x1111111111111111111111111111111111111111" as Address,
  applicationRegistry: "0x2222222222222222222222222222222222222222" as Address,
  protocolParams: "0x3333333333333333333333333333333333333333" as Address,
};

const VP_GENESIS_KEY =
  "0xaaaa000000000000000000000000000000000000000000000000000000000000" as Hex;

/** Two keepers and one challenger, so a short read is unambiguous. */
const QUERY: OperationKeyQuery = {
  vaultProviderEthAddress:
    "0x4444444444444444444444444444444444444444" as Address,
  vaultProviderGenesisBtcPubkey: VP_GENESIS_KEY,
  applicationEntryPoint:
    "0x5555555555555555555555555555555555555555" as Address,
  vaultKeepers: [
    {
      ethAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
      btcPubKey:
        "0xbbbb000000000000000000000000000000000000000000000000000000000000" as Hex,
    },
    {
      ethAddress: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
      btcPubKey:
        "0xdddd000000000000000000000000000000000000000000000000000000000000" as Hex,
    },
  ],
  universalChallengers: [
    {
      ethAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
      btcPubKey:
        "0xffff000000000000000000000000000000000000000000000000000000000000" as Hex,
    },
  ],
};

const EPOCHS: KeyEpochs = {
  vpKeyEpoch: 3n,
  appKeeperKeyEpoch: 4n,
  ucKeyEpoch: 5n,
};

const VP_PAYOUT_SCRIPT = "0x0014aaaa" as Hex;
const KEEPER_0_PAYOUT_SCRIPT = "0x0014bbbb" as Hex;
const KEEPER_1_PAYOUT_SCRIPT = "0x0014cccc" as Hex;

/** The subset of viem's `multicall` argument these tests assert on. */
type MulticallArgs = { contracts: { functionName: string }[] };

/** Stubs `multicall` with a fixed result, bypassing ABI encoding entirely. */
function createReader(multicallResult: readonly Hex[]) {
  const multicall = vi.fn(async (_args: MulticallArgs) => multicallResult);
  const reader = new ViemOperationKeyReader(
    { multicall } as never,
    MOCK_CONTRACTS,
  );
  return { reader, multicall };
}

describe("ViemOperationKeyReader.getPayoutScriptsAtEpochs", () => {
  it("returns the VP script and the keeper scripts in roster order", async () => {
    const { reader } = createReader([
      VP_PAYOUT_SCRIPT,
      KEEPER_0_PAYOUT_SCRIPT,
      KEEPER_1_PAYOUT_SCRIPT,
    ]);

    const scripts = await reader.getPayoutScriptsAtEpochs(QUERY, EPOCHS);

    expect(scripts.vaultProvider).toBe(VP_PAYOUT_SCRIPT);
    expect(scripts.vaultKeepers).toEqual([
      KEEPER_0_PAYOUT_SCRIPT,
      KEEPER_1_PAYOUT_SCRIPT,
    ]);
  });

  it("throws naming both counts when the multicall comes back short", async () => {
    // One keeper script missing: without the length check this returns a
    // one-element keeper array and the caller later blames keeper 1 for having
    // no registered payout script.
    const { reader } = createReader([VP_PAYOUT_SCRIPT, KEEPER_0_PAYOUT_SCRIPT]);

    await expect(
      reader.getPayoutScriptsAtEpochs(QUERY, EPOCHS),
    ).rejects.toThrow(
      "getPayoutScriptsAtEpochs: multicall returned 2 results for 3 calls",
    );
  });

  it("issues one call per keeper plus one for the VP, and none for challengers", async () => {
    const { reader, multicall } = createReader([
      VP_PAYOUT_SCRIPT,
      KEEPER_0_PAYOUT_SCRIPT,
      KEEPER_1_PAYOUT_SCRIPT,
    ]);

    await reader.getPayoutScriptsAtEpochs(QUERY, EPOCHS);

    const { contracts } = multicall.mock.calls[0][0];
    expect(contracts).toHaveLength(1 + QUERY.vaultKeepers.length);
    expect(
      contracts.every((c) => c.functionName === "getPayoutScriptAtEpoch"),
    ).toBe(true);
  });
});

describe("ViemOperationKeyReader.getOperationKeysAtEpochs", () => {
  it("throws naming both counts when the multicall comes back short", async () => {
    // Expected length is 1 VP + 2 keepers + 1 challenger.
    const { reader } = createReader([
      "0x1111" as Hex,
      "0x2222" as Hex,
      "0x3333" as Hex,
    ]);

    await expect(
      reader.getOperationKeysAtEpochs(QUERY, EPOCHS),
    ).rejects.toThrow(
      "getOperationKeysAtEpochs: multicall returned 3 results for 4 calls",
    );
  });
});

describe("ViemOperationKeyReader.getCurrentOperationKeys", () => {
  it("throws naming both counts when the multicall comes back short", async () => {
    const { reader } = createReader(["0x1111" as Hex, "0x2222" as Hex]);

    await expect(reader.getCurrentOperationKeys(QUERY)).rejects.toThrow(
      "getCurrentOperationKeys: multicall returned 2 results for 4 calls",
    );
  });
});
