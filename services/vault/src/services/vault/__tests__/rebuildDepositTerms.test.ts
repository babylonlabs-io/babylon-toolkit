import {
  rebuildDepositTermsCore,
  resolveParticipantKeysAtEpochs,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Transaction } from "bitcoinjs-lib";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
  type OnChainVaultData,
} from "../../../clients/eth-contract/btc-vault-registry/query";
import {
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../../clients/eth-contract/sdk-readers";
import { fetchVaultIdsByDepositor } from "../fetchVaults";
import {
  assertContiguousHtlcVector,
  assertSiblingBatchHomogeneous,
  rebuildDepositTerms,
} from "../rebuildDepositTerms";
import { resolveVaultProviderBtcPubkey } from "../vaultPayoutSignatureService";

// Orchestrator collaborators — mocked (hoisted by vitest above the imports) so
// `rebuildDepositTerms` runs end-to-end (real discoverSiblings + field mapping)
// without chain access or WASM. The ts-sdk core is mocked to CAPTURE its input;
// the mapping IS the behavior under test. The pure-assert describes need none.
vi.mock("@babylonlabs-io/ts-sdk/tbv/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@babylonlabs-io/ts-sdk/tbv/core")>()),
  rebuildDepositTermsCore: vi.fn(),
  resolveParticipantKeysAtEpochs: vi.fn(),
}));
vi.mock("@/utils/vaultCoreVersionSupport", () => ({
  assertVaultCoreVersionSupported: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getVaultFromChain: vi.fn(),
  getVaultKeyEpochsFromChain: vi.fn(),
  getVaultProviderGenesisBtcPubkeyFromChain: vi.fn(),
}));
vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getOperationKeyReader: vi.fn().mockResolvedValue({}),
  getProtocolParamsReader: vi.fn(),
  getUniversalChallengerReader: vi.fn(),
  getVaultKeeperReader: vi.fn(),
  getVaultRegistryReader: vi.fn(),
}));
vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "signet"),
}));
vi.mock("../fetchVaults", () => ({
  fetchVaultIdsByDepositor: vi.fn(),
}));
// importOriginal keeps the real assertVpCommissionInProtocolRange so the
// commission-ceiling mapping is exercised end-to-end.
vi.mock("../vaultPayoutSignatureService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../vaultPayoutSignatureService")>()),
  resolveVaultProviderBtcPubkey: vi.fn(),
}));

// Only the fields the homogeneity assert reads matter here; the cast keeps the
// fixture minimal instead of faking the full on-chain record.
function makeVault(over: Partial<OnChainVaultData> = {}): OnChainVaultData {
  return {
    // OnChainBtcVaultStatus.PENDING — the only broadcastable state.
    status: 0,
    vaultCoreVersion: 2,
    offchainParamsVersion: 3,
    appVaultKeepersVersion: 4,
    universalChallengersVersion: 5,
    vaultProviderCommissionBps: 250,
    applicationEntryPoint: "0xaaaa000000000000000000000000000000000001",
    vaultProvider: "0xbbbb000000000000000000000000000000000002",
    ...over,
  } as OnChainVaultData;
}

