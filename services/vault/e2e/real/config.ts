/**
 * Static configuration + run-config types for the real-wallet E2E CLI.
 *
 * The `connect`, `observe`, `wallet-config`, and `pegin` actions are implemented (all `real` data
 * mode); the remaining actions and mock mode are declared here as disabled so the CLI can show the
 * roadmap and so the shape is ready to extend (see `actions/index.ts`).
 */
import type { SupportedWallet } from "./connector";

export type Target = "localhost" | "website";
export type NetworkName = "devnet" | "testnet";
export type BtcWalletId = "unisat" | "okx" | "onekey";
export type EthWalletId = "metamask";
export type DataMode = "real" | "mock";
export type ActionId =
  | "connect"
  | "observe"
  | "wallet-config"
  | "pegin"
  | "sign-conformance"
  | "borrow"
  | "repay"
  | "withdraw";

/** Maps our lowercase wallet ids to the connector's SupportedWallet keys. */
export const BTC_WALLET_TO_CONNECTOR: Record<BtcWalletId, SupportedWallet> = {
  unisat: "UNISAT",
  okx: "OKX",
  onekey: "ONEKEY",
};
export const ETH_WALLET_TO_CONNECTOR: Record<EthWalletId, SupportedWallet> = {
  metamask: "METAMASK",
};

export interface NetworkConfig {
  /** Public deployment for the `website` target. */
  websiteUrl: string;
  /** pnpm script that starts the local dev server for this network (undefined ⇒ `dev`). */
  devScript?: string;
  /** Signet mempool REST base used for the BTC balance pre-flight. */
  mempoolApiBase: string;
  /** Sepolia RPC + chain id used for the ETH balance pre-flight. */
  sepoliaRpcUrl: string;
  ethChainId: number;
  /**
   * Vite mode whose env the app resolves for this network (`pnpm dev` ⇒ `development`, `dev:testnet`
   * ⇒ `dev-testnet`). The pegin pre-flight loads the contract addresses + endpoints from that mode's
   * env (see peginParams.ts) rather than hardcoding them — they rotate via `scripts/sync-env.mjs`.
   */
  viteMode: string;
}

const SIGNET_MEMPOOL = "https://mempool.space/signet/api";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_CHAIN_ID = 11155111;

export const NETWORKS: Record<NetworkName, NetworkConfig> = {
  devnet: {
    websiteUrl: "https://demo.vault-devnet.babylonlabs.io/",
    devScript: undefined, // `pnpm dev` (runs sync-env first)
    mempoolApiBase: SIGNET_MEMPOOL,
    sepoliaRpcUrl: SEPOLIA_RPC,
    ethChainId: SEPOLIA_CHAIN_ID,
    viteMode: "development",
  },
  testnet: {
    websiteUrl: "https://btc-vaults.testnet.babylonlabs.io/",
    devScript: "dev:testnet", // `pnpm dev:testnet` (uses committed .env.dev-testnet)
    mempoolApiBase: SIGNET_MEMPOOL,
    sepoliaRpcUrl: SEPOLIA_RPC,
    ethChainId: SEPOLIA_CHAIN_ID,
    viteMode: "dev-testnet",
  },
};

export interface WalletOption<T extends string> {
  id: T;
  label: string;
  /** Selectable in the CLI. Disabled wallets stay fully wired (importer + connector map) for an
   *  easy re-enable, but are hidden from the menu and rejected as a flag value. */
  enabled: boolean;
}

export const BTC_WALLETS: WalletOption<BtcWalletId>[] = [
  { id: "unisat", label: "UniSat", enabled: true },
  { id: "okx", label: "OKX", enabled: true },
  // OneKey does not currently sign `signPsbts` correctly (batch payout/graph signing). Disabled until
  // OneKey fixes it upstream; the importer + connector mapping remain so re-enabling is `enabled: true`.
  { id: "onekey", label: "OneKey", enabled: false },
];

