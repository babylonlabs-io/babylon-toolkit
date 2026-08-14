/**
 * Tests for the resume-rebuild core (#2220 Part 2).
 *
 * Two layers:
 *  - Guards: the fail-closed checks that run BEFORE the WASM recompute (Gate 0
 *    tx-hash binding, prepeginMaxFee positivity, auth-anchor OP_RETURN
 *    completeness). No WASM fixture needed.
 *  - Golden (WASM-backed): a real WASM-shaped funded tx — valid keys, real HTLC
 *    connector scriptPubKeys, real sizing (DCV + minPeginFee + anchor) — fed
 *    through the whole pipeline (Gate 0 → OP_RETURN anchor → Gate 1 byte-match →
 *    projection). Proves the happy path executes end-to-end and projects the
 *    correct DepositTerms, complementing the guards. Two-vault (mandatory for
 *    chain logic) + both anchor branches (v1 = 0, v2 = P2A anchor).
 */

import {
  computeMinClaimValue,
  computeMinPeginFee,
  getPrePeginHtlcConnectorInfo,
  peginP2aAnchorOutput,
  type Network,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

import {
  TEST_KEYS,
  initializeWasmForTests,
} from "../../primitives/psbt/__tests__/helpers";
import { stripHexPrefix } from "../../primitives/utils/bitcoin";
import { calculateBtcTxHash } from "../../utils/transaction/btcTxHash";
import {
  rebuildDepositTermsCore,
  type RebuildDepositTermsCoreInput,
} from "../rebuildDepositTermsCore";

/** A funded Pre-PegIn tx: `htlcCount` P2TR-ish HTLC outputs, then (optionally) the
 * auth-anchor OP_RETURN `6a20<32 bytes>` value 0 at vout `opReturnVout`. */
function makeFundedTx(opts: {
  htlcCount: number;
  opReturnVout?: number;
}): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0);
  for (let i = 0; i < opts.htlcCount; i++) {
    tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1000);
  }
  if (opts.opReturnVout !== undefined) {
    while (tx.outs.length < opts.opReturnVout) {
      tx.addOutput(Buffer.from(`0014${"00".repeat(20)}`, "hex"), 500);
    }
    tx.addOutput(
      Buffer.concat([Buffer.from([0x6a, 0x20]), Buffer.alloc(32, 0xab)]),
      0,
    );
  }
  return tx.toHex();
}

/** A structurally complete input; the fields after the guards are unused because
 * every test throws before the WASM recompute. */
function makeInput(
  over: Partial<RebuildDepositTermsCoreInput> & {
    fundedPrePeginTxHex: string;
  },
): RebuildDepositTermsCoreInput {
  return {
    vaultCoreVersion: 2,
    siblings: [{ hashlock: "ab".repeat(32), amount: 1_000_000n }],
    depositorBtcPubkey: "ab".repeat(32),
    vaultProviderBtcPubkey: "cc".repeat(32),
    vaultKeeperBtcPubkeys: ["dd".repeat(32)],
    universalChallengerBtcPubkeys: ["ee".repeat(32)],
    protocolFeeRate: 2n,
    minPeginFeeRate: 2n,
    councilQuorum: 1,
    councilSize: 1,
    timelockPegin: 684,
    timelockAssert: 684,
    timelockRefund: 2016,
    prepeginTxid: stripHexPrefix(
      calculateBtcTxHash(over.fundedPrePeginTxHex),
    ).toLowerCase(),
    prepeginMaxFee: 500n,
    maxAcceptableCommissionBps: 100,
    network: "signet" as never,
    ...over,
  };
}

