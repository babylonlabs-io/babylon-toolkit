import {
  rebuildDepositTermsCore,
  resolveParticipantKeysAtEpochs,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { Transaction } from "bitcoinjs-lib";
import type { Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DepositorWalletMismatchError,
  VaultLifecycleStateError,
} from "@/utils/errors";

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
  assertBatchLifecycleStatus,
  assertContiguousHtlcVector,
  assertPresignTargetSignable,
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
// Presign ack-window check reads the current block through ethClient.
const { mockGetBlockNumber } = vi.hoisted(() => ({
  mockGetBlockNumber: vi.fn(),
}));
vi.mock("../../../clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({ getBlockNumber: mockGetBlockNumber }),
  },
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

// ETH block the registration mined at + the ack window read for presign mode.
const TARGET_CREATED_AT_BLOCK = 1_000n;
const PEGIN_ACK_TIMEOUT_BLOCKS = 144n;
// Contract boundary (PeginLogic.submitACK / reportExpired, vault-contracts-aave-v4 @ 2e87a85a): expired iff block > deadline.
const ACK_DEADLINE_BLOCK = TARGET_CREATED_AT_BLOCK + PEGIN_ACK_TIMEOUT_BLOCKS;

// Only the fields the lifecycle/homogeneity asserts read matter here; the cast
// keeps the fixture minimal instead of faking the full on-chain record.
function makeVault(over: Partial<OnChainVaultData> = {}): OnChainVaultData {
  return {
    status: OnChainBtcVaultStatus.PENDING,
    createdAt: TARGET_CREATED_AT_BLOCK,
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

describe("assertBatchLifecycleStatus", () => {
  const TARGET_MEMBER_ID = "0xtarget_member" as Hex;
  const SIBLING_MEMBER_ID = "0xsibling_member" as Hex;
  const member = (vaultId: Hex, over: Partial<OnChainVaultData> = {}) => ({
    vaultId,
    vault: makeVault(over),
  });

  it("broadcast accepts an all-PENDING batch", () => {
    expect(() =>
      assertBatchLifecycleStatus("broadcast", member(TARGET_MEMBER_ID), [
        member(SIBLING_MEMBER_ID),
      ]),
    ).not.toThrow();
  });

  it("broadcast rejects a non-PENDING sibling with the legacy message byte-identical", () => {
    let caught: unknown;
    try {
      assertBatchLifecycleStatus("broadcast", member(TARGET_MEMBER_ID), [
        member(SIBLING_MEMBER_ID, { status: OnChainBtcVaultStatus.EXPIRED }),
      ]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    // Byte-identical to the pre-typed-error string: mapDepositError buckets
    // this refusal on the word "broadcast".
    expect((caught as VaultLifecycleStateError).message).toBe(
      "A vault in this Vault Creation batch is no longer awaiting broadcast " +
        "(on-chain status 4); the batch cannot be broadcast as one " +
        "transaction. Resume refused.",
    );
    expect(caught).toMatchObject({
      reason: "invalid-status",
      stage: "broadcast",
      role: "sibling",
      status: OnChainBtcVaultStatus.EXPIRED,
      vaultId: SIBLING_MEMBER_ID,
    });
  });

  it("broadcast rejects a non-PENDING target with role target", () => {
    let caught: unknown;
    try {
      assertBatchLifecycleStatus(
        "broadcast",
        member(TARGET_MEMBER_ID, { status: OnChainBtcVaultStatus.VERIFIED }),
        [member(SIBLING_MEMBER_ID)],
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    expect(caught).toMatchObject({
      reason: "invalid-status",
      stage: "broadcast",
      role: "target",
      status: OnChainBtcVaultStatus.VERIFIED,
      vaultId: TARGET_MEMBER_ID,
    });
  });

  it("presign accepts a VERIFIED sibling", () => {
    expect(() =>
      assertBatchLifecycleStatus("presign", member(TARGET_MEMBER_ID), [
        member(SIBLING_MEMBER_ID, { status: OnChainBtcVaultStatus.VERIFIED }),
      ]),
    ).not.toThrow();
  });

  // Pins "sibling status unconstrained": siblings advance independently and no
  // presigned byte depends on their status.
  it("presign accepts EXPIRED and ACTIVE siblings", () => {
    expect(() =>
      assertBatchLifecycleStatus("presign", member(TARGET_MEMBER_ID), [
        member(SIBLING_MEMBER_ID, { status: OnChainBtcVaultStatus.EXPIRED }),
        member("0xsibling_member_2" as Hex, {
          status: OnChainBtcVaultStatus.ACTIVE,
        }),
      ]),
    ).not.toThrow();
  });

  // EXPIRED is the status a real stalled user hits (permissionless expiry
  // reporting flips Pending → Expired past the ack window).
  it("presign rejects an EXPIRED target with the typed error and all fields", () => {
    let caught: unknown;
    try {
      assertBatchLifecycleStatus(
        "presign",
        member(TARGET_MEMBER_ID, { status: OnChainBtcVaultStatus.EXPIRED }),
        [member(SIBLING_MEMBER_ID)],
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    expect(caught).toMatchObject({
      reason: "invalid-status",
      stage: "presign",
      role: "target",
      status: OnChainBtcVaultStatus.EXPIRED,
      vaultId: TARGET_MEMBER_ID,
    });
    // Lifecycle-neutral wording — must not fall into the "broadcast" bucket.
    expect((caught as VaultLifecycleStateError).message).not.toMatch(
      /broadcast/i,
    );
  });
});

describe("assertSiblingBatchHomogeneous", () => {
  it("accepts siblings whose stamps, provider, application, and commission match the target", () => {
    const target = makeVault();
    expect(() =>
      assertSiblingBatchHomogeneous(target, [makeVault(), makeVault()]),
    ).not.toThrow();
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
      lifecycle: "broadcast" as const,
    };
  }

  // Module-level so tests can assert the ack timeout is sourced from
  // ViemProtocolParamsReader.getTBVProtocolParams (the live contract read).
  const mockGetTBVProtocolParams = vi.fn();

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
    mockGetTBVProtocolParams.mockResolvedValue({
      pegInAckTimeout: PEGIN_ACK_TIMEOUT_BLOCKS,
    });
    // Default: exactly at the ack deadline — the last block the contract
    // still accepts, so in-window tests double as the boundary case.
    mockGetBlockNumber.mockResolvedValue(ACK_DEADLINE_BLOCK);
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
      getTBVProtocolParams: mockGetTBVProtocolParams,
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
    // Broadcast mode is byte-identical to before: no ack-window reads added.
    expect(mockGetBlockNumber).not.toHaveBeenCalled();
    expect(mockGetTBVProtocolParams).not.toHaveBeenCalled();
  });

  it("refuses with the typed depositor-mismatch error when the connected wallet is not the on-chain depositor", async () => {
    const connected =
      "0x9999000000000000000000000000000000000099" as `0x${string}`;
    const caught = await rebuildDepositTerms({
      ...baseParams(),
      connectedDepositorAddress: connected,
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(DepositorWalletMismatchError);
    expect(caught).toMatchObject({
      vaultId: TARGET_ID,
      expectedDepositor: targetVault.depositor,
      connectedDepositor: connected,
    });
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

  // Threads lifecycle through discovery: broadcast mode would refuse this
  // sibling, so a successful rebuild proves the presign gate ran instead.
  it("presign rebuilds terms with an EXPIRED sibling in the batch", async () => {
    vi.mocked(getVaultFromChain).mockImplementation(async (id: Hex) => {
      if (id === TARGET_ID) return targetVault;
      return { ...siblingVault, status: OnChainBtcVaultStatus.EXPIRED };
    });

    const result = await rebuildDepositTerms({
      ...baseParams(),
      lifecycle: "presign",
    });

    expect(result).toEqual({ prepeginTxid: "sentinel" });
    expect(rebuildDepositTermsCore).toHaveBeenCalledTimes(1);
    // The ack timeout must come from the live getTBVProtocolParams read — the
    // same source the contract consults when it evaluates the window.
    expect(mockGetTBVProtocolParams).toHaveBeenCalledTimes(1);
  });

  it("presign accepts the ack-deadline boundary block (contract still accepts it)", async () => {
    mockGetBlockNumber.mockResolvedValue(ACK_DEADLINE_BLOCK);

    await expect(
      rebuildDepositTerms({ ...baseParams(), lifecycle: "presign" }),
    ).resolves.toEqual({ prepeginTxid: "sentinel" });
  });

  it("presign refuses one block past the ack deadline with the typed error", async () => {
    mockGetBlockNumber.mockResolvedValue(ACK_DEADLINE_BLOCK + 1n);

    const caught = await rebuildDepositTerms({
      ...baseParams(),
      lifecycle: "presign",
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    expect(caught).toMatchObject({
      reason: "ack-window-elapsed",
      stage: "presign",
      role: "target",
      // The ACTUAL on-chain status — report-lag leaves it PENDING, and the
      // error must not falsify EXPIRED.
      status: OnChainBtcVaultStatus.PENDING,
      vaultId: TARGET_ID,
    });
    expect(rebuildDepositTermsCore).not.toHaveBeenCalled();
  });

  it("presign fails closed when the current-block read fails", async () => {
    mockGetBlockNumber.mockRejectedValue(new Error("rpc unavailable"));

    await expect(
      rebuildDepositTerms({ ...baseParams(), lifecycle: "presign" }),
    ).rejects.toThrow(/rpc unavailable/);
    expect(rebuildDepositTermsCore).not.toHaveBeenCalled();
  });

  // The hoisted preflight: same two gates, same order, no sibling/mempool reads.
  it("assertPresignTargetSignable passes a PENDING target inside the ack window without touching siblings", async () => {
    await expect(
      assertPresignTargetSignable(TARGET_ID, targetVault),
    ).resolves.toBeUndefined();
    expect(fetchVaultIdsByDepositor).not.toHaveBeenCalled();
    expect(getVaultFromChain).not.toHaveBeenCalled();
  });

  it("assertPresignTargetSignable refuses a non-PENDING target before reading the ack window", async () => {
    const caught = await assertPresignTargetSignable(TARGET_ID, {
      ...targetVault,
      status: OnChainBtcVaultStatus.VERIFIED,
    }).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    expect(caught).toMatchObject({
      reason: "invalid-status",
      stage: "presign",
      status: OnChainBtcVaultStatus.VERIFIED,
    });
    expect(mockGetBlockNumber).not.toHaveBeenCalled();
  });

  it("assertPresignTargetSignable refuses one block past the ack deadline with the still-PENDING status", async () => {
    mockGetBlockNumber.mockResolvedValue(ACK_DEADLINE_BLOCK + 1n);

    const caught = await assertPresignTargetSignable(
      TARGET_ID,
      targetVault,
    ).then(
      () => null,
      (err: unknown) => err,
    );

    expect(caught).toBeInstanceOf(VaultLifecycleStateError);
    expect(caught).toMatchObject({
      reason: "ack-window-elapsed",
      stage: "presign",
      status: OnChainBtcVaultStatus.PENDING,
    });
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
