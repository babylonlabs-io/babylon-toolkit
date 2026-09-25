/**
 * End to end, WASM-backed: a real funded Pre-PegIn (two siblings, graph v3)
 * through the claim-time rebuild, and the same chain fixture through the
 * claim-time context reader; the two must pass `assertTermsMatchVault`, the
 * exact check `signDelegatedClaimPlan` runs before loading the intent.
 */
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Address, Hex } from "viem";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { derivePeginVaultId } from "../../clients/eth/pegin-transaction";
import type {
  OnChainBtcPubkey,
  PeginRegistrationRecord,
  VaultData,
} from "../../clients/eth/types";
import { initializeWasmForTests } from "../../primitives/psbt/__tests__/helpers";
import { readDelegatedClaimVaultContext } from "../../services/delegated-claim/readDelegatedClaimVaultContext";
import { assertTermsMatchVault } from "../../services/delegated-claim/signDelegatedClaimPlan";
import { calculateBtcTxHash } from "../../utils/transaction/btcTxHash";
import { rebuildDepositTermsForClaim } from "../rebuildDepositTermsForClaim";
import {
  REAL_FUNDED_PREPEGIN,
  buildRealFundedTx,
  type Sibling,
} from "./fixtures/realFundedPrePegin";

const mempool = vi.hoisted(() => ({ getUtxoInfo: vi.fn() }));
vi.mock("../../clients/mempool", () => mempool);

const F = REAL_FUNDED_PREPEGIN;
const VERSION = 3;
const DEPOSITOR_ETH = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const APP = "0xaaaa000000000000000000000000000000000001" as Address;
const VP_ADDRESS = "0xbbbb000000000000000000000000000000000002" as Address;
const CREATED_AT = 1_000n;
const CLAIMABLE_BLOCK = 9_000n;
const PROVER_CIRCUIT_VERSION = 11;
const PAYOUT_SCRIPT = `0x5120${F.DEPOSITOR}` as Hex;
const API = "https://mempool.example/api";
const SIBLINGS: Sibling[] = [
  { hashlock: "ab".repeat(32), amount: 1_000_000n },
  { hashlock: "cd".repeat(32), amount: 2_500_000n },
];

/**
 * A minimal parseable transaction standing in for one vault's depositor-signed
 * PegIn: one input spending the Pre-PegIn's output `htlcVout`, the shape
 * btc-vault builds (`transactions/pegin.rs:521-529` @ ac4954e7). Each sibling
 * needs its own: output 0's value is what the registry records as that vault's
 * amount, and its txid is half of the vault id (`PeginLogic.sol:266-267`,
 * `:336-337` @ c559f5c2).
 */
function signedPegin(prePeginTxHash: Hex, htlcVout: number): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(prePeginTxHash.slice(2), "hex").reverse(), htlcVout);
  tx.addOutput(Buffer.from("51", "hex"), Number(SIBLINGS[htlcVout].amount));
  return tx.toHex();
}

/** Everything the readers serve, all of it derived from the funded Pre-PegIn. */
interface ChainFixture {
  prePeginTxHash: Hex;
  unsignedPrePeginTx: Hex;
  signedPegins: string[];
  vaultIds: Hex[];
}

function chainFixture(fundedPrePeginTxHex: string): ChainFixture {
  const prePeginTxHash = calculateBtcTxHash(fundedPrePeginTxHex);
  const signedPegins = SIBLINGS.map((_, htlcVout) =>
    signedPegin(prePeginTxHash, htlcVout),
  );
  return {
    prePeginTxHash,
    unsignedPrePeginTx: fundedPrePeginTxHex as Hex,
    signedPegins,
    vaultIds: signedPegins.map(
      (hex) =>
        `0x${derivePeginVaultId(calculateBtcTxHash(hex), DEPOSITOR_ETH)}` as Hex,
    ),
  };
}

function vault(fx: ChainFixture, htlcVout: number): VaultData {
  return {
    basic: {
      depositor: DEPOSITOR_ETH,
      depositorBtcPubKey: `0x${F.DEPOSITOR}` as Hex,
      amount: SIBLINGS[htlcVout].amount,
      vaultProvider: VP_ADDRESS,
      status: 3,
      applicationEntryPoint: APP,
      createdAt: CREATED_AT,
    },
    protocol: {
      depositorSignedPeginTx: `0x${fx.signedPegins[htlcVout]}` as Hex,
      universalChallengersVersion: 9,
      appVaultKeepersVersion: 7,
      offchainParamsVersion: 3,
      verifiedAt: 1_100n,
      depositorWotsPkHash: `0x${"cc".repeat(32)}` as Hex,
      hashlock: `0x${SIBLINGS[htlcVout].hashlock}` as Hex,
      htlcVout,
      depositorPopSignature: "0x" as Hex,
      prePeginTxHash: fx.prePeginTxHash,
      vaultProviderCommissionBps: 100,
      vaultCoreVersion: VERSION,
    },
  };
}

