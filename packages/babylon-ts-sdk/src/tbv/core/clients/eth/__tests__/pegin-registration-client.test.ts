import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { decodeFunctionData, zeroAddress, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

import { MockEthereumWallet } from "../../../../../testing/MockEthereumWallet";
import { BTCVaultRegistryABI } from "../../../contracts";
import {
  ViemPeginRegistrationClient,
  type RegisterPeginBatchOnChainParams,
  type RegisterPeginOnChainParams,
} from "../pegin-registration-client";

const REGISTRY = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0" as Address;
const OTHER_ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER_PROVIDER = "0x2222222222222222222222222222222222222222" as Address;
const BTC_KEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const PAYOUT_SCRIPT =
  "0x5120da4710964f7852695de2da025290e24af6d8c281de5a0b902b7135fd9fd74d21";
const HASHLOCK = `0x${"cd".repeat(32)}` as Hex;
const WOTS_PK_HASH = `0x${"ef".repeat(32)}` as Hex;

function signedPeginTransaction(seed = 0xab): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.addInput(Buffer.alloc(32, seed), 0);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 50_000);
  transaction.setWitness(0, [Buffer.alloc(64, 0x11)]);
  return transaction.toHex();
}

function setup(requireQuotedCommissionBps = false) {
  const ethWallet = new MockEthereumWallet();
  const publicClient = {
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      if (functionName === "getPegInFee") return Promise.resolve(3n);
      if (functionName === "getVaultProviderCommission")
        return Promise.resolve(100);
      return Promise.resolve({ depositor: zeroAddress as Address });
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
    requireQuotedCommissionBps,
  });
  return { client, ethWallet, publicClient };
}

function singleParams(depositor: Address): RegisterPeginOnChainParams {
  return {
    unsignedPrePeginTx: signedPeginTransaction(0xaa),
    depositorSignedPeginTx: signedPeginTransaction(),
    vaultProvider: REGISTRY,
    hashlock: HASHLOCK,
    depositorWotsPkHash: WOTS_PK_HASH,
    popSignature: {
      depositorEthAddress: depositor,
      depositorBtcPubkey: BTC_KEY,
      btcPopSignature: "0x0102",
    },
    htlcVout: 0,
    depositorPayoutScriptPubKey: PAYOUT_SCRIPT,
    quotedCommissionBps: 100,
  };
}

function batchParams(depositor: Address): RegisterPeginBatchOnChainParams {
  const single = singleParams(depositor);
  return {
    vaultProvider: single.vaultProvider,
    unsignedPrePeginTx: single.unsignedPrePeginTx,
    popSignature: single.popSignature,
    quotedCommissionBps: single.quotedCommissionBps,
    requests: [
      {
        depositorSignedPeginTx: single.depositorSignedPeginTx,
        hashlock: single.hashlock,
        htlcVout: single.htlcVout,
        depositorPayoutScriptPubKey: single.depositorPayoutScriptPubKey,
        depositorWotsPkHash: single.depositorWotsPkHash,
      },
    ],
  };
}

function register(
  client: ViemPeginRegistrationClient,
  depositor: Address,
  path: "single" | "batch",
) {
  return path === "single"
    ? client.registerPeginOnChain(singleParams(depositor))
    : client.registerPeginBatchOnChain(batchParams(depositor));
}

function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const INVALID_SINGLE_PARAMS: Array<
  [string, Partial<RegisterPeginOnChainParams>]
> = [
  ["a malformed hashlock", { hashlock: "0x01" }],
  ["a malformed depositor WOTS key hash", { depositorWotsPkHash: "0x01" }],
  ["malformed transaction hex", { depositorSignedPeginTx: "not-hex" }],
  ["htlcVout -1", { htlcVout: -1 }],
  ["htlcVout 1.5", { htlcVout: 1.5 }],
  ["htlcVout NaN", { htlcVout: Number.NaN }],
  ["htlcVout 256", { htlcVout: 256 }],
];

