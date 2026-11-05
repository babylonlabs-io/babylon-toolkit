/**
 * stuckVaultRows — a stuck vault's row holds what the chain and Bitcoin say, so a
 * row the indexer left out or got wrong cannot hide the vault's exit.
 */

import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { StuckVault } from "../../hooks/useStuckVaults";
import {
  ContractStatus,
  PEGIN_DISPLAY_LABELS,
} from "../../models/peginStateMachine";
import type { VaultActivity } from "../../types/activity";
import { isActivationBlockedByEarlierSibling } from "../batchedPegin";
import { applyStuckVaults, buildStuckActivity } from "../stuckVaultRows";

vi.mock("../../config", () => ({
  getNetworkConfigBTC: () => ({ coinSymbol: "BTC", icon: "btc-icon.svg" }),
}));

const VAULT_ID = `0x${"aa".repeat(32)}` as Hex;
const CHAIN_PUBKEY = `0x${"ab".repeat(32)}` as Hex;
const CHAIN_PEGIN_TX = `0x${"ef".repeat(32)}` as Hex;
const CHAIN_PRE_PEGIN_TX = `0x${"cd".repeat(32)}` as Hex;
const CHAIN_PROVIDER = "0x0000000000000000000000000000000000000001";
const CHAIN_APPLICATION = "0x0000000000000000000000000000000000000002";
const CHAIN_HTLC_VOUT = 2;
const CHAIN_PRE_PEGIN_HEX = "0x0200000001" as Hex;
const INDEXED_TIMESTAMP = 1_700_000_000_000;

function makeStuckVault(id: Hex = VAULT_ID): StuckVault {
  return {
    id,
    basic: {
      depositor: "0x000000000000000000000000000000000000dEaD",
      depositorBtcPubKey: CHAIN_PUBKEY,
      amount: 100_000_000n,
      vaultProvider: CHAIN_PROVIDER,
      status: 1,
      applicationEntryPoint: CHAIN_APPLICATION,
      createdAt: 950n,
    },
    protocol: {
      depositorSignedPeginTx: "0xdeadbeef",
      universalChallengersVersion: 1,
      appVaultKeepersVersion: 1,
      offchainParamsVersion: 7,
      verifiedAt: 960n,
      depositorWotsPkHash: `0x${"11".repeat(32)}`,
      hashlock: `0x${"22".repeat(32)}`,
      htlcVout: CHAIN_HTLC_VOUT,
      depositorPopSignature: "0x",
      prePeginTxHash: CHAIN_PRE_PEGIN_TX,
      vaultProviderCommissionBps: 100,
      claimExpiredUntil: 0n,
      vaultCoreVersion: 1,
      vaultProviderKeyEpoch: 0n,
      vaultKeeperKeyEpoch: 0n,
      universalChallengerKeyEpoch: 0n,
    } as unknown as StuckVault["protocol"],
    peginTxHash: CHAIN_PEGIN_TX,
    prePeginTxHex: CHAIN_PRE_PEGIN_HEX,
  };
}

/**
 * An indexer row wrong in every field a stuck row could carry, so a field copied
 * from it shows up as a difference from the chain-built row.
 */
function makeLyingRow(overrides: Partial<VaultActivity> = {}): VaultActivity {
  return {
    id: VAULT_ID,
    collateral: { amount: "99", symbol: "BTC" },
    providers: [{ id: "0x00000000000000000000000000000000000000ff" }],
    action: { label: "indexer says act", onClick: () => {} },
    contractStatus: ContractStatus.REDEEMED,
    expiryUnreported: true,
    stuckOnChain: false,
    displayLabel: PEGIN_DISPLAY_LABELS.READY_TO_ACTIVATE,
    isPending: true,
    pendingMessage: "indexer says pending",
    position: {
      collateral: 1n,
      borrowShares: 1n,
      borrowed: 1n,
      borrowAssets: 1n,
    },
    borrowingData: {
      borrowedAmount: "1 USDC",
      borrowedSymbol: "USDC",
      currentLTV: 1,
      maxLTV: 1,
    },
    marketData: { btcPriceUSD: 1, lltvPercent: 1 },
    positionDate: new Date(INDEXED_TIMESTAMP),
    marketId: "indexer-market",
    applicationEntryPoint: "0x00000000000000000000000000000000000000fe",
    depositorBtcPubkey: `0x${"99".repeat(32)}`,
    depositorSignedPeginTx: "0xbad",
    peginTxHash: `0x${"98".repeat(32)}` as Hex,
    prePeginTxHash: `0x${"97".repeat(32)}` as Hex,
    htlcVout: 9,
    constructionIndex: 9,
    unsignedPrePeginTx: "0xbad",
    depositorPayoutBtcAddress: `0x${"96".repeat(32)}` as Hex,
    depositorWotsPkHash: "0xbad",
    offchainParamsVersion: 99,
    isInUse: true,
    expiredAt: 123,
    expirationReason: "ack_timeout",
    redeemReason: { kind: "cap_exceeded" },
    timestamp: INDEXED_TIMESTAMP,
    ...overrides,
  };
}

