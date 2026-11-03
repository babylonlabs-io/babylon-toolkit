// @vitest-environment node

/**
 * The resume output check on a real two-vault transaction, with the real SDK
 * key resolution, the real SDK check and real WASM. Only the chain reads are
 * mocked, so this proves the values the vault passes make a genuine deposit
 * pass and a rotated key fail.
 */

import {
  computeMinClaimValue,
  computeMinPeginFee,
  getPrePeginHtlcConnectorInfo,
  peginP2aAnchorOutput,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { isHtlcOutputMismatchError } from "@babylonlabs-io/ts-sdk/tbv/core";
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, networks, payments, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import type { Hex } from "viem";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrePeginSiblingIdsFromChain } from "../../../clients/eth-contract/btc-vault-registry/prePeginSiblings";
import {
  getVaultFromChain,
  getVaultKeyEpochsFromChain,
  type OnChainVaultData,
} from "../../../clients/eth-contract/btc-vault-registry/query";
import {
  getOperationKeyReader,
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
  getVaultRegistryReader,
} from "../../../clients/eth-contract/sdk-readers";
import { verifyResumeHtlcOutputs } from "../rebuildDepositTerms";
import { resolveVaultProviderBtcPubkey } from "../vaultPayoutSignatureService";

vi.mock("@/utils/vaultCoreVersionSupport", () => ({
  assertVaultCoreVersionSupported: vi.fn().mockResolvedValue(undefined),
}));
vi.mock(
  "../../../clients/eth-contract/btc-vault-registry/prePeginSiblings",
  () => ({ getPrePeginSiblingIdsFromChain: vi.fn() }),
);
vi.mock("../../../clients/eth-contract/btc-vault-registry/query", () => ({
  getMaxAcceptableCommissionBpsFromChainWithGrace: vi.fn(),
  getVaultFromChain: vi.fn(),
  getVaultKeyEpochsFromChain: vi.fn(),
}));
vi.mock("../../../clients/eth-contract/sdk-readers", () => ({
  getOperationKeyReader: vi.fn(),
  getProtocolParamsReader: vi.fn(),
  getUniversalChallengerReader: vi.fn(),
  getVaultKeeperReader: vi.fn(),
  getVaultRegistryReader: vi.fn(),
}));
vi.mock("../../../clients/eth-contract/client", () => ({ ethClient: {} }));
vi.mock("../../../config/pegin", () => ({
  getBTCNetworkForWASM: vi.fn(() => "signet"),
}));
vi.mock("../vaultPayoutSignatureService", () => ({
  resolveVaultProviderBtcPubkey: vi.fn(),
}));

const CORE_VERSION = 1;
const TARGET_ID = "0xtarget_vault_id" as Hex;
const SIBLING_ID = "0xsibling_vault_id" as Hex;
const DEPOSITOR_ETH = "0xaaaa00000000000000000000000000000000dead" as const;
const EPOCHS = { vpKeyEpoch: 1n, appKeeperKeyEpoch: 1n, ucKeyEpoch: 1n };

// Valid curve points. The keepers are read unsorted, as a roster can be, and
// script construction takes them sorted.
const DEPOSITOR_BTC =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const VP_BTC =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";
const KEEPERS_AS_READ = [
  "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
  "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
];
const KEEPERS_SORTED = [...KEEPERS_AS_READ].sort();
const CHALLENGER_BTC =
  "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13";
const ROTATED_VP_BTC =
  "fff97bd5755eeea420453a14355235d382f6472f8568a18b2f057a1460297556";

const FEE_RATE = 3n;
const MIN_PEGIN_FEE_RATE = 7n;
const COUNCIL_QUORUM = 2;
const COUNCIL_SIZE = 3;
const TIMELOCK_REFUND = 2016;
/** btc-vault's `DUST_AMOUNT`, the value of the depositor's fee-bump output. */
const DEPOSITOR_ANCHOR_VALUE = 546;

const SIBLINGS = [
  { hashlock: "ab".repeat(32), amount: 400_000n },
  { hashlock: "cd".repeat(32), amount: 600_000n },
];

/** A Pre-PegIn in the deposit's output layout, with these participant keys. */
async function buildFundedTx(vaultProviderBtc: string): Promise<string> {
  const claimValue = await computeMinClaimValue(
    CORE_VERSION,
    KEEPERS_SORTED.length,
    1,
    COUNCIL_QUORUM,
    COUNCIL_SIZE,
    FEE_RATE,
  );
  const peginFee = await computeMinPeginFee(
    CORE_VERSION,
    KEEPERS_SORTED.length,
    1,
    MIN_PEGIN_FEE_RATE,
  );
  const { value: anchorValue } = await peginP2aAnchorOutput(CORE_VERSION);

  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, 0x11), 0);
  for (const { hashlock, amount } of SIBLINGS) {
    const { scriptPubKey } = await getPrePeginHtlcConnectorInfo({
      txGraphVersion: CORE_VERSION,
      depositorPubkey: DEPOSITOR_BTC,
      vaultProviderPubkey: vaultProviderBtc,
      vaultKeeperPubkeys: KEEPERS_SORTED,
      universalChallengerPubkeys: [CHALLENGER_BTC],
      hashlock,
      timelockRefund: TIMELOCK_REFUND,
      network: "signet",
    });
    tx.addOutput(
      Buffer.from(scriptPubKey, "hex"),
      Number(amount + claimValue + peginFee + anchorValue),
    );
  }
  tx.addOutput(
    Buffer.concat([Buffer.from([0x6a, 0x20]), Buffer.alloc(32, 0xcd)]),
    0,
  );
  const { output: depositorAnchorScript } = payments.p2tr({
    internalPubkey: Buffer.from(DEPOSITOR_BTC, "hex"),
    network: networks.testnet,
  });
  if (!depositorAnchorScript) {
    throw new Error("failed to derive the depositor fee-bump output script");
  }
  tx.addOutput(depositorAnchorScript, DEPOSITOR_ANCHOR_VALUE);
  return tx.toHex();
}