describe("rebuildDepositTermsCore guards", () => {
  it("throws when prepeginMaxFee is not positive", async () => {
    const fundedPrePeginTxHex = makeFundedTx({ htlcCount: 1, opReturnVout: 1 });
    await expect(
      rebuildDepositTermsCore(
        makeInput({ fundedPrePeginTxHex, prepeginMaxFee: 0n }),
      ),
    ).rejects.toThrow(/prepeginMaxFee must be > 0/);
  });

  it("throws when the funded tx does not hash to prepeginTxid (Gate 0)", async () => {
    const fundedPrePeginTxHex = makeFundedTx({ htlcCount: 1, opReturnVout: 1 });
    await expect(
      rebuildDepositTermsCore(
        makeInput({ fundedPrePeginTxHex, prepeginTxid: "00".repeat(32) }),
      ),
    ).rejects.toThrow(/does not hash|hashes to/);
  });

  it("throws when the auth-anchor OP_RETURN is absent (fail-closed, not skipped)", async () => {
    const fundedPrePeginTxHex = makeFundedTx({ htlcCount: 1 }); // no OP_RETURN
    await expect(
      rebuildDepositTermsCore(makeInput({ fundedPrePeginTxHex })),
    ).rejects.toThrow(/absent or ambiguous|sibling set is incomplete/);
  });

  it("throws when the OP_RETURN vout disagrees with the sibling count", async () => {
    // OP_RETURN at vout 2 but only 1 sibling supplied → incomplete set.
    const fundedPrePeginTxHex = makeFundedTx({ htlcCount: 2, opReturnVout: 2 });
    await expect(
      rebuildDepositTermsCore(
        makeInput({
          fundedPrePeginTxHex,
          siblings: [{ hashlock: "ab".repeat(32), amount: 1_000_000n }],
        }),
      ),
    ).rejects.toThrow(/does not match sibling count/);
  });

  it("throws on an empty sibling set", async () => {
    const fundedPrePeginTxHex = makeFundedTx({ htlcCount: 1, opReturnVout: 1 });
    await expect(
      rebuildDepositTermsCore(makeInput({ fundedPrePeginTxHex, siblings: [] })),
    ).rejects.toThrow(/at least one sibling/);
  });
});

