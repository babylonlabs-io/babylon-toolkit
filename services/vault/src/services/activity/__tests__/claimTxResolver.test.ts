import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above the surrounding module; any mock
// state they reference must be declared via `vi.hoisted` so it exists at
// hoist time.
const { batchGetPegoutStatus, createVpClient } = vi.hoisted(() => {
  const batchGetPegoutStatus = vi.fn();
  return {
    batchGetPegoutStatus,
    createVpClient: vi.fn(() => ({ batchGetPegoutStatus })),
  };
});

vi.mock("@/utils/rpc", () => ({ createVpClient }));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  CLAIM_TX_RPC_TIMEOUT_MS,
  resolveRedeemClaimTxids,
  type RedeemVaultLookup,
} from "../claimTxResolver";

const VP_A = "0xaaaa000000000000000000000000000000000001";
const VP_B = "0xbbbb000000000000000000000000000000000002";

function claimer(claim_txid: string, status: string = "PayoutBroadcast") {
  return {
    status,
    failed: false,
    claim_txid,
    claimer_pubkey: "",
    assert_txid: "",
    created_at: 0,
    updated_at: 0,
  };
}

describe("resolveRedeemClaimTxids", () => {
  beforeEach(() => {
    batchGetPegoutStatus.mockReset();
    createVpClient.mockClear();
  });

  it("bounds each VP call with a short timeout and no retries so a slow VP can't stall the tab", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: VP_A }],
    ]);
    batchGetPegoutStatus.mockResolvedValueOnce({ results: [] });

    await resolveRedeemClaimTxids([{ vaultId: "0xv1" }], lookup);

    expect(createVpClient).toHaveBeenCalledWith(VP_A, {
      timeout: CLAIM_TX_RPC_TIMEOUT_MS,
      retries: 0,
    });
  });

  it("returns an empty map when there are no redeem activities", async () => {
    const map = await resolveRedeemClaimTxids([], new Map());
    expect(map.size).toBe(0);
    expect(batchGetPegoutStatus).not.toHaveBeenCalled();
  });

  it("batches calls per vault provider and maps vaultId -> claim_txid", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: VP_A }],
      ["0xv2", { peginTxHash: "0xpegin2", vaultProvider: VP_A }],
      ["0xv3", { peginTxHash: "0xpegin3", vaultProvider: VP_B }],
    ]);

    batchGetPegoutStatus.mockImplementation(({ pegin_txids }) => {
      if (pegin_txids.includes("pegin1") && pegin_txids.includes("pegin2")) {
        return Promise.resolve({
          results: [
            {
              pegin_txid: "pegin1",
              result: {
                pegin_txid: "pegin1",
                found: true,
                claimer: claimer("claimA1"),
                challengers: [],
              },
              error: null,
            },
            {
              pegin_txid: "pegin2",
              result: {
                pegin_txid: "pegin2",
                found: true,
                claimer: claimer("claimA2"),
                challengers: [],
              },
              error: null,
            },
          ],
        });
      }
      return Promise.resolve({
        results: [
          {
            pegin_txid: "pegin3",
            result: {
              pegin_txid: "pegin3",
              found: true,
              claimer: claimer("claimB3"),
              challengers: [],
            },
            error: null,
          },
        ],
      });
    });

    const map = await resolveRedeemClaimTxids(
      [{ vaultId: "0xv1" }, { vaultId: "0xv2" }, { vaultId: "0xv3" }],
      lookup,
    );

    expect(map.get("0xv1")).toBe("claimA1");
    expect(map.get("0xv2")).toBe("claimA2");
    expect(map.get("0xv3")).toBe("claimB3");
    expect(batchGetPegoutStatus).toHaveBeenCalledTimes(2);
  });

  it("omits vaults whose claimer is null or unfound (pending state)", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: VP_A }],
    ]);

    batchGetPegoutStatus.mockResolvedValueOnce({
      results: [
        {
          pegin_txid: "pegin1",
          result: {
            pegin_txid: "pegin1",
            found: false,
            claimer: null,
            challengers: [],
          },
          error: null,
        },
      ],
    });

    const map = await resolveRedeemClaimTxids([{ vaultId: "0xv1" }], lookup);

    expect(map.has("0xv1")).toBe(false);
  });

  it("omits claim txids that are not yet broadcast on Bitcoin (ClaimEventReceived)", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: VP_A }],
    ]);

    batchGetPegoutStatus.mockResolvedValueOnce({
      results: [
        {
          pegin_txid: "pegin1",
          result: {
            pegin_txid: "pegin1",
            found: true,
            claimer: claimer("claimPre", "ClaimEventReceived"),
            challengers: [],
          },
          error: null,
        },
      ],
    });

    const map = await resolveRedeemClaimTxids([{ vaultId: "0xv1" }], lookup);

    expect(map.has("0xv1")).toBe(false);
  });

  it("includes the claim txid once the claim tx is broadcast (ClaimBroadcast)", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: VP_A }],
    ]);

    batchGetPegoutStatus.mockResolvedValueOnce({
      results: [
        {
          pegin_txid: "pegin1",
          result: {
            pegin_txid: "pegin1",
            found: true,
            claimer: claimer("claimLive", "ClaimBroadcast"),
            challengers: [],
          },
          error: null,
        },
      ],
    });

    const map = await resolveRedeemClaimTxids([{ vaultId: "0xv1" }], lookup);

    expect(map.get("0xv1")).toBe("claimLive");
  });

  it("treats VP errors as soft failures and returns the partial map", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: VP_A }],
      ["0xv2", { peginTxHash: "0xpegin2", vaultProvider: VP_B }],
    ]);

    batchGetPegoutStatus.mockImplementation(({ pegin_txids }) => {
      if (pegin_txids.includes("pegin1")) {
        return Promise.resolve({
          results: [
            {
              pegin_txid: "pegin1",
              result: {
                pegin_txid: "pegin1",
                found: true,
                claimer: claimer("claimA1"),
                challengers: [],
              },
              error: null,
            },
          ],
        });
      }
      return Promise.reject(new Error("VP B is unreachable"));
    });

    const map = await resolveRedeemClaimTxids(
      [{ vaultId: "0xv1" }, { vaultId: "0xv2" }],
      lookup,
    );

    expect(map.get("0xv1")).toBe("claimA1");
    expect(map.has("0xv2")).toBe(false);
  });

  it("skips redeem refs whose vault metadata is unknown", async () => {
    const map = await resolveRedeemClaimTxids(
      [{ vaultId: "0xMISSING" }],
      new Map(),
    );
    expect(map.size).toBe(0);
    expect(batchGetPegoutStatus).not.toHaveBeenCalled();
  });
});