describe("ViemPeginRegistrationClient", () => {
  it("registers prepared Bitcoin artifacts without a BTC wallet", async () => {
    const { client, ethWallet } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");
    const result = await client.registerPeginOnChain(
      singleParams(ethWallet.account.address),
    );

    expect(result.vaultId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.peginTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: send.mock.calls[0][0].data!,
    });
    expect(decoded.functionName).toBe("submitPeginRequest");
    expect((decoded.args as readonly unknown[])[9]).toBe(PAYOUT_SCRIPT);
  });

  it("refuses to register without a commission quote when one is required", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = singleParams(ethWallet.account.address);
    delete params.quotedCommissionBps;

    await expect(client.registerPeginOnChain(params)).rejects.toThrow(
      /quotedCommissionBps is required/,
    );
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("refuses to register a batch without a commission quote when one is required", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = batchParams(ethWallet.account.address);
    delete params.quotedCommissionBps;

    await expect(client.registerPeginBatchOnChain(params)).rejects.toThrow(
      /quotedCommissionBps is required/,
    );
    expect(publicClient.readContract).not.toHaveBeenCalled();
  });

  it("registers without a commission quote when none is required", async () => {
    const { client, ethWallet } = setup();
    const send = vi.spyOn(ethWallet, "sendTransaction");
    const params = singleParams(ethWallet.account.address);
    delete params.quotedCommissionBps;

    await client.registerPeginOnChain(params);

    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: send.mock.calls[0][0].data!,
    });
    expect((decoded.args as readonly unknown[])[6]).toBe(125);
  });

  it("rejects an ETH account switch before submission", async () => {
    const { client } = setup();
    await expect(
      client.registerPeginOnChain(singleParams(OTHER_ACCOUNT)),
    ).rejects.toThrow(/Proof of possession/);
  });

  it("uses the single request snapshot after an RPC wait", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = singleParams(ethWallet.account.address);
    const lookup = defer<{ depositor: Address }>();
    publicClient.readContract.mockImplementationOnce(() => lookup.promise);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    const registration = client.registerPeginOnChain(params);
    params.vaultProvider = OTHER_PROVIDER;
    params.hashlock = "0x01";
    params.depositorWotsPkHash = "0x01";
    params.htlcVout = 256;
    params.quotedCommissionBps = 500;
    lookup.resolve({ depositor: zeroAddress });

    await registration;
    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: send.mock.calls[0][0].data!,
    });
    const args = decoded.args as readonly unknown[];
    expect((args[5] as string).toLowerCase()).toBe(REGISTRY);
    expect(args[6]).toBe(125);
    expect(args[7]).toBe(HASHLOCK);
    expect(args[8]).toBe(0);
    expect(args[10]).toBe(WOTS_PK_HASH);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getPegInFee",
        args: [REGISTRY],
      }),
    );
  });

  it("uses the batch request snapshot after an RPC wait", async () => {
    const { client, ethWallet, publicClient } = setup(true);
    const params = batchParams(ethWallet.account.address);
    const lookup = defer<{ depositor: Address }>();
    publicClient.readContract.mockImplementationOnce(() => lookup.promise);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    const registration = client.registerPeginBatchOnChain(params);
    params.vaultProvider = OTHER_PROVIDER;
    params.quotedCommissionBps = 500;
    params.requests.length = 0;
    lookup.resolve({ depositor: zeroAddress });

    await registration;
    const transaction = send.mock.calls[0][0];
    const decoded = decodeFunctionData({
      abi: BTCVaultRegistryABI,
      data: transaction.data!,
    });
    const args = decoded.args as readonly unknown[];
    expect((args[1] as string).toLowerCase()).toBe(REGISTRY);
    expect(args[2]).toBe(125);
    expect(args[3]).toHaveLength(1);
    expect(transaction.value).toBe(3n);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getPegInFee",
        args: [REGISTRY],
      }),
    );
  });

  it.each(["single", "batch"] as const)(
    "rejects an account switch during a %s preflight before gas estimation",
    async (path) => {
      const { client, ethWallet, publicClient } = setup();
      const lookup = defer<{ depositor: Address }>();
      publicClient.readContract.mockImplementationOnce(() => lookup.promise);
      const send = vi.spyOn(ethWallet, "sendTransaction");

      const registration = register(client, ethWallet.account.address, path);
      ethWallet.updateConfig({ address: OTHER_ACCOUNT });
      lookup.resolve({ depositor: zeroAddress });

      await expect(registration).rejects.toThrow(/Proof of possession/);
      expect(publicClient.estimateGas).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("rejects an account switch during gas estimation before submission", async () => {
    const { client, ethWallet, publicClient } = setup();
    const gasEstimate = defer<bigint>();
    publicClient.estimateGas.mockImplementationOnce(() => gasEstimate.promise);
    const send = vi.spyOn(ethWallet, "sendTransaction");

    const registration = client.registerPeginOnChain(
      singleParams(ethWallet.account.address),
    );
    await vi.waitFor(() => {
      expect(publicClient.estimateGas).toHaveBeenCalledTimes(1);
    });
    ethWallet.updateConfig({ address: OTHER_ACCOUNT });
    gasEstimate.resolve(250_000n);

    await expect(registration).rejects.toThrow(/Proof of possession/);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["single", "an existing vault", { depositor: OTHER_ACCOUNT }],
    ["batch", "an existing vault", { depositor: OTHER_ACCOUNT }],
    ["single", "an RPC rejection", new Error("vault lookup failed")],
    ["batch", "an RPC rejection", new Error("vault lookup failed")],
  ] as const)("stops the %s path after %s", async (path, _failure, result) => {
    const { client, ethWallet, publicClient } = setup();
    if (result instanceof Error) {
      publicClient.readContract.mockRejectedValueOnce(result);
    } else {
      publicClient.readContract.mockResolvedValueOnce(result);
    }
    const send = vi.spyOn(ethWallet, "sendTransaction");

    await expect(
      register(client, ethWallet.account.address, path),
    ).rejects.toThrow(
      result instanceof Error ? result.message : /Vault already exists/,
    );
    expect(publicClient.readContract).toHaveBeenCalledTimes(1);
    expect(publicClient.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "getPegInFee" }),
    );
    expect(publicClient.estimateGas).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(INVALID_SINGLE_PARAMS)(
    "rejects %s before all RPC and wallet calls",
    async (_name, invalid) => {
      const { client, ethWallet, publicClient } = setup();
      const params = Object.assign(
        singleParams(ethWallet.account.address),
        invalid,
      );
      const send = vi.spyOn(ethWallet, "sendTransaction");

      await expect(client.registerPeginOnChain(params)).rejects.toThrow();
      expect(publicClient.readContract).not.toHaveBeenCalled();
      expect(publicClient.estimateGas).not.toHaveBeenCalled();
      expect(publicClient.getCode).not.toHaveBeenCalled();
      expect(publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
});