describe("rebuildDepositTermsCore golden (WASM-backed happy path)", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });

  const NETWORK = "signet" as Network;
  const TIMELOCK_REFUND = 2016;
  const TIMELOCK_PEGIN = 684;
  const TIMELOCK_ASSERT = 684;
  const COUNCIL_QUORUM = 2;
  const COUNCIL_SIZE = 3;
  const PROTOCOL_FEE_RATE = 2n;
  const MIN_PEGIN_FEE_RATE = 2n;
  const PREPEGIN_MAX_FEE = 1500n;
  const COMMISSION_BPS = 250;
  const BPS_DENOMINATOR = 10_000n;

  const DEPOSITOR = TEST_KEYS.DEPOSITOR;
  const VP = TEST_KEYS.VAULT_PROVIDER;
  const VKS = [TEST_KEYS.VAULT_KEEPER_1, TEST_KEYS.VAULT_KEEPER_2];
  const UCS = [TEST_KEYS.UNIVERSAL_CHALLENGER_1];

  interface Sibling {
    hashlock: string;
    amount: bigint;
  }

  /** Amount-independent sizing, recomputed exactly as the core does. */
  async function sizing(version: number) {
    const dcv = await computeMinClaimValue(
      version,
      VKS.length,
      UCS.length,
      COUNCIL_QUORUM,
      COUNCIL_SIZE,
      PROTOCOL_FEE_RATE,
    );
    const fee = await computeMinPeginFee(
      version,
      VKS.length,
      UCS.length,
      MIN_PEGIN_FEE_RATE,
    );
    const anchor = (await peginP2aAnchorOutput(version))?.value ?? 0n;
    return { dcv, fee, anchor };
  }

  /**
   * Build a funded tx whose HTLC outputs carry the REAL connector scriptPubKey +
   * `amount + DCV + peginMaxFee + anchor` value, followed by the auth-anchor
   * OP_RETURN at vout === sibling count — i.e. a tx the core's Gate 1 accepts.
   */
  async function buildRealFundedTx(version: number, siblings: Sibling[]) {
    const { dcv, fee, anchor } = await sizing(version);
    const tx = new Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, 0x11), 0);
    for (const s of siblings) {
      const info = await getPrePeginHtlcConnectorInfo({
        txGraphVersion: version,
        depositorPubkey: DEPOSITOR,
        vaultProviderPubkey: VP,
        vaultKeeperPubkeys: VKS,
        universalChallengerPubkeys: UCS,
        hashlock: s.hashlock,
        timelockRefund: TIMELOCK_REFUND,
        network: NETWORK,
      });
      tx.addOutput(
        Buffer.from(info.scriptPubKey, "hex"),
        Number(s.amount + dcv + fee + anchor),
      );
    }
    tx.addOutput(
      Buffer.concat([Buffer.from([0x6a, 0x20]), Buffer.alloc(32, 0xcd)]),
      0,
    );
    return { txHex: tx.toHex(), dcv, fee, anchor };
  }

  function baseInput(
    version: number,
    siblings: Sibling[],
    txHex: string,
  ): RebuildDepositTermsCoreInput {
    return {
      vaultCoreVersion: version,
      siblings,
      fundedPrePeginTxHex: txHex,
      depositorBtcPubkey: DEPOSITOR,
      vaultProviderBtcPubkey: VP,
      vaultKeeperBtcPubkeys: VKS,
      universalChallengerBtcPubkeys: UCS,
      protocolFeeRate: PROTOCOL_FEE_RATE,
      minPeginFeeRate: MIN_PEGIN_FEE_RATE,
      councilQuorum: COUNCIL_QUORUM,
      councilSize: COUNCIL_SIZE,
      timelockPegin: TIMELOCK_PEGIN,
      timelockAssert: TIMELOCK_ASSERT,
      timelockRefund: TIMELOCK_REFUND,
      prepeginTxid: stripHexPrefix(calculateBtcTxHash(txHex)).toLowerCase(),
      prepeginMaxFee: PREPEGIN_MAX_FEE,
      maxAcceptableCommissionBps: COMMISSION_BPS,
      network: NETWORK,
    };
  }

  it("rebuilds two-vault v2 terms with per-vault sizing, ordering, and commission ceiling", async () => {
    const siblings: Sibling[] = [
      { hashlock: "ab".repeat(32), amount: 1_000_000n },
      { hashlock: "cd".repeat(32), amount: 2_500_000n },
    ];
    const { txHex, dcv, fee, anchor } = await buildRealFundedTx(2, siblings);
    const input = baseInput(2, siblings, txHex);

    const terms = await rebuildDepositTermsCore(input);

    expect(terms.vaultCoreVersion).toBe(2);
    expect(terms.prepeginTxid).toBe(input.prepeginTxid);
    expect(terms.prepeginMaxFee).toBe(PREPEGIN_MAX_FEE);
    expect(terms.timelockPegin).toBe(TIMELOCK_PEGIN);
    expect(terms.timelockAssert).toBe(TIMELOCK_ASSERT);
    expect(terms.timelockRefund).toBe(TIMELOCK_REFUND);
    expect(terms.vaultKeeperBtcPubkeys).toEqual(VKS);
    expect(terms.universalChallengerBtcPubkeys).toEqual(UCS);
    expect(anchor).toBeGreaterThan(0n); // v2 carries the P2A anchor
    expect(terms.vaults).toHaveLength(2);

    terms.vaults.forEach((v, i) => {
      expect(v.htlcVout).toBe(i);
      expect(v.peginAmount).toBe(siblings[i].amount);
      expect(v.vaultProviderBtcPubkey).toBe(VP);
      expect(v.depositorClaimValue).toBe(dcv);
      expect(v.peginMaxFee).toBe(fee);
      expect(v.commissionFee).toBe(
        (siblings[i].amount * BigInt(COMMISSION_BPS)) / BPS_DENOMINATOR,
      );
    });
  });

  it("rebuilds single-vault v1 terms (zero-anchor branch)", async () => {
    const siblings: Sibling[] = [{ hashlock: "ef".repeat(32), amount: 750_000n }];
    const { txHex, dcv, fee, anchor } = await buildRealFundedTx(1, siblings);
    const input = baseInput(1, siblings, txHex);

    const terms = await rebuildDepositTermsCore(input);

    expect(anchor).toBe(0n); // v1 has no P2A anchor
    expect(terms.vaultCoreVersion).toBe(1);
    expect(terms.vaults).toHaveLength(1);
    expect(terms.vaults[0].peginAmount).toBe(750_000n);
    expect(terms.vaults[0].depositorClaimValue).toBe(dcv);
    expect(terms.vaults[0].peginMaxFee).toBe(fee);
  });
});
