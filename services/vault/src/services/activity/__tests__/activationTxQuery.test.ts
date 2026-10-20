import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/clients/graphql", () => ({
  graphqlClient: {
    request: vi.fn(),
  },
}));

import { graphqlClient } from "@/clients/graphql";

import { fetchActivationRows } from "../activationTxQuery";

const mockRequest = vi.mocked(graphqlClient.request);

const VAULT_A = `0x${"AA".repeat(32)}` as Hex;
const VAULT_B = `0x${"bb".repeat(32)}` as Hex;
const ACTIVATION_TX_A = `0x${"1a".repeat(32)}` as Hex;
const CLAIM_EXPIRED_TX_B = `0x${"2b".repeat(32)}` as Hex;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchActivationRows", () => {
  it("returns the deposit activity's transaction hash per vault, keyed by the id as given", async () => {
    mockRequest.mockResolvedValue({
      vaultActivitys: {
        items: [
          {
            vaultId: VAULT_A.toLowerCase(),
            type: "deposit",
            transactionHash: ACTIVATION_TX_A,
          },
        ],
      },
    });

    const rows = await fetchActivationRows([VAULT_A, VAULT_B]);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
      vaultIds: [VAULT_A.toLowerCase(), VAULT_B],
      limit: 2,
    });
    expect(rows.get(VAULT_A)).toEqual({
      kind: "activation",
      txHash: ACTIVATION_TX_A,
    });
    expect(rows.has(VAULT_A.toLowerCase())).toBe(false);
  });

  it("marks a vault whose row is claim_expired as claimed with no activation", async () => {
    mockRequest.mockResolvedValue({
      vaultActivitys: {
        items: [
          {
            vaultId: VAULT_B,
            type: "claim_expired",
            transactionHash: CLAIM_EXPIRED_TX_B,
          },
        ],
      },
    });

    const rows = await fetchActivationRows([VAULT_B]);

    expect(rows.get(VAULT_B)).toEqual({ kind: "claimed_expired" });
  });

  it("omits a vault whose row does not exist yet", async () => {
    mockRequest.mockResolvedValue({ vaultActivitys: { items: [] } });

    const rows = await fetchActivationRows([VAULT_A]);

    expect(rows.size).toBe(0);
  });
});
