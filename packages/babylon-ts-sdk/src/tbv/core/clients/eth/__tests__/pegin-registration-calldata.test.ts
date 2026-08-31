import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { encodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

import { MockEthereumWallet } from "../../../../../testing/MockEthereumWallet";
import { BTCVaultRegistryABI } from "../../../contracts";
import { ViemPeginRegistrationClient } from "../pegin-registration-client";
import { calculateBtcTxHash, derivePeginVaultId } from "../pegin-transaction";

const DEPOSITOR = "0x1111111111111111111111111111111111111111" as Address;
const REGISTRY = "0x2222222222222222222222222222222222222222" as Address;
const VAULT_PROVIDER = "0x3333333333333333333333333333333333333333" as Address;
const BTC_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const BTC_KEY_HEX = `0x${BTC_KEY}` as Hex;
const COMPRESSED_BTC_KEY = `02${BTC_KEY}`;
const PAYOUT_SCRIPT = "0x0014751e76e8199196d454941c45d1b3a323f1433bd6" as Hex;
const FOREIGN_PAYOUT_SCRIPT =
  "0x5120cafd90c7026f0b6ab98df89490d02732881f2f4b5900856358dddff4679c2ffb" as Hex;
const POP_SIGNATURE = "0x0102" as Hex;
const HASHLOCK_A = `0x${"cd".repeat(32)}` as Hex;
const HASHLOCK_B = `0x${"ce".repeat(32)}` as Hex;
const WOTS_A = `0x${"ef".repeat(32)}` as Hex;
const WOTS_B = `0x${"f0".repeat(32)}` as Hex;

function peginTransaction(seed: number): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.addInput(Buffer.alloc(32, seed), 0);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 50_000);
  transaction.setWitness(0, [Buffer.alloc(64, 0x11)]);
  return transaction.toHex();
}

const UNSIGNED_PRE_PEGIN = peginTransaction(0xaa);
const SIGNED_PEGIN_A = peginTransaction(0xab);
const SIGNED_PEGIN_B = peginTransaction(0xac);

function setup() {
  const ethWallet = new MockEthereumWallet({ address: DEPOSITOR });
  const publicClient = {
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      if (functionName === "getPegInFee") return Promise.resolve(3n);
      if (functionName === "getVaultProviderCommission")
        return Promise.resolve(100);
      return Promise.resolve({ depositor: zeroAddress });
    }),
    estimateGas: vi.fn().mockResolvedValue(250_000n),
    getCode: vi.fn().mockResolvedValue("0x"),
    waitForTransactionReceipt: vi.fn(({ hash }: { hash: Hex }) =>
      Promise.resolve({ status: "success", transactionHash: hash }),
    ),
  };
  const client = new ViemPeginRegistrationClient({
    ethWallet: ethWallet as never,
    ethChain: sepolia,
    publicClient: publicClient as never,
    btcVaultRegistry: REGISTRY,
    requireQuotedCommissionBps: false,
  });
  return { client, ethWallet, publicClient };
}

function popSignature() {
  return {
    depositorEthAddress: DEPOSITOR,
    depositorBtcPubkey: BTC_KEY,
    btcPopSignature: POP_SIGNATURE,
  };
}