function makeVault(txHex: string, htlcVout: number): OnChainVaultData {
  return {
    status: OnChainBtcVaultStatus.PENDING,
    vaultCoreVersion: CORE_VERSION,
    offchainParamsVersion: 3,
    appVaultKeepersVersion: 4,
    universalChallengersVersion: 5,
    applicationEntryPoint: "0xaaaa000000000000000000000000000000000001",
    vaultProvider: "0xbbbb000000000000000000000000000000000002",
    depositor: DEPOSITOR_ETH,
    depositorBtcPubKey: `0x${DEPOSITOR_BTC}`,
    prePeginTxHash: `0x${Transaction.fromHex(txHex).getId()}`,
    hashlock: `0x${SIBLINGS[htlcVout].hashlock}`,
    amount: SIBLINGS[htlcVout].amount,
    htlcVout,
  } as unknown as OnChainVaultData;
}

function verify(txHex: string) {
  return verifyResumeHtlcOutputs({
    vaultId: TARGET_ID,
    target: makeVault(txHex, 0),
    fundedPrePeginTxHex: txHex,
    connectedDepositorAddress: DEPOSITOR_ETH,
    depositorBtcPubkey: DEPOSITOR_BTC,
  });
}

describe("verifyResumeHtlcOutputs with the real check", () => {
  let matchingTxHex: string;
  let rotatedTxHex: string;

  beforeAll(async () => {
    initEccLib(ecc);
    matchingTxHex = await buildFundedTx(VP_BTC);
    rotatedTxHex = await buildFundedTx(ROTATED_VP_BTC);
  });

  beforeEach(() => {
    vi.mocked(getPrePeginSiblingIdsFromChain).mockResolvedValue([SIBLING_ID]);
    vi.mocked(getVaultKeyEpochsFromChain).mockResolvedValue(EPOCHS);
    vi.mocked(getVaultRegistryReader).mockReturnValue({
      getVaultKeyEpochsBatch: vi.fn().mockResolvedValue([EPOCHS]),
    } as never);
    vi.mocked(getProtocolParamsReader).mockResolvedValue({
      getOffchainParamsByVersion: vi.fn().mockResolvedValue({
        feeRate: FEE_RATE,
        minPeginFeeRate: MIN_PEGIN_FEE_RATE,
        councilQuorum: COUNCIL_QUORUM,
        securityCouncilKeys: ["c1", "c2", "c3"],
        timelockAssert: 700n,
        tRefund: TIMELOCK_REFUND,
      }),
      getTimelockPeginByVersion: vi.fn().mockResolvedValue(684),
    } as never);
    vi.mocked(getVaultKeeperReader).mockResolvedValue({
      getVaultKeepersByVersion: vi.fn().mockResolvedValue(
        KEEPERS_AS_READ.map((key, i) => ({
          ethAddress: `0xcccc00000000000000000000000000000000000${i}`,
          btcPubKey: `0x${key}`,
        })),
      ),
    } as never);
    vi.mocked(getUniversalChallengerReader).mockResolvedValue({
      getUniversalChallengersByVersion: vi.fn().mockResolvedValue([
        {
          ethAddress: "0xdddd000000000000000000000000000000000000",
          btcPubKey: `0x${CHALLENGER_BTC}`,
        },
      ]),
    } as never);
    vi.mocked(resolveVaultProviderBtcPubkey).mockResolvedValue(VP_BTC);
    vi.mocked(getOperationKeyReader).mockResolvedValue({
      getOperationKeysAtEpochs: vi.fn().mockResolvedValue({
        vaultProvider: `0x${VP_BTC}`,
        vaultKeepers: KEEPERS_AS_READ.map((key) => `0x${key}`),
        universalChallengers: [`0x${CHALLENGER_BTC}`],
      }),
    } as never);
  });

  it("accepts a deposit built with the keys the vault's epochs resolve to", async () => {
    vi.mocked(getVaultFromChain).mockResolvedValue(makeVault(matchingTxHex, 1));

    await expect(verify(matchingTxHex)).resolves.toBeUndefined();
  });

  it("refuses a deposit built with a key that has since rotated", async () => {
    vi.mocked(getVaultFromChain).mockResolvedValue(makeVault(rotatedTxHex, 1));

    const error = await verify(rotatedTxHex).catch((err: unknown) => err);

    expect(isHtlcOutputMismatchError(error)).toBe(true);
  });
});