function record(fx: ChainFixture, htlcVout: number): PeginRegistrationRecord {
  return {
    vaultId: fx.vaultIds[htlcVout],
    depositor: DEPOSITOR_ETH,
    vaultProvider: VP_ADDRESS,
    amount: SIBLINGS[htlcVout].amount,
    vaultCoreVersion: VERSION,
    universalChallengersVersion: 9,
    appVaultKeepersVersion: 7,
    proverCircuitVersion: PROVER_CIRCUIT_VERSION,
    offchainParamsVersion: 3,
    peginTxHash: calculateBtcTxHash(fx.signedPegins[htlcVout]),
    depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
    unsignedPrePeginTx: fx.unsignedPrePeginTx,
    maxAcceptableCommissionBps: F.COMMISSION_BPS,
    blockNumber: CREATED_AT,
  };
}

function readers(fx: ChainFixture) {
  const vaults = new Map<string, VaultData>([
    [fx.vaultIds[0], vault(fx, 0)],
    [fx.vaultIds[1], vault(fx, 1)],
  ]);
  return {
    registryReader: {
      getVaultData: vi.fn(async (id: Hex) => {
        const found = vaults.get(id);
        if (found === undefined) {
          throw new Error(`no vault fixture for ${id}`);
        }
        return found;
      }),
      getVaultKeyEpochs: vi.fn().mockResolvedValue({
        vpKeyEpoch: 1n,
        appKeeperKeyEpoch: 1n,
        ucKeyEpoch: 1n,
      }),
      getVaultProviderGenesisBtcPubKey: vi
        .fn()
        .mockResolvedValue(F.VP as OnChainBtcPubkey),
      getRegistrationRecordsAtBlock: vi
        .fn()
        .mockResolvedValue([record(fx, 0), record(fx, 1)]),
      getVaultClaimableBy: vi.fn(async (id: Hex) => ({
        blockNumber: CLAIMABLE_BLOCK,
        claimerPk: F.DEPOSITOR as OnChainBtcPubkey,
        peginTxHash: calculateBtcTxHash(
          fx.signedPegins[fx.vaultIds.indexOf(id)],
        ),
        vaultCoreVersion: VERSION,
        proverCircuitVersion: PROVER_CIRCUIT_VERSION,
        offchainParamsVersion: 3,
        universalChallengersVersion: 9,
        appVaultKeepersVersion: 7,
      })),
    },
    vaultKeeperReader: {
      getVaultKeepersByVersion: vi.fn().mockResolvedValue(
        F.VKS.map((k, i) => ({
          ethAddress:
            `0x00000000000000000000000000000000000000${10 + i}` as Address,
          btcPubKey: `0x${k}` as Hex,
        })),
      ),
    },
    universalChallengerReader: {
      getUniversalChallengersByVersion: vi.fn().mockResolvedValue(
        F.UCS.map((k, i) => ({
          ethAddress:
            `0x00000000000000000000000000000000000000${20 + i}` as Address,
          btcPubKey: `0x${k}` as Hex,
        })),
      ),
    },
    operationKeyReader: {
      getOperationKeysAtEpochs: vi.fn().mockResolvedValue({
        vaultProvider: `0x${F.VP}`,
        vaultKeepers: F.VKS.map((k) => `0x${k}`),
        universalChallengers: F.UCS.map((k) => `0x${k}`),
      }),
    },
    protocolParamsReader: {
      getOffchainParamsByVersion: vi.fn().mockResolvedValue({
        timelockAssert: BigInt(F.TIMELOCK_ASSERT),
        timelockChallengeAssert: 1n,
        securityCouncilKeys: Array.from(
          { length: F.COUNCIL_SIZE },
          (_, i) => `0x0${i + 1}` as Hex,
        ),
        councilQuorum: F.COUNCIL_QUORUM,
        feeRate: F.PROTOCOL_FEE_RATE,
        babeTotalInstances: 1,
        babeInstancesToFinalize: 1,
        minVpCommissionBps: 0,
        tRefund: F.TIMELOCK_REFUND,
        tStale: 1,
        minPeginFeeRate: F.MIN_PEGIN_FEE_RATE,
        proverCircuitVersion: PROVER_CIRCUIT_VERSION,
        minPrepeginDepth: 1,
      }),
    },
  };
}

