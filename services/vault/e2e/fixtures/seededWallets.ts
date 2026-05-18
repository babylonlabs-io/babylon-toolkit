/**
 * Typed wallet "fixtures" with declared on-chain state.
 *
 * `seededBtcWallet({ amount })` wraps `createMockBtcWallet` and
 * additionally publishes the mempool-API wire payloads a route handler
 * needs to return so the dApp's `useUTXOs` resolves to `amount`. The
 * wallet does NOT touch the network: a route handler (see
 * `networkRoutes.ts`) intercepts the calls.
 *
 * `seededEthWallet({ balanceWei })` wraps `createMockEthWallet` and
 * exposes the balance so route handlers / contract-read mocks can
 * answer consistently.
 *
 * Mock-first by design: nothing here boots a chain. The seed surfaces
 * deterministic state at the existing HTTP/RPC interception points.
 */

import {
  createMockBtcWallet,
  type MockBtcWallet,
  type MockBtcWalletOptions,
} from "./mockBtcWallet";
import {
  createMockEthWallet,
  type MockEthWallet,
  type MockEthWalletOptions,
} from "./mockEthWallet";

const DEFAULT_BTC_ADDRESS = "tb1qce0n0rv27dwx37dfvhxaaly4lnwelqjuqywvka";

/** Wire payload from `GET /api/address/{addr}/utxo`. */
export interface SeededMempoolUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

/** Wire payload from `GET /api/v1/validate-address/{addr}`. */
export interface SeededMempoolAddressInfo {
  isvalid: boolean;
  scriptPubKey: string;
}

export interface SeededBtcWalletOptions extends MockBtcWalletOptions {
  /** Total seeded balance in satoshis. Must be > 0n. */
  amount: bigint;
  /**
   * Optional UTXO split. Default: one UTXO holding the full amount.
   * Multi-UTXO tests exercise selection logic and must pass values that
   * sum to `amount`.
   */
  utxoSplit?: bigint[];
}

export interface SeededBtcWallet extends MockBtcWallet {
  /** Address the seeded balance is tied to. */
  address: string;
  /** Sum of `mempoolUtxos`. Equals `options.amount`. */
  balanceSats: bigint;
  /** Wire payload route handler returns from `/address/{addr}/utxo`. */
  mempoolUtxos: SeededMempoolUtxo[];
  /** Wire payload route handler returns from `/v1/validate-address/{addr}`. */
  mempoolAddressInfo: SeededMempoolAddressInfo;
}

export interface SeededEthWalletOptions extends MockEthWalletOptions {
  /** Seeded native ETH balance in wei. Must be >= 0n. */
  balanceWei: bigint;
}

export interface SeededEthWallet extends MockEthWallet {
  /** Native balance in wei (same value RPC handlers will return). */
  balanceWei: bigint;
  /** Hex-quantity form for direct use in RPC handlers. */
  balanceWeiHex: `0x${string}`;
}

function deriveTxid(index: number): string {
  return `ee${"00".repeat(30)}${index.toString(16).padStart(4, "0")}`;
}

function hashAddressToHex(address: string, hexChars: number): string {
  // assertValidScriptPubKey requires hex bytes, so we hash the address
  // into hex rather than reusing the bech32 characters directly. The
  // value is not a real signing key - tests that exercise PSBT
  // signing must override per-call via the wallet `script` API.
  let hash = 0n;
  for (const ch of address) {
    hash = (hash * 1315423911n) ^ BigInt(ch.charCodeAt(0));
  }
  return hash.toString(16).padStart(hexChars, "0").slice(-hexChars);
}

// NOTE: when this algorithm changes, mirror the update in
// `services/vault/scripts/e2e-env.mjs` (`deriveScriptPubKey`) so the
// Playwright fixtures and the standalone dev script stay consistent.
function deriveScriptPubKey(address: string): string {
  // Emit a placeholder scriptPubKey that matches the address's witness
  // type so consumers that branch on script shape (P2WPKH 20-byte hash
  // vs P2TR 32-byte x-only pubkey) see a self-consistent fixture.
  const lower = address.toLowerCase();
  if (lower.startsWith("bc1q") || lower.startsWith("tb1q")) {
    // P2WPKH: 0014 (OP_0 + push-20) + 20-byte hash160 placeholder.
    return `0014${hashAddressToHex(address, 40)}`;
  }
  if (lower.startsWith("bc1p") || lower.startsWith("tb1p")) {
    // P2TR: 5120 (OP_1 + push-32) + 32-byte x-only pubkey placeholder.
    return `5120${hashAddressToHex(address, 64)}`;
  }
  // Unrecognized witness type - fall back to P2TR placeholder so the
  // value still passes assertValidScriptPubKey. Tests that need an
  // exact match must override via the wallet `script` API.
  return `5120${hashAddressToHex(address, 64)}`;
}

function buildUtxos(
  amount: bigint,
  split: bigint[] | undefined,
): SeededMempoolUtxo[] {
  const values = split ?? [amount];
  const total = values.reduce((s, v) => s + v, 0n);
  if (total !== amount) {
    throw new Error(
      `seededBtcWallet: utxoSplit values sum to ${total}n, expected ${amount}n`,
    );
  }
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return values.map((value, index) => {
    if (value > maxSafe) {
      throw new Error(
        `seededBtcWallet: utxo value ${value}n exceeds Number.MAX_SAFE_INTEGER ` +
          `(${Number.MAX_SAFE_INTEGER}); mempool wire payload uses number, ` +
          `splitting into smaller UTXOs is required`,
      );
    }
    return {
      txid: deriveTxid(index),
      vout: 0,
      value: Number(value),
      status: { confirmed: true },
    };
  });
}

export function seededBtcWallet(
  options: SeededBtcWalletOptions,
): SeededBtcWallet {
  if (options.amount <= 0n) {
    throw new Error("seededBtcWallet: amount must be > 0n");
  }
  const wallet = createMockBtcWallet(options);
  const address = options.address ?? DEFAULT_BTC_ADDRESS;
  return {
    ...wallet,
    address,
    balanceSats: options.amount,
    mempoolUtxos: buildUtxos(options.amount, options.utxoSplit),
    mempoolAddressInfo: {
      isvalid: true,
      scriptPubKey: deriveScriptPubKey(address),
    },
  };
}

function toQuantityHex(value: bigint): `0x${string}` {
  if (value < 0n) {
    throw new Error("seededEthWallet: balanceWei must be >= 0n");
  }
  return `0x${value.toString(16)}`;
}

export function seededEthWallet(
  options: SeededEthWalletOptions,
): SeededEthWallet {
  const wallet = createMockEthWallet(options);
  return {
    ...wallet,
    balanceWei: options.balanceWei,
    balanceWeiHex: toQuantityHex(options.balanceWei),
  };
}
