import type { Connectors } from "@/context/Chain.context";
import type { Account, ChainId, IWallet } from "@/core/types";

export const WALLET_CONFIRMATION_RECEIPT_KEY = "__babylon-wallet-confirmation-v1__";

interface ConfirmationConnection {
  chain: ChainId;
  wallet: IWallet;
  account: Account;
}

interface ConfirmationReceiptEntry {
  chain: ChainId;
  walletId: string;
  address: string;
  publicKeyHex: string;
  network: string;
}

interface ConfirmationReceipt {
  version: 1;
  requiredChains: ChainId[];
  entries: ConfirmationReceiptEntry[];
}

function normalizedRequiredChains(requiredChainIds: readonly string[]): ChainId[] {
  return [...new Set(requiredChainIds)].sort() as ChainId[];
}

function connectorFor(connectors: Connectors, chain: ChainId) {
  return connectors[chain as keyof Connectors];
}

function networkIdentity(connectors: Connectors, chain: ChainId): string {
  const config = connectorFor(connectors, chain)?.config as
    | { chainId?: string | number; network?: string | number }
    | undefined;
  const value = chain === "BTC" ? config?.network : config?.chainId;
  return value === undefined ? "" : String(value);
}

function sameIdentity(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isReceiptEntry(value: unknown): value is ConfirmationReceiptEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const entry = value as Partial<ConfirmationReceiptEntry>;
  return (
    typeof entry.chain === "string" &&
    typeof entry.walletId === "string" &&
    typeof entry.address === "string" &&
    typeof entry.publicKeyHex === "string" &&
    typeof entry.network === "string"
  );
}

/**
 * Serialize the exact required-chain, wallet, account, and network identity
 * covered by a successful confirmation lifecycle.
 */
export function createConfirmationReceipt(
  requiredChainIds: readonly string[],
  connections: readonly ConfirmationConnection[],
  connectors: Connectors,
): string | undefined {
  const requiredChains = normalizedRequiredChains(requiredChainIds);
  const entries: ConfirmationReceiptEntry[] = [];

  for (const chain of requiredChains) {
    const connection = connections.find((candidate) => candidate.chain === chain);
    if (!connection?.account || !connectorFor(connectors, chain)) {
      return undefined;
    }
    entries.push({
      chain,
      walletId: connection.wallet.id,
      address: connection.account.address,
      publicKeyHex: connection.account.publicKeyHex,
      network: networkIdentity(connectors, chain),
    });
  }

  return JSON.stringify({ version: 1, requiredChains, entries });
}

/** Validate a persisted receipt against the currently restored connectors. */
export function isValidConfirmationReceipt(
  serialized: string | undefined,
  requiredChainIds: readonly string[],
  connectors: Connectors,
): boolean {
  if (!serialized) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }

  const receipt = parsed as Partial<ConfirmationReceipt>;

  const requiredChains = normalizedRequiredChains(requiredChainIds);
  if (
    receipt.version !== 1 ||
    !Array.isArray(receipt.requiredChains) ||
    !Array.isArray(receipt.entries) ||
    !receipt.requiredChains.every((chain) => typeof chain === "string") ||
    !receipt.entries.every(isReceiptEntry) ||
    receipt.requiredChains.length !== requiredChains.length ||
    receipt.entries.length !== requiredChains.length ||
    receipt.requiredChains.some((chain, index) => chain !== requiredChains[index])
  ) {
    return false;
  }

  const entries = receipt.entries;
  return requiredChains.every((chain) => {
    const connector = connectorFor(connectors, chain);
    const wallet = connector?.connectedWallet;
    const account = wallet?.account;
    const entry = entries.find((candidate) => candidate.chain === chain);
    return Boolean(
      wallet &&
        account &&
        entry &&
        entry.walletId === wallet.id &&
        sameIdentity(entry.address, account.address) &&
        sameIdentity(entry.publicKeyHex, account.publicKeyHex) &&
        entry.network === networkIdentity(connectors, chain),
    );
  });
}
