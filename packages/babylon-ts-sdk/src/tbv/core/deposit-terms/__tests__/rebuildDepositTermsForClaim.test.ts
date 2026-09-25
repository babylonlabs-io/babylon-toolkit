import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OnChainBtcPubkey,
  PeginRegistrationRecord,
  VaultData,
} from "../../clients/eth/types";
import type { DelegatedClaimVaultRead } from "../../services/delegated-claim/readDelegatedClaimVaultContext";
import { calculateBtcTxHash } from "../../utils/transaction/btcTxHash";
import { rebuildDepositTermsForClaim } from "../rebuildDepositTermsForClaim";

// The core is mocked to CAPTURE its input: the wiring is the behaviour under
// test, and the core has its own guard + golden tests.
const core = vi.hoisted(() => ({ rebuildDepositTermsCore: vi.fn() }));
vi.mock("../rebuildDepositTermsCore", () => core);
const fee = vi.hoisted(() => ({ computeFundedPrePeginFee: vi.fn() }));
vi.mock("../fundedPrePeginFee", () => fee);

const DEPOSITOR =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const VP_GENESIS =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const KEEPER =
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9";
const CHALLENGER =
  "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13";
const DEPOSITOR_ETH = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const APP = "0xaaaa000000000000000000000000000000000001" as Address;
const VP_ADDRESS = "0xbbbb000000000000000000000000000000000002" as Address;
const VAULT_A = `0x${"0a".repeat(32)}` as Hex;
const VAULT_B = `0x${"0b".repeat(32)}` as Hex;
const HASHLOCK_A = `0x${"aa".repeat(32)}` as Hex;
const HASHLOCK_B = `0x${"bb".repeat(32)}` as Hex;
const CREATED_AT = 1_000n;
const API = "https://mempool.example/api";

function fundedTx(): string {
  const t = new Transaction();
  t.version = 2;
  t.addInput(Buffer.alloc(32, 0x11), 0);
  t.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1_000);
  t.addOutput(Buffer.from(`5120${"01".repeat(32)}`, "hex"), 1_000);
  return t.toHex();
}
const TX_HEX = fundedTx();
const PREPEGIN_TX_HASH = calculateBtcTxHash(TX_HEX);

function vault(
  htlcVout: number,
  hashlock: Hex,
  over: Partial<VaultData["protocol"]> = {},
): VaultData {
  return {
    basic: {
      depositor: DEPOSITOR_ETH,
      depositorBtcPubKey: `0x${DEPOSITOR}` as Hex,
      amount: htlcVout === 0 ? 1_000_000n : 2_500_000n,
      vaultProvider: VP_ADDRESS,
      status: 3,
      applicationEntryPoint: APP,
      createdAt: CREATED_AT,
    },
    protocol: {
      depositorSignedPeginTx: "0x0200" as Hex,
      universalChallengersVersion: 9,
      appVaultKeepersVersion: 7,
      offchainParamsVersion: 3,
      verifiedAt: 1_100n,
      depositorWotsPkHash: `0x${"cc".repeat(32)}` as Hex,
      hashlock,
      htlcVout,
      depositorPopSignature: "0x" as Hex,
      prePeginTxHash: PREPEGIN_TX_HASH,
      vaultProviderCommissionBps: 100,
      vaultCoreVersion: 3,
      ...over,
    },
  };
}

function record(
  vaultId: Hex,
  over: Partial<PeginRegistrationRecord> = {},
): PeginRegistrationRecord {
  return {
    vaultId,
    depositor: DEPOSITOR_ETH,
    vaultProvider: VP_ADDRESS,
    amount: 1n,
    vaultCoreVersion: 3,
    universalChallengersVersion: 9,
    appVaultKeepersVersion: 7,
    proverCircuitVersion: 11,
    offchainParamsVersion: 3,
    peginTxHash: `0x${"ee".repeat(32)}` as Hex,
    depositorPayoutScriptPubKey: "0x5120" as Hex,
    unsignedPrePeginTx: TX_HEX as Hex,
    maxAcceptableCommissionBps: 300,
    blockNumber: CREATED_AT,
    ...over,
  };
}

/** The target is vault A; vault B is its sibling in the same registration block. */
function read(): DelegatedClaimVaultRead {
  return {
    context: {
      vaultId: VAULT_A,
      depositorEthAddress: DEPOSITOR_ETH,
      depositorBtcPubkey: DEPOSITOR as OnChainBtcPubkey,
      registeredPayoutScriptPubKey: "5120",
      vaultProviderBtcPubkey: VP_GENESIS,
      vaultKeeperBtcPubkeys: [KEEPER],
      universalChallengerBtcPubkeys: [CHALLENGER],
      txGraphVersion: 3,
      proverCircuitVersion: 11,
      vaultCoreVersion: 3,
      claimableEventBlockNumber: 5_000n,
      peginVaultOutputValueSats: 1_000,
      protocolFeeRate: 3n,
      councilSize: 3,
      timelockPegin: 684,
      timelockAssert: 700,
    },
    vault: vault(0, HASHLOCK_A),
    registrationRecord: record(VAULT_A),
    registrationRecords: [record(VAULT_B), record(VAULT_A)],
    participantKeys: {
      vaultProvider: {
        adminAddress: VP_ADDRESS,
        genesisBtcPubkey: VP_GENESIS as OnChainBtcPubkey,
        operationBtcPubkey: VP_GENESIS as OnChainBtcPubkey,
        rotated: false,
      },
      vaultKeepers: [],
      universalChallengers: [],
      vaultKeeperOperationKeysSorted: [KEEPER],
      universalChallengerOperationKeysSorted: [CHALLENGER],
      resolvedAt: { mode: "current" },
      query: {
        vaultProviderEthAddress: VP_ADDRESS,
        vaultProviderGenesisBtcPubkey: `0x${VP_GENESIS}` as Hex,
        applicationEntryPoint: APP,
        vaultKeepers: [],
        universalChallengers: [],
      },
    },
    offchainParams: {
      timelockAssert: 700n,
      timelockChallengeAssert: 1n,
      securityCouncilKeys: ["0x01", "0x02", "0x03"],
      councilQuorum: 2,
      feeRate: 3n,
      babeTotalInstances: 1,
      babeInstancesToFinalize: 1,
      minVpCommissionBps: 0,
      tRefund: 2016,
      tStale: 1,
      minPeginFeeRate: 7n,
      proverCircuitVersion: 11,
      minPrepeginDepth: 1,
    },
    depositorBtcPubKeyBytes32: `0x${DEPOSITOR}` as Hex,
    depositorWotsPkHash: `0x${"cc".repeat(32)}` as Hex,
    prePeginTxHash: PREPEGIN_TX_HASH,
    peginTxHash: `0x${"ee".repeat(32)}` as Hex,
    vaultProvider: VP_ADDRESS,
    htlcVout: 0,
  };
}