describe("rebuildDepositTermsForClaim golden (WASM-backed, matched against the claim context)", () => {
  beforeAll(async () => {
    await initializeWasmForTests();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rebuilds two-vault v3 terms from chain fixtures that pass assertTermsMatchVault against the context read from the same fixtures", async () => {
    const { txHex, dcv, fee, anchor } = await buildRealFundedTx(
      VERSION,
      SIBLINGS,
    );
    const fx = chainFixture(txHex);
    const totalOut =
      SIBLINGS.reduce((sum, s) => sum + s.amount, 0n) +
      2n * dcv +
      2n * fee +
      2n * anchor;
    // The one prevout funds every output plus PREPEGIN_MAX_FEE.
    mempool.getUtxoInfo.mockResolvedValue({
      txid: "11".repeat(32),
      vout: 0,
      value: Number(totalOut + F.PREPEGIN_MAX_FEE),
      scriptPubKey: "5120",
    });
    const r = readers(fx);

    const read = await readDelegatedClaimVaultContext({
      vaultId: fx.vaultIds[1],
      readers: r,
    });
    const terms = await rebuildDepositTermsForClaim({
      read,
      depositorBtcPubkey: `02${F.DEPOSITOR}`,
      fundedPrePeginTxHex: txHex,
      siblingReader: r.registryReader,
      mempoolApiUrl: API,
      network: F.NETWORK,
    });

    expect(() => assertTermsMatchVault(terms, read.context)).not.toThrow();

    expect(terms.vaultCoreVersion).toBe(VERSION);
    expect(terms.prepeginTxid).toBe(fx.prePeginTxHash.slice(2));
    expect(terms.prepeginMaxFee).toBe(F.PREPEGIN_MAX_FEE);
    expect(terms.vaultKeeperBtcPubkeys).toEqual([...F.VKS]);
    expect(terms.universalChallengerBtcPubkeys).toEqual([...F.UCS]);
    expect(terms.vaults.map((v) => [v.htlcVout, v.peginAmount])).toEqual([
      [0, 1_000_000n],
      [1, 2_500_000n],
    ]);
    terms.vaults.forEach((v, i) => {
      expect(v.vaultProviderBtcPubkey).toBe(F.VP);
      expect(v.depositorClaimValue).toBe(dcv);
      expect(v.peginMaxFee).toBe(fee);
      expect(v.commissionFee).toBe(
        (SIBLINGS[i].amount * BigInt(F.COMMISSION_BPS)) / F.BPS_DENOMINATOR,
      );
    });
    expect(read.context.registeredPayoutScriptPubKey).toBe(
      `5120${F.DEPOSITOR}`,
    );
    expect(read.context.claimableEventBlockNumber).toBe(CLAIMABLE_BLOCK);
    expect(read.htlcVout).toBe(1);
  });

  it("a context whose keeper roster differs is refused by the same check the signer runs", async () => {
    const { txHex, dcv, fee, anchor } = await buildRealFundedTx(
      VERSION,
      SIBLINGS,
    );
    const totalOut =
      SIBLINGS.reduce((sum, s) => sum + s.amount, 0n) +
      2n * dcv +
      2n * fee +
      2n * anchor;
    mempool.getUtxoInfo.mockResolvedValue({
      value: Number(totalOut + F.PREPEGIN_MAX_FEE),
      scriptPubKey: "5120",
    });
    const fx = chainFixture(txHex);
    const r = readers(fx);

    const read = await readDelegatedClaimVaultContext({
      vaultId: fx.vaultIds[0],
      readers: r,
    });
    const terms = await rebuildDepositTermsForClaim({
      read,
      depositorBtcPubkey: F.DEPOSITOR,
      fundedPrePeginTxHex: txHex,
      siblingReader: r.registryReader,
      mempoolApiUrl: API,
      network: F.NETWORK,
    });
    const other = { ...read.context, vaultKeeperBtcPubkeys: [F.VKS[0]] };

    expect(() => assertTermsMatchVault(terms, other)).toThrow(/rosters/);
  });
});
