import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { decodeFunctionData, zeroAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

import { MockEthereumWallet } from "../../../../../testing/MockEthereumWallet";
import { BTCVaultRegistryABI } from "../../../contracts";
import { ViemPeginRegistrationClient } from "../pegin-registration-client";

const REGISTRY = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address;
const BTC_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function signedPeginTransaction(): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.addInput(Buffer.alloc(32, 0xab), 0);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 50_000);
  transaction.setWitness(0, [Buffer.alloc(64, 0x11)]);
  return transaction.toHex();
}

function setup() {
  const ethWallet = new MockEthereumWallet();
  const publicClient = {
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      if (functionName === "getPegInFee") return Promise.resolve(3n);
      if (functionName === "getVaultProviderCommission")
        return Promise.resolve(100);
      return Promise.resolve({ depositor: zeroAddress });
    }),
    estimateGas: vi.fn().mockResolvedValue(250_000n),
    getCode: vi.fn().mockResolvedValue("0x"),
    waitForTransactionReceipt: vi.fn(({ hash }: { hash: `0x${string}` }) =>
      Promise.resolve({ status: "success", transactionHash: hash }),
    ),
  };
  const client = new ViemPeginRegistrationClient({
    ethWallet: ethWallet as never,
    ethChain: sepolia,
    publicClient: publicClient as never,
    btcVaultRegistry: REGISTRY,
  });
  return { client, ethWallet, publicClient };
}

describe("ViemPeginRegistrationClient", () => {
  it("registers prepared Bitcoin artifacts without a BTC wallet", async () => {
    const { client, ethWallet } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");
    const result = await client.registerPeginOnChain({
      unsignedPrePeginTx: signedPeginTransaction(),
      depositorSignedPeginTx: signedPeginTransaction(),
      vaultProvider: REGISTRY,
      hashlock: `0x${"cd".repeat(32)}`,
      depositorWotsPkHash: `0x${"ef".repeat(32)}`,
      popSignature: {
        depositorEthAddress: ethWallet.account.address,
        depositorBtcPubkey: BTC_KEY,
        btcPopSignature: "0x0102",
      },
      htlcVout: 0,
      depositorPayoutScriptPubKey: `0x5120${BTC_KEY}`,
      quotedCommissionBps: 100,
    });

    expect(result.vaultId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.peginTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: send.mock.calls[0][0].data!,
    });
    expect(decoded.functionName).toBe("submitPeginRequest");
    expect((decoded.args as readonly unknown[])[9]).toBe(`0x5120${BTC_KEY}`);
  });

  it("rejects an ETH account switch before submission", async () => {
    const { client, ethWallet } = setup();
    await expect(
      client.registerPeginOnChain({
        unsignedPrePeginTx: signedPeginTransaction(),
        depositorSignedPeginTx: signedPeginTransaction(),
        vaultProvider: REGISTRY,
        hashlock: `0x${"cd".repeat(32)}`,
        depositorWotsPkHash: `0x${"ef".repeat(32)}`,
        popSignature: {
          depositorEthAddress: "0x1111111111111111111111111111111111111111",
          depositorBtcPubkey: BTC_KEY,
          btcPopSignature: "0x0102",
        },
        htlcVout: 0,
        depositorPayoutScriptPubKey: `0x5120${BTC_KEY}`,
      }),
    ).rejects.toThrow(/Proof of possession/);
    expect(ethWallet).toBeDefined();
  });
});
