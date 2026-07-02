/**
 * Static configuration + run-config types for the real-wallet E2E CLI.
 *
 * Only `connect` (action) and `real` (data mode) are implemented today; the other actions and mock
 * mode are declared here as disabled so the CLI can show the roadmap and so the shape is ready to
 * extend (see `actions/index.ts`). Nothing here mutates env — the localhost env check is verify-only.
 */
import type { SupportedWallet } from "./connector";

export type Target = "localhost" | "website";
export type NetworkName = "devnet" | "testnet";
export type BtcWalletId = "unisat" | "okx" | "onekey";
export type EthWalletId = "metamask";
export type DataMode = "real" | "mock";
export type ActionId = "connect" | "pegin" | "borrow" | "repay" | "withdraw";

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
  },
  testnet: {
    websiteUrl: "https://btc-vaults.testnet.babylonlabs.io/",
    devScript: "dev:testnet", // `pnpm dev:testnet` (uses committed .env.dev-testnet)
    mempoolApiBase: SIGNET_MEMPOOL,
    sepoliaRpcUrl: SEPOLIA_RPC,
    ethChainId: SEPOLIA_CHAIN_ID,
  },
};

export interface WalletOption<T extends string> {
  id: T;
  label: string;
}

export const BTC_WALLETS: WalletOption<BtcWalletId>[] = [
  { id: "unisat", label: "UniSat" },
  { id: "okx", label: "OKX" },
  { id: "onekey", label: "OneKey" },
];

export const ETH_WALLETS: WalletOption<EthWalletId>[] = [
  { id: "metamask", label: "MetaMask" },
];

export interface ActionOption {
  id: ActionId;
  label: string;
  enabled: boolean;
  /** Actions that must have run first (sequential model today; kept for future non-sequential entry). */
  prerequisites: ActionId[];
}

export const ACTIONS: ActionOption[] = [
  { id: "connect", label: "Connect", enabled: true, prerequisites: [] },
  { id: "pegin", label: "Pegin", enabled: false, prerequisites: ["connect"] },
  { id: "borrow", label: "Borrow", enabled: false, prerequisites: ["pegin"] },
  { id: "repay", label: "Repay", enabled: false, prerequisites: ["borrow"] },
  {
    id: "withdraw",
    label: "Withdraw",
    enabled: false,
    prerequisites: ["repay"],
  },
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
  /** Run the browser headless (default false — these are headed by nature). */
  headless: boolean;
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