describe("ViemPeginRegistrationClient calldata", () => {
  it("pins all single arguments and the ETH value", async () => {
    const { client, ethWallet, publicClient } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");

    const result = await client.registerPeginOnChain({
      unsignedPrePeginTx: UNSIGNED_PRE_PEGIN,
      depositorSignedPeginTx: SIGNED_PEGIN_A,
      vaultProvider: VAULT_PROVIDER,
      hashlock: HASHLOCK_A,
      depositorWotsPkHash: WOTS_A,
      popSignature: popSignature(),
      depositorBtcPubkeyRaw: COMPRESSED_BTC_KEY,
      htlcVout: 0,
      depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
      quotedCommissionBps: 100,
    });

    const data = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "submitPeginRequest",
      args: [
        DEPOSITOR,
        BTC_KEY_HEX,
        POP_SIGNATURE,
        `0x${UNSIGNED_PRE_PEGIN}`,
        `0x${SIGNED_PEGIN_A}`,
        VAULT_PROVIDER,
        125,
        HASHLOCK_A,
        0,
        PAYOUT_SCRIPT,
        WOTS_A,
      ],
    });
    expect(data.slice(0, 10)).toBe("0x67df3144");
    expect(publicClient.estimateGas).toHaveBeenCalledWith({
      to: REGISTRY,
      data,
      value: 3n,
      account: DEPOSITOR,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: REGISTRY,
        data,
        value: 3n,
        gas: 250_000n,
      }),
    );
    const peginTxHash = calculateBtcTxHash(SIGNED_PEGIN_A);
    expect(result).toMatchObject({
      peginTxHash,
      vaultId: `0x${derivePeginVaultId(peginTxHash, DEPOSITOR)}`,
    });
  });

  it("pins all batch arguments and the total ETH value", async () => {
    const { client, ethWallet, publicClient } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");

    const result = await client.registerPeginBatchOnChain({
      vaultProvider: VAULT_PROVIDER,
      unsignedPrePeginTx: UNSIGNED_PRE_PEGIN,
      popSignature: popSignature(),
      depositorBtcPubkeyRaw: COMPRESSED_BTC_KEY,
      quotedCommissionBps: 100,
      requests: [
        {
          depositorSignedPeginTx: SIGNED_PEGIN_A,
          hashlock: HASHLOCK_A,
          htlcVout: 0,
          depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
          depositorWotsPkHash: WOTS_A,
        },
        {
          depositorSignedPeginTx: SIGNED_PEGIN_B,
          hashlock: HASHLOCK_B,
          htlcVout: 1,
          depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
          depositorWotsPkHash: WOTS_B,
        },
      ],
    });

    const requests = [
      {
        depositorBtcPubKey: BTC_KEY_HEX,
        btcPopSignature: POP_SIGNATURE,
        unsignedPrePeginTx: `0x${UNSIGNED_PRE_PEGIN}` as Hex,
        depositorSignedPeginTx: `0x${SIGNED_PEGIN_A}` as Hex,
        hashlock: HASHLOCK_A,
        htlcVout: 0,
        referralCode: 0,
        depositorPayoutBtcAddress: PAYOUT_SCRIPT,
        depositorWotsPkHash: WOTS_A,
      },
      {
        depositorBtcPubKey: BTC_KEY_HEX,
        btcPopSignature: POP_SIGNATURE,
        unsignedPrePeginTx: `0x${UNSIGNED_PRE_PEGIN}` as Hex,
        depositorSignedPeginTx: `0x${SIGNED_PEGIN_B}` as Hex,
        hashlock: HASHLOCK_B,
        htlcVout: 1,
        referralCode: 0,
        depositorPayoutBtcAddress: PAYOUT_SCRIPT,
        depositorWotsPkHash: WOTS_B,
      },
    ];
    const data = encodeFunctionData({
      abi: BTCVaultRegistryABI,
      functionName: "submitPeginRequestBatch",
      args: [DEPOSITOR, VAULT_PROVIDER, 125, requests],
    });
    expect(data.slice(0, 10)).toBe("0x68d177ac");
    expect(publicClient.estimateGas).toHaveBeenCalledWith({
      to: REGISTRY,
      data,
      value: 6n,
      account: DEPOSITOR,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: REGISTRY,
        data,
        value: 6n,
        gas: 250_000n,
      }),
    );
    expect(result.vaults).toHaveLength(2);
  });

  it("rejects an empty batch before reads or submission", async () => {
    const { client, ethWallet, publicClient } = setup();
    await expect(
      client.registerPeginBatchOnChain({
        vaultProvider: VAULT_PROVIDER,
        unsignedPrePeginTx: UNSIGNED_PRE_PEGIN,
        popSignature: popSignature(),
        depositorBtcPubkeyRaw: COMPRESSED_BTC_KEY,
        quotedCommissionBps: 100,
        requests: [],
      }),
    ).rejects.toThrow(/requires at least one request/);
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(publicClient.estimateGas).not.toHaveBeenCalled();
    expect(ethWallet.getCurrentNonce()).toBe(0);
  });

  it("rejects a duplicate batch before reads or submission", async () => {
    const { client, ethWallet, publicClient } = setup();
    await expect(
      client.registerPeginBatchOnChain({
        vaultProvider: VAULT_PROVIDER,
        unsignedPrePeginTx: UNSIGNED_PRE_PEGIN,
        popSignature: popSignature(),
        depositorBtcPubkeyRaw: COMPRESSED_BTC_KEY,
        quotedCommissionBps: 100,
        requests: [
          {
            depositorSignedPeginTx: SIGNED_PEGIN_A,
            hashlock: HASHLOCK_A,
            htlcVout: 0,
            depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
            depositorWotsPkHash: WOTS_A,
          },
          {
            depositorSignedPeginTx: SIGNED_PEGIN_A,
            hashlock: HASHLOCK_B,
            htlcVout: 1,
            depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
            depositorWotsPkHash: WOTS_B,
          },
        ],
      }),
    ).rejects.toThrow(/Duplicate vault in batch/);
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(publicClient.estimateGas).not.toHaveBeenCalled();
    expect(ethWallet.getCurrentNonce()).toBe(0);
  });

  it("rejects a foreign payout script before single reads or submission", async () => {
    const { client, ethWallet, publicClient } = setup();
    await expect(
      client.registerPeginOnChain({
        unsignedPrePeginTx: UNSIGNED_PRE_PEGIN,
        depositorSignedPeginTx: SIGNED_PEGIN_A,
        vaultProvider: VAULT_PROVIDER,
        hashlock: HASHLOCK_A,
        depositorWotsPkHash: WOTS_A,
        popSignature: popSignature(),
        depositorBtcPubkeyRaw: COMPRESSED_BTC_KEY,
        htlcVout: 0,
        depositorPayoutScriptPubKey: FOREIGN_PAYOUT_SCRIPT,
        quotedCommissionBps: 100,
      }),
    ).rejects.toThrow(/does not match the proof of possession BTC pubkey/);
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(publicClient.estimateGas).not.toHaveBeenCalled();
    expect(ethWallet.getCurrentNonce()).toBe(0);
  });

  it("rejects a foreign payout script before batch reads or submission", async () => {
    const { client, ethWallet, publicClient } = setup();
    await expect(
      client.registerPeginBatchOnChain({
        vaultProvider: VAULT_PROVIDER,
        unsignedPrePeginTx: UNSIGNED_PRE_PEGIN,
        popSignature: popSignature(),
        depositorBtcPubkeyRaw: COMPRESSED_BTC_KEY,
        quotedCommissionBps: 100,
        requests: [
          {
            depositorSignedPeginTx: SIGNED_PEGIN_A,
            hashlock: HASHLOCK_A,
            htlcVout: 0,
            depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
            depositorWotsPkHash: WOTS_A,
          },
          {
            depositorSignedPeginTx: SIGNED_PEGIN_B,
            hashlock: HASHLOCK_B,
            htlcVout: 1,
            depositorPayoutScriptPubKey: FOREIGN_PAYOUT_SCRIPT,
            depositorWotsPkHash: WOTS_B,
          },
        ],
      }),
    ).rejects.toThrow(/does not match the proof of possession BTC pubkey/);
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(publicClient.estimateGas).not.toHaveBeenCalled();
    expect(ethWallet.getCurrentNonce()).toBe(0);
  });
});
