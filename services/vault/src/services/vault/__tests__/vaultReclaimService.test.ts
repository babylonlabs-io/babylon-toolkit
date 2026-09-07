/**
 * Reclaim adapter tests.
 *
 * The protocol work lives in the SDK and has its own suite. What matters here
 * is the gate: this adapter is the last thing that runs before a wallet prompt,
 * and the row it was launched from was rendered off a 60-second poller. If the
 * chain moved in between, this is the only place left to notice.
 */

import { pushTx } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  getOutspend,
  getTipHeight,
  getUtxoInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { PEGIN_VAULT_VOUT } from "@/models/reclaimEligibility";

import { getVaultFromChain } from "../../../clients/eth-contract/btc-vault-registry/query";
import {
  ReclaimAlreadySettledError,
  ReclaimNoLongerEligibleError,
  buildAndBroadcastReclaimTransaction,
  getReclaimPreview,
} from "../vaultReclaimService";

const mockBuildAndBroadcastReclaim = vi.fn();

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/services", () => ({
  buildAndBroadcastReclaim: (...args: unknown[]) =>
    mockBuildAndBroadcastReclaim(...args),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/ts-sdk/tbv/core")>()),
  getNetworkFees: vi.fn().mockResolvedValue({ halfHourFee: 10 }),
  pushTx: vi.fn().mockResolvedValue("broadcast_txid"),
  computeMinClaimValue: vi.fn().mockResolvedValue(33_000n),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@babylonlabs-io/ts-sdk/tbv/core/clients")
  >()),
  getOutspend: vi.fn(),
  getTipHeight: vi.fn(),
  getUtxoInfo: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  calculateBtcTxHash: vi.fn(() => `0x${"cd".repeat(32)}`),
}));

vi.mock("../../../clients/btc/config", () => ({
  getMempoolApiUrl: vi.fn().mockReturnValue("https://mempool.space/api"),
}));

vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
}));

vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getProtocolParamsReader: vi.fn().mockResolvedValue({
    getOffchainParamsByVersion: vi.fn().mockResolvedValue({
      councilQuorum: 2,
      securityCouncilKeys: [
        `0x${"55".repeat(32)}`,
        `0x${"66".repeat(32)}`,
        `0x${"77".repeat(32)}`,
      ],
      feeRate: 5,
    }),
  }),
  getVaultKeeperReader: vi.fn().mockResolvedValue({
    getVaultKeepersByVersion: vi
      .fn()
      .mockResolvedValue([{ btcPubKey: `0x${"11".repeat(32)}` }]),
  }),
  getUniversalChallengerReader: vi.fn().mockResolvedValue({
    getUniversalChallengersByVersion: vi
      .fn()
      .mockResolvedValue([{ btcPubKey: `0x${"22".repeat(32)}` }]),
  }),
}));

vi.mock("@/utils/wasm", () => ({
  assertMinClaimValue: vi.fn(),
}));

const VAULT_ID = `0x${"aa".repeat(32)}` as Hex;
const DEPOSITOR_ETH = `0x${"33".repeat(20)}`;
const DEPOSITOR_BTC =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const TIP_HEIGHT = 900_000;
/** A Payout buried exactly at the six-confirmation bar. */
const DEEP_PAYOUT_HEIGHT = TIP_HEIGHT - 5;

/** Payout spent and deeply confirmed; reserve untouched. The eligible state. */
function settledChain() {
  (getOutspend as Mock).mockImplementation(
    async (_txid: string, vout: number) =>
      vout === PEGIN_VAULT_VOUT
        ? {
            spent: true,
            status: { confirmed: true, block_height: DEEP_PAYOUT_HEIGHT },
          }
        : { spent: false },
  );
  (getTipHeight as Mock).mockResolvedValue(TIP_HEIGHT);
}