describe("buildStuckActivity", () => {
  it("takes every decision-making field from the chain and Bitcoin, for a vault the indexer left out", () => {
    const row = buildStuckActivity(makeStuckVault(), undefined);

    expect(row).toMatchObject({
      id: VAULT_ID,
      contractStatus: ContractStatus.VERIFIED,
      stuckOnChain: true,
      depositorBtcPubkey: CHAIN_PUBKEY,
      peginTxHash: CHAIN_PEGIN_TX,
      prePeginTxHash: CHAIN_PRE_PEGIN_TX,
      htlcVout: CHAIN_HTLC_VOUT,
      constructionIndex: CHAIN_HTLC_VOUT,
      unsignedPrePeginTx: CHAIN_PRE_PEGIN_HEX,
      providers: [{ id: CHAIN_PROVIDER }],
      applicationEntryPoint: CHAIN_APPLICATION,
      offchainParamsVersion: 7,
      collateral: { amount: "1", symbol: "BTC" },
    });
    expect(row.timestamp).toBeUndefined();
  });

  it("keeps nothing but the timestamp from a row the indexer got wrong", () => {
    const row = buildStuckActivity(makeStuckVault(), makeLyingRow());

    expect(row).toEqual({
      ...buildStuckActivity(makeStuckVault(), undefined),
      timestamp: INDEXED_TIMESTAMP,
    });
  });
});

describe("applyStuckVaults", () => {
  const NO_EXPIRIES = new Map();

  it("returns the same array when nothing is stuck, so memos on it hold", () => {
    const rows = [makeLyingRow()];

    expect(applyStuckVaults(rows, new Map(), NO_EXPIRIES)).toBe(rows);
  });

  it("adds a row for a stuck vault when the indexer has answered nothing at all", () => {
    const rows = applyStuckVaults(
      [],
      new Map([[VAULT_ID, makeStuckVault()]]),
      NO_EXPIRIES,
    );

    expect(rows.map((row) => row.id)).toEqual([VAULT_ID]);
  });

  it("leaves one row under the lowercase chain id when the indexer's row is mixed-case", () => {
    const rows = applyStuckVaults(
      [makeLyingRow({ id: VAULT_ID.toUpperCase().replace("0X", "0x") as Hex })],
      new Map([[VAULT_ID, makeStuckVault()]]),
      NO_EXPIRIES,
    );

    expect(rows.map((row) => row.id)).toEqual([VAULT_ID]);
    expect(rows[0].timestamp).toBe(INDEXED_TIMESTAMP);
  });

  it("leaves every other row untouched", () => {
    const other = makeLyingRow({ id: `0x${"bb".repeat(32)}` as Hex });

    const rows = applyStuckVaults(
      [other, makeLyingRow()],
      new Map([[VAULT_ID, makeStuckVault()]]),
      NO_EXPIRIES,
    );

    expect(rows).toContain(other);
    expect(rows).toHaveLength(2);
  });

  it("leaves a vault alone once the expiry check has read its deadline passed", () => {
    const rows = [makeLyingRow()];

    const result = applyStuckVaults(
      rows,
      new Map([[VAULT_ID, makeStuckVault()]]),
      new Map([[VAULT_ID, { state: "unreported" }]]),
    );

    expect(result).toBe(rows);
  });

  it("holds a later indexed sibling's activation behind a stuck vault of the same Pre-PegIn", () => {
    const earlierId = `0x${"01".repeat(32)}` as Hex;
    const stuckEarlier = makeStuckVault(earlierId);
    stuckEarlier.protocol = { ...stuckEarlier.protocol, htlcVout: 0 };
    const laterSibling = makeLyingRow({
      id: `0x${"02".repeat(32)}` as Hex,
      contractStatus: ContractStatus.VERIFIED,
      unsignedPrePeginTx: CHAIN_PRE_PEGIN_HEX,
      constructionIndex: 1,
      htlcVout: 1,
    });

    const rows = applyStuckVaults(
      [laterSibling],
      new Map([[earlierId, stuckEarlier]]),
      NO_EXPIRIES,
    );

    expect(isActivationBlockedByEarlierSibling(rows, laterSibling)).toBe(true);
  });
});
