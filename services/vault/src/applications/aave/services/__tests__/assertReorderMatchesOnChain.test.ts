/**
 * Tests for the reorder integrity guards.
 *
 * Guard A — `assertReorderMembership`: blocks submissions where the
 * indexer-supplied vault set diverges from the user's on-chain position.
 * Returns the current on-chain ordering so Guard B can feed it into the
 * calculator.
 *
 * Guard B — `assertSuggestedOrderMatchesOnChain`: re-runs the full
 * notification calculator with on-chain amounts and blocks submissions
 * whose ordering disagrees (the same-set tamper attack), whose vaults
 * are inactive or bound to a different application, or whose trusted
 * calculator would not have suggested a reorder at all (rebalance
 * suppression).
 */

import { getPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBtcVaultBasicInfoFromChain } from "@/clients/eth-contract/btc-vault-registry/query";

import {
  PositionChangedError,
  ReorderMembershipMismatchError,
  SuggestedReorderMismatchError,
  assertReorderBaseline,
  assertReorderMembership,
  assertSuggestedOrderMatchesOnChain,
  type ReorderVerificationContext,
} from "../assertReorderMatchesOnChain";

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: vi.fn(() => ({ __mockPublicClient: true })),
  },
}));

vi.mock("@/clients/eth-contract/btc-vault-registry/query", () => ({
  getBtcVaultBasicInfoFromChain: vi.fn(),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", async () => {
  const actual = await vi.importActual<
    typeof import("@babylonlabs-io/ts-sdk/tbv/integrations/aave")
  >("@babylonlabs-io/ts-sdk/tbv/integrations/aave");
  return {
    ...actual,
    getPosition: vi.fn(),
  };
});

const mockGetPosition = vi.mocked(getPosition);
const mockGetBtcVaultBasicInfo = vi.mocked(getBtcVaultBasicInfoFromChain);

const ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;
const OTHER_APP = "0x000000000000000000000000000000000000a1ce" as Address;
const USER = "0x000000000000000000000000000000000000beef" as Address;
const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;
const VAULT_C =
  "0xcccc000000000000000000000000000000000000000000000000000000000003" as Hex;

/**
 * High-debt context where the optimizer prefers concentrating seizure on
 * the larger vault first ([A=0.6, B=0.1] → suggested [A, B]). Current
 * order in tests is [B, A] so `calculate()` will surface a non-null
 * `suggestedVaultOrder = [A, B]`.
 */
const CONTEXT_BASE: ReorderVerificationContext = {
  CF: 0.7,
  THF: 1.1,
  maxLB: 1.05,
  btcPrice: 60_000,
  totalDebtUsd: 10_000,
};

const STATUS_ACTIVE = 2;
const STATUS_REDEEMED = 3;

function activeInfo(amount: bigint, app: Address = ADAPTER) {
  return {
    amount,
    status: STATUS_ACTIVE,
    applicationEntryPoint: app,
  };
}

function basicInfoMap(
  entries: Array<[Hex, ReturnType<typeof activeInfo>]>,
): Map<Hex, ReturnType<typeof activeInfo>> {
  return new Map(entries.map(([id, info]) => [id.toLowerCase() as Hex, info]));
}

describe("assertReorderMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves and returns the on-chain ordering when the submitted multiset matches (case-insensitive)", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: "0x1" as Address,
      vaultIds: [VAULT_A.toLowerCase() as Hex, VAULT_B.toUpperCase() as Hex],
    });

    const onChain = await assertReorderMembership(ADAPTER, USER, [
      VAULT_B,
      VAULT_A,
    ]);

    expect(onChain).toEqual([VAULT_A.toLowerCase(), VAULT_B.toUpperCase()]);
  });

  it("calls getPosition against the env-pinned adapter address", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: "0x1" as Address,
      vaultIds: [VAULT_A],
    });

    await assertReorderMembership(ADAPTER, USER, [VAULT_A]);

    expect(mockGetPosition).toHaveBeenCalledTimes(1);
    expect(mockGetPosition.mock.calls[0][1]).toBe(ADAPTER);
    expect(mockGetPosition.mock.calls[0][2]).toBe(USER);
  });

  it("throws ReorderMembershipMismatchError when a phantom vault is submitted", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: "0x1" as Address,
      vaultIds: [VAULT_A, VAULT_B],
    });

    await expect(
      assertReorderMembership(ADAPTER, USER, [VAULT_A, VAULT_C]),
    ).rejects.toBeInstanceOf(ReorderMembershipMismatchError);
  });

  it("throws when the submitted set is shorter than on-chain", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: "0x1" as Address,
      vaultIds: [VAULT_A, VAULT_B],
    });

    await expect(
      assertReorderMembership(ADAPTER, USER, [VAULT_A]),
    ).rejects.toBeInstanceOf(ReorderMembershipMismatchError);
  });

  it("throws when a vault is duplicated and another is dropped", async () => {
    mockGetPosition.mockResolvedValue({
      proxyContract: "0x1" as Address,
      vaultIds: [VAULT_A, VAULT_B],
    });

    await expect(
      assertReorderMembership(ADAPTER, USER, [VAULT_A, VAULT_A]),
    ).rejects.toBeInstanceOf(ReorderMembershipMismatchError);
  });

  it("throws when the user has no on-chain position", async () => {
    mockGetPosition.mockResolvedValue(null);

    await expect(
      assertReorderMembership(ADAPTER, USER, [VAULT_A]),
    ).rejects.toBeInstanceOf(ReorderMembershipMismatchError);
  });

  it("propagates RPC errors from getPosition", async () => {
    mockGetPosition.mockRejectedValue(new Error("rpc unavailable"));

    await expect(
      assertReorderMembership(ADAPTER, USER, [VAULT_A]),
    ).rejects.toThrow("rpc unavailable");
  });
});

describe("assertSuggestedOrderMatchesOnChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when the submission equals the calculator's suggested order under on-chain amounts", async () => {
    // Current order [B, A] is suboptimal (smaller-first cliff). Calculator
    // suggests [A, B] (larger-first). Submission matches.
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(10_000_000n)],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects an attacker-chosen permutation under on-chain amounts (PoC)", async () => {
    // Indexer steered the user to submit [B, A] (the current order, but
    // labeled as "optimal" by tampered amounts). Calculator's true
    // suggestion under on-chain amounts is [A, B] → mismatch.
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(10_000_000n)],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_B, VAULT_A],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).rejects.toBeInstanceOf(SuggestedReorderMismatchError);
  });

  it("rejects when the trusted calculator would not have suggested a reorder (no debt)", async () => {
    // No-debt scenario → calculator returns early with suggestedVaultOrder: null.
    // Indexer would have fabricated a CTA; Guard B refuses.
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(10_000_000n)],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        { ...CONTEXT_BASE, totalDebtUsd: 0 },
      ),
    ).rejects.toBeInstanceOf(SuggestedReorderMismatchError);
  });

  it("rejects when the current ordering is already optimal (calculator returns null)", async () => {
    // Current order already matches calculator's optimum → no reorder needed.
    // An indexer-fabricated submission would have to differ from current,
    // but Guard B refuses because the calculator says "no suggestion".
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(10_000_000n)],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_B, VAULT_A],
        [VAULT_A, VAULT_B],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).rejects.toBeInstanceOf(SuggestedReorderMismatchError);
  });

  it("rejects when any vault is not in ACTIVE status", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [
          VAULT_B,
          {
            amount: 10_000_000n,
            status: STATUS_REDEEMED,
            applicationEntryPoint: ADAPTER,
          },
        ],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).rejects.toBeInstanceOf(SuggestedReorderMismatchError);
  });

  it("rejects when a vault's applicationEntryPoint differs from the trusted adapter", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(10_000_000n, OTHER_APP)],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).rejects.toBeInstanceOf(SuggestedReorderMismatchError);
  });

  it("matches applicationEntryPoint case-insensitively", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n, ADAPTER.toUpperCase() as Address)],
        [VAULT_B, activeInfo(10_000_000n)],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).resolves.toBeUndefined();
  });

  it("matches vault IDs case-insensitively against on-chain keys", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([
        [VAULT_A, activeInfo(60_000_000n)],
        [VAULT_B, activeInfo(10_000_000n)],
      ]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A.toUpperCase() as Hex, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects empty submissions", async () => {
    await expect(
      assertSuggestedOrderMatchesOnChain([], [], ADAPTER, CONTEXT_BASE),
    ).rejects.toBeInstanceOf(SuggestedReorderMismatchError);
    expect(mockGetBtcVaultBasicInfo).not.toHaveBeenCalled();
  });

  it("propagates registry errors as fail-closed", async () => {
    mockGetBtcVaultBasicInfo.mockRejectedValue(
      new Error("vault not registered on-chain"),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).rejects.toThrow("vault not registered on-chain");
  });

  it("throws SuggestedReorderMismatchError when the registry omits a vault from its response", async () => {
    mockGetBtcVaultBasicInfo.mockResolvedValue(
      basicInfoMap([[VAULT_A, activeInfo(60_000_000n)]]),
    );

    await expect(
      assertSuggestedOrderMatchesOnChain(
        [VAULT_A, VAULT_B],
        [VAULT_B, VAULT_A],
        ADAPTER,
        CONTEXT_BASE,
      ),
    ).rejects.toBeInstanceOf(SuggestedReorderMismatchError);
  });
});

describe("assertReorderBaseline", () => {
  it("resolves when live ordering equals the expected baseline", () => {
    expect(() =>
      assertReorderBaseline([VAULT_A, VAULT_B], [VAULT_A, VAULT_B]),
    ).not.toThrow();
  });

  it("matches case-insensitively on the bytes32 hex", () => {
    expect(() =>
      assertReorderBaseline(
        [VAULT_A.toLowerCase() as Hex, VAULT_B.toUpperCase() as Hex],
        [VAULT_A.toUpperCase() as Hex, VAULT_B.toLowerCase() as Hex],
      ),
    ).not.toThrow();
  });

  it("throws PositionChangedError on same-set/different-order (concurrent-modification race)", () => {
    // User opened modal at [A, B]. Live ordering raced to [B, A]. The
    // multiset still matches (Guard A would pass), but the order
    // differs — Guard C must catch it.
    expect(() =>
      assertReorderBaseline([VAULT_B, VAULT_A], [VAULT_A, VAULT_B]),
    ).toThrow(PositionChangedError);
  });

  it("throws PositionChangedError when lengths differ", () => {
    expect(() => assertReorderBaseline([VAULT_A], [VAULT_A, VAULT_B])).toThrow(
      PositionChangedError,
    );
  });
});