const broadcastParams = {
  vaultId: VAULT_ID,
  depositorBtcPubkey: DEPOSITOR_BTC,
  feeRate: 5,
  signPsbt: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();

  (getVaultFromChain as Mock).mockResolvedValue({
    depositor: DEPOSITOR_ETH,
    depositorSignedPeginTx: "0x0200000000",
    applicationEntryPoint: `0x${"44".repeat(20)}`,
    offchainParamsVersion: 1,
    appVaultKeepersVersion: 1,
    universalChallengersVersion: 1,
    vaultCoreVersion: 1,
  });
  (getUtxoInfo as Mock).mockResolvedValue({
    value: 33_000,
    scriptPubKey: `5120${"ab".repeat(32)}`,
  });
  mockBuildAndBroadcastReclaim.mockResolvedValue({ txId: "swept_txid" });
  settledChain();
});

describe("buildAndBroadcastReclaimTransaction", () => {
  it("sweeps the reserve when the payout is still settled at signing time", async () => {
    await expect(
      buildAndBroadcastReclaimTransaction(broadcastParams),
    ).resolves.toBe("swept_txid");
  });

  it("re-checks at the signing boundary, not just before preparing", async () => {
    // Between the first check and the wallet prompt the service recomputes the
    // reserve value, re-reads the vault and probes the UTXO, and the SDK then
    // runs its fee caps, PSBT build and vault-id derivation. A reorg inside
    // that window has to be caught, or the depositor signs away a live vault's
    // recovery material.
    let probeRound = 0;
    (getOutspend as Mock).mockImplementation(
      async (_txid: string, vout: number) => {
        if (vout !== PEGIN_VAULT_VOUT) return { spent: false };
        probeRound += 1;
        // Settled on the first read; the payout has been reorged out by the
        // time the signing boundary re-reads it.
        return probeRound === 1
          ? {
              spent: true,
              status: { confirmed: true, block_height: DEEP_PAYOUT_HEIGHT },
            }
          : { spent: false };
      },
    );
    const walletSign = vi.fn().mockResolvedValue("signedpsbt");
    mockBuildAndBroadcastReclaim.mockImplementation(
      async (input: {
        signPsbt: (p: string, o: unknown) => Promise<string>;
      }) => {
        await input.signPsbt("70736274ff", {});
        return { txId: "swept_txid" };
      },
    );

    await expect(
      buildAndBroadcastReclaimTransaction({
        ...broadcastParams,
        signPsbt: walletSign,
      }),
    ).rejects.toBeInstanceOf(ReclaimNoLongerEligibleError);
    // The SDK got as far as asking for a signature; the gate stopped it there.
    expect(mockBuildAndBroadcastReclaim).toHaveBeenCalled();
    expect(walletSign).not.toHaveBeenCalled();
  });

  it("refuses to broadcast when the payout is reorged out during the wallet prompt", async () => {
    // `signPsbt` is an interactive approval that can sit open for minutes, so a
    // check taken before it says nothing about the chain by the time it
    // returns. The payout is settled at entry and at the pre-prompt check, and
    // gone only by the time the signed transaction is about to be broadcast.
    let payoutProbe = 0;
    (getOutspend as Mock).mockImplementation(
      async (_txid: string, vout: number) => {
        if (vout !== PEGIN_VAULT_VOUT) return { spent: false };
        payoutProbe += 1;
        return payoutProbe <= 2
          ? {
              spent: true,
              status: { confirmed: true, block_height: DEEP_PAYOUT_HEIGHT },
            }
          : { spent: false };
      },
    );
    const walletSign = vi.fn().mockResolvedValue("signedpsbt");
    mockBuildAndBroadcastReclaim.mockImplementation(
      async (input: {
        signPsbt: (p: string, o: unknown) => Promise<string>;
        broadcastTx: (hex: string) => Promise<{ txId: string }>;
      }) => {
        const signed = await input.signPsbt("70736274ff", {});
        return input.broadcastTx(signed);
      },
    );

    await expect(
      buildAndBroadcastReclaimTransaction({
        ...broadcastParams,
        signPsbt: walletSign,
      }),
    ).rejects.toBeInstanceOf(ReclaimNoLongerEligibleError);
    // The depositor did approve — the gate stopped the broadcast, not the sign.
    expect(walletSign).toHaveBeenCalled();
    expect(pushTx).not.toHaveBeenCalled();
  });

  it("reads the chain tip before the outspends it is compared against", async () => {
    // Issued concurrently, a tip fetched after a new block could be paired with
    // a payout read from before it and overstate the depth by one — the wrong
    // direction for a gate that exists to keep a shallow payout out.
    const order: string[] = [];
    (getTipHeight as Mock).mockImplementation(async () => {
      order.push("tip");
      return TIP_HEIGHT;
    });
    (getOutspend as Mock).mockImplementation(
      async (_txid: string, vout: number) => {
        order.push(`outspend:${vout}`);
        return vout === PEGIN_VAULT_VOUT
          ? {
              spent: true,
              status: { confirmed: true, block_height: DEEP_PAYOUT_HEIGHT },
            }
          : { spent: false };
      },
    );

    await getReclaimPreview(VAULT_ID);

    expect(order[0]).toBe("tip");
  });

  it("refuses to sign when the payout is no longer spent", async () => {
    // The row was enabled off a poll up to 60s old. A reorg since then has
    // restored the vault UTXO, which makes the depositor's recovery graph live
    // again — and the reserve is its only input.
    (getOutspend as Mock).mockResolvedValue({ spent: false });

    await expect(
      buildAndBroadcastReclaimTransaction(broadcastParams),
    ).rejects.toBeInstanceOf(ReclaimNoLongerEligibleError);
    expect(mockBuildAndBroadcastReclaim).not.toHaveBeenCalled();
    expect(broadcastParams.signPsbt).not.toHaveBeenCalled();
  });

  it("refuses to sign when the payout has fallen below the confirmation bar", async () => {
    (getOutspend as Mock).mockImplementation(
      async (_txid: string, vout: number) =>
        vout === PEGIN_VAULT_VOUT
          ? {
              spent: true,
              status: { confirmed: true, block_height: TIP_HEIGHT },
            }
          : { spent: false },
    );

    await expect(
      buildAndBroadcastReclaimTransaction(broadcastParams),
    ).rejects.toBeInstanceOf(ReclaimNoLongerEligibleError);
    expect(mockBuildAndBroadcastReclaim).not.toHaveBeenCalled();
  });

  it("reports an already-swept reserve as settled rather than ineligible", async () => {
    (getOutspend as Mock).mockImplementation(
      async (_txid: string, vout: number) =>
        vout === PEGIN_VAULT_VOUT
          ? {
              spent: true,
              status: { confirmed: true, block_height: DEEP_PAYOUT_HEIGHT },
            }
          : { spent: true, status: { confirmed: true } },
    );

    await expect(
      buildAndBroadcastReclaimTransaction(broadcastParams),
    ).rejects.toBeInstanceOf(ReclaimAlreadySettledError);
    expect(mockBuildAndBroadcastReclaim).not.toHaveBeenCalled();
  });

  it("binds the sweep to the vault by passing the depositor address and outpoint", async () => {
    await buildAndBroadcastReclaimTransaction(broadcastParams);

    const call = mockBuildAndBroadcastReclaim.mock.calls[0][0];
    expect(call.vaultIds).toEqual([VAULT_ID]);
    expect(call.depositorEthAddress).toBe(DEPOSITOR_ETH);

    const [reserve] = await call.readVaults();
    expect(reserve.observed.txid).toBe("cd".repeat(32));
    expect(reserve.observed.vout).toBe(1);
  });
});

describe("getReclaimPreview", () => {
  it("returns the reclaimable amount for an eligible vault", async () => {
    await expect(getReclaimPreview(VAULT_ID)).resolves.toMatchObject({
      reclaimableSats: 33_000n,
      halfHourFeeSatsVb: 10,
    });
  });

  it("refuses to show an amount once the payout is no longer settled", async () => {
    // Surfacing the reorg here means the depositor never sees a figure for a
    // reserve they must not sweep.
    (getOutspend as Mock).mockResolvedValue({ spent: false });

    await expect(getReclaimPreview(VAULT_ID)).rejects.toBeInstanceOf(
      ReclaimNoLongerEligibleError,
    );
  });
});