describe("assertSiblingBatchHomogeneous", () => {
  it("accepts siblings whose stamps, provider, application, and commission match the target", () => {
    const target = makeVault();
    expect(() =>
      assertSiblingBatchHomogeneous(target, [makeVault(), makeVault()]),
    ).not.toThrow();
  });

  it("rejects a sibling that is no longer PENDING (would be silently funded)", () => {
    const target = makeVault();
    // On-chain Expired(4) — the indexer-facing gate only checks the target.
    const sib = makeVault({ status: 4 });
    expect(() => assertSiblingBatchHomogeneous(target, [sib])).toThrow(
      /no longer awaiting broadcast/,
    );
  });

  it("rejects a non-PENDING target (chain-read authority over the indexer gate)", () => {
    const target = makeVault({ status: 4 });
    expect(() => assertSiblingBatchHomogeneous(target, [makeVault()])).toThrow(
      /no longer awaiting broadcast/,
    );
  });

  it("accepts address fields that differ only by case", () => {
    const target = makeVault();
    const sib = makeVault({
      vaultProvider:
        "0xBBBB000000000000000000000000000000000002" as OnChainVaultData["vaultProvider"],
    });
    expect(() => assertSiblingBatchHomogeneous(target, [sib])).not.toThrow();
  });

  // Each sibling is stamped by its own submitPeginRequest, so any of these can
  // drift if governance/VP changes land between sibling registrations. Gate 1
  // cannot see timelockPegin/timelockAssert/commission, so each must fail here.
  it.each([
    ["vaultCoreVersion", 1],
    ["offchainParamsVersion", 9],
    ["appVaultKeepersVersion", 9],
    ["universalChallengersVersion", 9],
    ["vaultProviderCommissionBps", 300],
  ] as const)("rejects a sibling with a different %s", (field, value) => {
    const target = makeVault();
    const sib = makeVault({ [field]: value });
    expect(() => assertSiblingBatchHomogeneous(target, [sib])).toThrow(
      new RegExp(`disagree on ${field}`),
    );
  });

  it.each([
    ["applicationEntryPoint", "0xcccc000000000000000000000000000000000003"],
    ["vaultProvider", "0xcccc000000000000000000000000000000000003"],
  ] as const)("rejects a sibling with a different %s", (field, value) => {
    const target = makeVault();
    const sib = makeVault({
      [field]: value as OnChainVaultData["vaultProvider"],
    });
    expect(() => assertSiblingBatchHomogeneous(target, [sib])).toThrow(
      new RegExp(`disagree on ${field}`),
    );
  });
});

describe("assertContiguousHtlcVector", () => {
  const sib = (htlcVout: number) => ({
    htlcVout,
    hashlock: "ab".repeat(32),
    amount: 1_000n,
  });

  it("accepts a contiguous vector starting at 0", () => {
    expect(() =>
      assertContiguousHtlcVector([sib(0), sib(1), sib(2)]),
    ).not.toThrow();
  });

  it("rejects a gap (missing sibling would mis-align the funded tx)", () => {
    expect(() => assertContiguousHtlcVector([sib(0), sib(2)])).toThrow(
      /non-contiguous/,
    );
  });

  it("rejects a duplicate htlcVout", () => {
    expect(() => assertContiguousHtlcVector([sib(0), sib(1), sib(1)])).toThrow(
      /non-contiguous/,
    );
  });

  it("rejects a vector not starting at vout 0", () => {
    expect(() => assertContiguousHtlcVector([sib(1), sib(2)])).toThrow(
      /non-contiguous/,
    );
  });
});

