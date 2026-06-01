import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above the surrounding module; any mock
// state they reference must be declared via `vi.hoisted` so it exists at
// hoist time.
const { batchGetPegoutStatus, createVpClient } = vi.hoisted(() => {
  const batchGetPegoutStatus = vi.fn();
  // Typed with the real createVpClient call signature (address + options) so
  // per-test mockImplementation((address) => …) and toHaveBeenCalledWith(addr,
  // opts) both type-check; the default impl ignores its args.
  return {
    batchGetPegoutStatus,
    createVpClient: vi.fn<
      (
        address: string,
        options?: unknown,
      ) => {
        batchGetPegoutStatus: typeof batchGetPegoutStatus;
      }
    >(() => ({ batchGetPegoutStatus })),
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

// Claim txids must be 64 hex chars (a BTC txid); the resolver drops anything else.
const TXID_A1 = "a1".repeat(32);
const TXID_A2 = "a2".repeat(32);
const TXID_B3 = "b3".repeat(32);
const TXID_LIVE = "cd".repeat(32);
const TXID_PRE = "ef".repeat(32);

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
    createVpClient.mockReset();
    createVpClient.mockImplementation(() => ({ batchGetPegoutStatus }));
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
                claimer: claimer(TXID_A1),
                challengers: [],
              },
              error: null,
            },
            {
              pegin_txid: "pegin2",
              result: {
                pegin_txid: "pegin2",
                found: true,
                claimer: claimer(TXID_A2),
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
              claimer: claimer(TXID_B3),
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

    expect(map.get("0xv1")).toBe(TXID_A1);
    expect(map.get("0xv2")).toBe(TXID_A2);
    expect(map.get("0xv3")).toBe(TXID_B3);
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
            claimer: claimer(TXID_PRE, "ClaimEventReceived"),
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
            claimer: claimer(TXID_LIVE, "ClaimBroadcast"),
            challengers: [],
          },
          error: null,
        },
      ],
    });

    const map = await resolveRedeemClaimTxids([{ vaultId: "0xv1" }], lookup);

    expect(map.get("0xv1")).toBe(TXID_LIVE);
  });

  it("drops claim txids that are not valid 64-char hex", async () => {
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
            claimer: claimer("not-a-real-txid"),
            challengers: [],
          },
          error: null,
        },
      ],
    });

    const map = await resolveRedeemClaimTxids([{ vaultId: "0xv1" }], lookup);

    expect(map.has("0xv1")).toBe(false);
  });

  it("skips vaults with a malformed provider address without calling the VP", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: "0xnot-an-address" }],
      ["0xv2", { peginTxHash: "0xpegin2", vaultProvider: VP_A }],
    ]);

    batchGetPegoutStatus.mockResolvedValueOnce({
      results: [
        {
          pegin_txid: "pegin2",
          result: {
            pegin_txid: "pegin2",
            found: true,
            claimer: claimer(TXID_A2),
            challengers: [],
          },
          error: null,
        },
      ],
    });

    const map = await resolveRedeemClaimTxids(
      [{ vaultId: "0xv1" }, { vaultId: "0xv2" }],
      lookup,
    );

    expect(map.has("0xv1")).toBe(false);
    expect(map.get("0xv2")).toBe(TXID_A2);
    expect(createVpClient).toHaveBeenCalledTimes(1);
    expect(createVpClient).toHaveBeenCalledWith(VP_A, expect.anything());
  });

  it("soft-fails a provider whose client construction throws, keeping other providers", async () => {
    const lookup = new Map<string, RedeemVaultLookup>([
      ["0xv1", { peginTxHash: "0xpegin1", vaultProvider: VP_A }],
      ["0xv2", { peginTxHash: "0xpegin2", vaultProvider: VP_B }],
    ]);

    createVpClient.mockImplementation((address: string) => {
      if (address === VP_A) throw new Error("missing VP proxy url");
      return { batchGetPegoutStatus };
    });
    batchGetPegoutStatus.mockResolvedValueOnce({
      results: [
        {
          pegin_txid: "pegin2",
          result: {
            pegin_txid: "pegin2",
            found: true,
            claimer: claimer(TXID_B3),
            challengers: [],
          },
          error: null,
        },
      ],
    });

    const map = await resolveRedeemClaimTxids(
      [{ vaultId: "0xv1" }, { vaultId: "0xv2" }],
      lookup,
    );

    expect(map.has("0xv1")).toBe(false);
    expect(map.get("0xv2")).toBe(TXID_B3);
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
                claimer: claimer(TXID_A1),
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

    expect(map.get("0xv1")).toBe(TXID_A1);
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