function siblingReader(sibling: VaultData = vault(1, HASHLOCK_B)) {
  return {
    getVaultData: vi.fn(async (id: Hex) => {
      if (id !== VAULT_B) throw new Error(`no vault fixture for ${id}`);
      return sibling;
    }),
  };
}

describe("rebuildDepositTermsForClaim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fee.computeFundedPrePeginFee.mockResolvedValue(1_500n);
    core.rebuildDepositTermsCore.mockResolvedValue({ vaults: [] });
  });

  it("feeds the core the sibling set from the read's registration block in htlcVout order, stamped params, and the funded fee", async () => {
    await rebuildDepositTermsForClaim({
      read: read(),
      depositorBtcPubkey: `02${DEPOSITOR}`,
      fundedPrePeginTxHex: TX_HEX,
      siblingReader: siblingReader(),
      mempoolApiUrl: API,
      network: "signet",
    });

    expect(core.rebuildDepositTermsCore).toHaveBeenCalledWith({
      vaultCoreVersion: 3,
      siblings: [
        { hashlock: HASHLOCK_A, amount: 1_000_000n },
        { hashlock: HASHLOCK_B, amount: 2_500_000n },
      ],
      fundedPrePeginTxHex: TX_HEX,
      depositorBtcPubkey: DEPOSITOR,
      vaultProviderBtcPubkey: VP_GENESIS,
      vaultKeeperBtcPubkeys: [KEEPER],
      universalChallengerBtcPubkeys: [CHALLENGER],
      protocolFeeRate: 3n,
      minPeginFeeRate: 7n,
      councilQuorum: 2,
      councilSize: 3,
      timelockPegin: 684,
      timelockAssert: 700,
      timelockRefund: 2016,
      prepeginTxid: PREPEGIN_TX_HASH.slice(2),
      prepeginMaxFee: 1_500n,
      maxAcceptableCommissionBps: 300,
      network: "signet",
    });
    expect(fee.computeFundedPrePeginFee).toHaveBeenCalledWith(TX_HEX, API);
  });

  it("refuses a wallet key that is not the vault's depositor before any sibling or mempool read", async () => {
    const siblings = siblingReader();

    await expect(
      rebuildDepositTermsForClaim({
        read: read(),
        depositorBtcPubkey: KEEPER,
        fundedPrePeginTxHex: TX_HEX,
        siblingReader: siblings,
        mempoolApiUrl: API,
        network: "signet",
      }),
    ).rejects.toThrow(/not the vault's depositor/);
    expect(siblings.getVaultData).not.toHaveBeenCalled();
    expect(fee.computeFundedPrePeginFee).not.toHaveBeenCalled();
  });

  it("refuses a Pre-PegIn hex that does not hash to the vault's prePeginTxHash before any mempool read", async () => {
    const other = new Transaction();
    other.version = 2;
    other.addInput(Buffer.alloc(32, 0x33), 0);
    other.addOutput(Buffer.from(`5120${"00".repeat(32)}`, "hex"), 1);

    await expect(
      rebuildDepositTermsForClaim({
        read: read(),
        depositorBtcPubkey: `02${DEPOSITOR}`,
        fundedPrePeginTxHex: other.toHex(),
        siblingReader: siblingReader(),
        mempoolApiUrl: API,
        network: "signet",
      }),
    ).rejects.toThrow(/hashes to/);
    expect(fee.computeFundedPrePeginFee).not.toHaveBeenCalled();
  });

  it("refuses a sibling whose stamped versions differ from the target's", async () => {
    await expect(
      rebuildDepositTermsForClaim({
        read: read(),
        depositorBtcPubkey: `02${DEPOSITOR}`,
        fundedPrePeginTxHex: TX_HEX,
        siblingReader: siblingReader(
          vault(1, HASHLOCK_B, { offchainParamsVersion: 4 }),
        ),
        mempoolApiUrl: API,
        network: "signet",
      }),
    ).rejects.toThrow(/disagree on offchainParamsVersion \(4 vs 3\)/);
  });

  it("refuses a sibling registered against a different Pre-PegIn on chain than its log records", async () => {
    await expect(
      rebuildDepositTermsForClaim({
        read: read(),
        depositorBtcPubkey: `02${DEPOSITOR}`,
        fundedPrePeginTxHex: TX_HEX,
        siblingReader: siblingReader(
          vault(1, HASHLOCK_B, {
            prePeginTxHash: `0x${"99".repeat(32)}` as Hex,
          }),
        ),
        mempoolApiUrl: API,
        network: "signet",
      }),
    ).rejects.toThrow(/registered against a different Pre-PegIn on chain/);
  });
});