describe("rebuildDepositTerms orchestrator (mocked chain, real discovery + mapping)", () => {
  const TARGET_ID = "0xtarget_vault_id" as Hex;
  const SIBLING_ID = "0xsibling_vault_id" as Hex;
  const DEPOSITOR_ETH = "0xAAAA00000000000000000000000000000000dEAD";
  const PRE_PEGIN_TX_HASH = `0x${"12".repeat(32)}` as Hex;
  // secp256k1 G.x — a valid x-only key for the real processPublicKeyToXOnly.
  const DEPOSITOR_BTC =
    "79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798";

  const targetVault = makeVault({
    depositor: DEPOSITOR_ETH as OnChainVaultData["depositor"],
    prePeginTxHash: PRE_PEGIN_TX_HASH,
    hashlock: `0x${"aa".repeat(32)}` as Hex,
    htlcVout: 0,
    amount: 90_000n,
  });
  const siblingVault = makeVault({
    depositor: DEPOSITOR_ETH as OnChainVaultData["depositor"],
    prePeginTxHash: PRE_PEGIN_TX_HASH,
    hashlock: `0x${"bb".repeat(32)}` as Hex,
    htlcVout: 1,
    amount: 120_000n,
  });

  function baseParams() {
    return {
      vaultId: TARGET_ID,
      target: targetVault,
      fundedPrePeginTxHex: "deadbeef",
      connectedDepositorAddress: DEPOSITOR_ETH.toLowerCase() as `0x${string}`,
      depositorBtcPubkey: DEPOSITOR_BTC,
      fundedTxFee: 1234n,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVaultFromChain).mockImplementation(async (id: Hex) => {
      if (id === TARGET_ID) return targetVault;
      if (id === SIBLING_ID) return siblingVault;
      throw new Error(`unexpected vault id ${id}`);
    });
    vi.mocked(fetchVaultIdsByDepositor).mockResolvedValue([
      TARGET_ID,
      SIBLING_ID,
    ]);
    vi.mocked(getVaultRegistryReader).mockReturnValue({
      getProtocolInfoBatch: vi
        .fn()
        .mockResolvedValue([{ prePeginTxHash: PRE_PEGIN_TX_HASH }]),
    } as never);
    vi.mocked(getProtocolParamsReader).mockResolvedValue({
      getOffchainParamsByVersion: vi.fn().mockResolvedValue({
        feeRate: 3n,
        minPeginFeeRate: 7n,
        councilQuorum: 2,
        securityCouncilKeys: ["c1", "c2", "c3"],
        timelockAssert: 150n,
        tRefund: 144,
        minVpCommissionBps: 10,
      }),
      getTimelockPeginByVersion: vi.fn().mockResolvedValue(100),
    } as never);
    vi.mocked(getVaultKeeperReader).mockResolvedValue({
      getVaultKeepersByVersion: vi.fn().mockResolvedValue(["vk-eth-1"]),
    } as never);
    vi.mocked(getUniversalChallengerReader).mockResolvedValue({
      getUniversalChallengersByVersion: vi.fn().mockResolvedValue(["uc-eth-1"]),
    } as never);
    vi.mocked(resolveVaultProviderBtcPubkey).mockResolvedValue("cc".repeat(32));
    vi.mocked(getVaultKeyEpochsFromChain).mockResolvedValue({} as never);
    vi.mocked(resolveParticipantKeysAtEpochs).mockResolvedValue({
      vaultProvider: { operationBtcPubkey: "dd".repeat(32) },
      vaultKeeperOperationKeysSorted: ["ee".repeat(32)],
      universalChallengerOperationKeysSorted: ["ff".repeat(32)],
    } as never);
    vi.mocked(rebuildDepositTermsCore).mockResolvedValue({
      prepeginTxid: "sentinel",
    } as never);
  });

  it("maps stamped chain reads + ordered siblings into the core input", async () => {
    const result = await rebuildDepositTerms(baseParams());

    expect(result).toEqual({ prepeginTxid: "sentinel" });
    expect(rebuildDepositTermsCore).toHaveBeenCalledWith({
      vaultCoreVersion: 2, // stamped, not chain-active
      siblings: [
        { hashlock: targetVault.hashlock, amount: 90_000n },
        { hashlock: siblingVault.hashlock, amount: 120_000n },
      ],
      fundedPrePeginTxHex: "deadbeef",
      depositorBtcPubkey: DEPOSITOR_BTC.toLowerCase(),
      vaultProviderBtcPubkey: "dd".repeat(32), // OPERATION key, not genesis
      vaultKeeperBtcPubkeys: ["ee".repeat(32)],
      universalChallengerBtcPubkeys: ["ff".repeat(32)],
      protocolFeeRate: 3n,
      minPeginFeeRate: 7n,
      councilQuorum: 2,
      councilSize: 3, // securityCouncilKeys.length
      timelockPegin: 100,
      timelockAssert: 150, // Number() of the bigint read
      timelockRefund: 144, // tRefund mapping
      prepeginTxid: "12".repeat(32), // stripped + lowercased
      prepeginMaxFee: 1234n,
      maxAcceptableCommissionBps: 275, // stored 250 + 25 bps headroom (fresh-path cap policy, #2252 interim)
      network: "signet",
    });
  });

  it("refuses when the connected wallet is not the on-chain depositor", async () => {
    await expect(
      rebuildDepositTerms({
        ...baseParams(),
        connectedDepositorAddress:
          "0x9999000000000000000000000000000000000099" as `0x${string}`,
      }),
    ).rejects.toThrow(/owned by/);
    expect(rebuildDepositTermsCore).not.toHaveBeenCalled();
  });

  it("refuses when a discovered sibling is no longer PENDING", async () => {
    vi.mocked(getVaultFromChain).mockImplementation(async (id: Hex) => {
      if (id === TARGET_ID) return targetVault;
      return { ...siblingVault, status: 4 }; // on-chain Expired
    });

    await expect(rebuildDepositTerms(baseParams())).rejects.toThrow(
      /no longer awaiting broadcast/,
    );
    expect(rebuildDepositTermsCore).not.toHaveBeenCalled();
  });

  it("refuses when a sibling carries a different stamped version", async () => {
    vi.mocked(getVaultFromChain).mockImplementation(async (id: Hex) => {
      if (id === TARGET_ID) return targetVault;
      return { ...siblingVault, offchainParamsVersion: 9 };
    });

    await expect(rebuildDepositTerms(baseParams())).rejects.toThrow(
      /disagree on offchainParamsVersion/,
    );
    expect(rebuildDepositTermsCore).not.toHaveBeenCalled();
  });

  /** A funded Pre-PegIn tx with `htlcCount` HTLC outputs and the auth-anchor
   * OP_RETURN at vout === htlcCount. Uses the GLOBAL native Buffer, not
   * `import { Buffer } from "buffer"` — the polyfill package's instances fail
   * bitcoinjs/typeforce's native Buffer.isBuffer check (dual-realm Buffer). */
  function makeFundedTx(htlcCount: number): string {
    const tx = new Transaction();
    tx.version = 2;
    tx.addInput(Buffer.alloc(32, 0x11), 0);
    for (let i = 0; i < htlcCount; i++) {
      tx.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1000);
    }
    tx.addOutput(
      Buffer.concat([Buffer.from([0x6a, 0x20]), Buffer.alloc(32, 0xab)]),
      0,
    );
    return tx.toHex();
  }

  // Lagging-indexer end-to-end: discovery only enumerates what the indexer
  // knows, so a truncated sibling set must be caught by the REAL core's
  // auth-anchor completeness check — not silently rebuilt as a 1-vault batch.
  it("refuses a truncated sibling set via the real core's auth-anchor check", async () => {
    const actual = await vi.importActual<
      typeof import("@babylonlabs-io/ts-sdk/tbv/core")
    >("@babylonlabs-io/ts-sdk/tbv/core");
    vi.mocked(rebuildDepositTermsCore).mockImplementation(
      actual.rebuildDepositTermsCore,
    );

    // 2-HTLC funded tx (anchor at vout 2), but the indexer returns only the
    // target vault id — the discovered sibling set covers 1 of 2 HTLCs.
    const fundedTxHex = makeFundedTx(2);
    const laggedTarget = {
      ...targetVault,
      prePeginTxHash: `0x${Transaction.fromHex(fundedTxHex).getId()}` as Hex,
    };
    vi.mocked(fetchVaultIdsByDepositor).mockResolvedValue([TARGET_ID]);

    await expect(
      rebuildDepositTerms({
        ...baseParams(),
        target: laggedTarget,
        fundedPrePeginTxHex: fundedTxHex,
      }),
    ).rejects.toThrow(/does not match the discovered sibling count 1/);
    expect(rebuildDepositTermsCore).toHaveBeenCalledTimes(1);
  });
});
