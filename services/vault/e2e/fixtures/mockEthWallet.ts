/**
 * Deterministic ETH wallet mock backed by viem. The wallet uses a
 * fixed test private key (all-`ab` bytes - obviously not a real key)
 * so signatures are reproducible across test runs.
 *
 * The transport is a custom JSON-RPC layer that responds with scripted
 * outputs - no network calls. Tests can simulate reverts, dropped tx,
 * or arbitrary chain reads via the `script` API.
 */

import {
  createWalletClient,
  custom,
  type Address,
  type Hash,
  type Hex,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const DEFAULT_PRIVATE_KEY: Hex = `0x${"ab".repeat(32)}` as Hex;
const DEFAULT_CHAIN_ID_HEX = "0xaa36a7"; // sepolia
const DEFAULT_TX_HASH: Hash = `0x${"cd".repeat(32)}` as Hash;

export interface MockEthWalletOptions {
  privateKey?: Hex;
  chainIdHex?: string;
}

type EthRpcMethod =
  | "eth_chainId"
  | "eth_accounts"
  | "eth_requestAccounts"
  | "eth_sendTransaction"
  | "eth_sendRawTransaction"
  | "eth_signTransaction"
  | "eth_estimateGas"
  | "eth_call"
  | "eth_getTransactionCount"
  | "eth_getTransactionReceipt"
  | "eth_blockNumber"
  | "personal_sign"
  | "eth_signTypedData_v4"
  | "wallet_switchEthereumChain";

type ScriptedReturn = { kind: "return"; value: unknown };
type ScriptedReject = { kind: "reject"; error: Error };
type ScriptedAction = ScriptedReturn | ScriptedReject;

export interface MockEthScript {
  /** Next call to `method` resolves with `value` (skipping default). */
  returnNext(method: EthRpcMethod, value: unknown): MockEthScript;
  /** Next call to `method` rejects with `error`. */
  rejectNext(method: EthRpcMethod, error: Error): MockEthScript;
  /** Next `eth_sendTransaction` simulates a contract revert. */
  revertNextTransaction(reason?: string): MockEthScript;
  /** Discard all queued overrides. */
  clear(): void;
  /** How many times `method` has been called. */
  callCount(method: EthRpcMethod): number;
}

export interface MockEthWallet {
  walletClient: WalletClient;
  account: { address: Address; privateKey: Hex };
  script: MockEthScript;
}

export function createMockEthWallet(
  options: MockEthWalletOptions = {},
): MockEthWallet {
  const privateKey = options.privateKey ?? DEFAULT_PRIVATE_KEY;
  const chainIdHex = options.chainIdHex ?? DEFAULT_CHAIN_ID_HEX;
  const account = privateKeyToAccount(privateKey);

  const queues: Partial<Record<EthRpcMethod, ScriptedAction[]>> = {};
  const counts: Record<EthRpcMethod, number> = {
    eth_chainId: 0,
    eth_accounts: 0,
    eth_requestAccounts: 0,
    eth_sendTransaction: 0,
    eth_sendRawTransaction: 0,
    eth_signTransaction: 0,
    eth_estimateGas: 0,
    eth_call: 0,
    eth_getTransactionCount: 0,
    eth_getTransactionReceipt: 0,
    eth_blockNumber: 0,
    personal_sign: 0,
    eth_signTypedData_v4: 0,
    wallet_switchEthereumChain: 0,
  };

  function consume(method: EthRpcMethod): ScriptedAction | undefined {
    counts[method] += 1;
    return queues[method]?.shift();
  }

  function defaultResponse(method: EthRpcMethod): unknown {
    switch (method) {
      case "eth_chainId":
        return chainIdHex;
      case "eth_accounts":
      case "eth_requestAccounts":
        return [account.address.toLowerCase()];
      case "eth_sendTransaction":
      case "eth_sendRawTransaction":
        return DEFAULT_TX_HASH;
      case "eth_estimateGas":
        return "0x5208"; // 21_000
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_blockNumber":
        return "0x1";
      case "wallet_switchEthereumChain":
        return null;
      default:
        return null;
    }
  }

  const transport = custom(
    {
      async request({ method }) {
        const m = method as EthRpcMethod;
        const action = consume(m);
        if (action) {
          if (action.kind === "reject") throw action.error;
          return action.value;
        }
        return defaultResponse(m);
      },
    },
    // retryCount: 0 — viem's default 3 retries would swallow scripted
    // rejects that surface as plain Errors. Tests need rejects to
    // propagate immediately.
    { retryCount: 0 },
  );

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  const script: MockEthScript = {
    returnNext(method, value) {
      const queue = (queues[method] ??= []);
      queue.push({ kind: "return", value });
      return script;
    },
    rejectNext(method, error) {
      const queue = (queues[method] ??= []);
      queue.push({ kind: "reject", error });
      return script;
    },
    revertNextTransaction(reason = "execution reverted") {
      script.rejectNext("eth_sendTransaction", new Error(reason));
      script.rejectNext("eth_sendRawTransaction", new Error(reason));
      return script;
    },
    clear() {
      for (const key of Object.keys(queues) as EthRpcMethod[]) {
        delete queues[key];
      }
    },
    callCount(method) {
      return counts[method];
    },
  };

  return {
    walletClient,
    account: { address: account.address, privateKey },
    script,
  };
}