export const ETH_WALLETS: WalletOption<EthWalletId>[] = [
  { id: "metamask", label: "MetaMask", enabled: true },
];

export interface ActionOption {
  id: ActionId;
  label: string;
  enabled: boolean;
}

export const ACTIONS: ActionOption[] = [
  { id: "connect", label: "Connect", enabled: true },
  { id: "observe", label: "Observe (record a manual peg-in)", enabled: true },
  {
    id: "wallet-config",
    label: "Wallet config (snapshot lock settings)",
    enabled: true,
  },
  { id: "pegin", label: "Pegin", enabled: true },
  {
    id: "sign-conformance",
    label: "Sign conformance (replay captured signing into this wallet)",
    enabled: true,
  },
  { id: "borrow", label: "Borrow", enabled: true },
  { id: "repay", label: "Repay", enabled: true },
  { id: "withdraw", label: "Withdraw", enabled: true },
];

/** A fully-resolved run: what the user chose (interactively or via flags). */
export interface RunConfig {
  target: Target;
  network: NetworkName;
  btcWallet: BtcWalletId;
  ethWallet: EthWalletId;
  action: ActionId;
  dataMode: DataMode;
  /** Artificial per-"wait" delay, in ms (mock-only; no-op for real connect). */
  delayMs: number;
  /** Pegin only: BTC amount to deposit (`--amount`); the action defaults it when absent. */
  peginAmountBtc?: string;
  /** Pegin only: vault provider name to select (`--vp`); defaults to the first available. */
  peginProvider?: string;
  /** Pegin only: run a two-vault (split) deposit (`--split`) instead of a single vault. */
  split?: boolean;
  /** Sign-conformance only: path to a `signing.jsonl` (`--fixtures`); defaults to the newest pegin's. */
  fixturesPath?: string;
  /**
   * Borrow only: peg in first (`--pegin-first`), then borrow against the fresh collateral in the same
   * run. When set, the pegin extras above (`peginAmountBtc`/`peginProvider`/`split`) drive that pegin.
   */
  peginFirst?: boolean;
  /** Borrow only: token symbol to borrow (`--borrow-token`); defaults to the first borrowable reserve. */
  borrowToken?: string;
  /**
   * Borrow only: token amount to borrow (`--borrow-amount`, or `max` for the form's Max). When absent
   * the CLI defaults to a conservative fraction of the computed max (see borrowParams).
   */
  borrowAmount?: string;
  /**
   * Repay only: borrow first (`--borrow-first`), then repay in the same run. When set, the borrow extras
   * (`borrowToken`/`borrowAmount`) drive that borrow, and `repayToken` defaults to the borrowed token.
   */
  borrowFirst?: boolean;
  /** Repay only: token symbol to repay (`--repay-token`); defaults to the sole/first outstanding loan. */
  repayToken?: string;
  /**
   * Repay only: token amount to repay (`--repay-amount`, or `max` for the form's Max — a full clear).
   * When absent the CLI defaults to a conservative fraction of the outstanding debt (see repayParams).
   */
  repayAmount?: string;
  /**
   * Withdraw only: repay the outstanding debt in full (`--repay-first`) before withdrawing, so collateral
   * is no longer health-factor-gated. When set, the repay leg reuses the repay flow with `repayAmount`
   * forced to `max`; `repayToken` defaults to the sole/first outstanding loan.
   */
  repayFirst?: boolean;
  /**
   * Withdraw only: release every selectable vault (`--withdraw-all`) instead of just the first
   * withdrawable one. Default (absent) withdraws a single vault, keeping the position alive for reuse.
   */
  withdrawAll?: boolean;
}

/** Resolve the target URL a run should open. */
export function resolveTargetUrl(
  config: RunConfig,
  localhostBaseUrl: string,
): string {
  return config.target === "website"
    ? NETWORKS[config.network].websiteUrl
    : localhostBaseUrl;
}
