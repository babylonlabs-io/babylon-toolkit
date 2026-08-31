import type { Connectors } from "@/context/Chain.context";
import type { Account, ChainId, IWallet } from "@/core/types";

export const WALLET_CONFIRMATION_RECEIPT_KEY = "__babylon-wallet-confirmation-v1__";

const RECEIPT_VERSION = 2;

export interface ConfirmationConnection {
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
  version: typeof RECEIPT_VERSION;
  entries: ConfirmationReceiptEntry[];
}

function connectorFor(connectors: Connectors, chain: ChainId) {
  return connectors[chain];
}

/**
 * The network a chain's connector is pointed at. A receipt approved on signet
 * must not restore a session against mainnet, so this participates in the
 * match alongside the account identity.
 */
function networkIdentity(
  connectors: Connectors,
  chain: ChainId,
  networks?: Partial<Record<ChainId, string | number>>,
): string {
  const config = connectorFor(connectors, chain)?.config as
    | { chainId?: string | number; network?: string | number }
    | undefined;
  const value = networks?.[chain] ?? (chain === "BTC" ? config?.network : config?.chainId);

  return value === undefined ? "" : String(value);
}

export function sameIdentity(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isReceiptEntry(value: unknown): value is ConfirmationReceiptEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

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
 * Serializes what the user approved: the wallet, account and network of every
 * chain connected at the moment they confirmed.
 *
 * Deliberately records the connected set rather than the required set. A host
 * that varies its requirements per route would otherwise mint a receipt on one
 * route that cannot satisfy the next, and sign the user out on navigation.
 */
export function createConfirmationReceipt(
  connections: readonly ConfirmationConnection[],
  connectors: Connectors,
  networks?: Partial<Record<ChainId, string | number>>,
): string {
  const entries = connections
    .filter((connection) => connection.account && connectorFor(connectors, connection.chain))
    .map<ConfirmationReceiptEntry>((connection) => ({
      chain: connection.chain,
      walletId: connection.wallet.id,
      address: connection.account.address,
      publicKeyHex: connection.account.publicKeyHex,
      network: networkIdentity(connectors, connection.chain, networks),
    }))
    .sort((left, right) => left.chain.localeCompare(right.chain));

  return JSON.stringify({ version: RECEIPT_VERSION, entries } satisfies ConfirmationReceipt);
}

/**
 * True when the stored approval covers every currently-required chain and each
 * one still matches the live connection.
 *
 * Coverage, not equality: a receipt may name chains that are not required right
 * now, which is what lets a host narrow and widen its requirements — per route,
 * say — without invalidating an approval the user already gave. A required
 * chain the receipt does not name is never covered, so consent is still never
 * inherited by a chain, account, wallet or network the user did not approve.
 */
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

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;

  const receipt = parsed as Partial<ConfirmationReceipt>;

  if (
    receipt.version !== RECEIPT_VERSION ||
    !Array.isArray(receipt.entries) ||
    !receipt.entries.every(isReceiptEntry)
  ) {
    return false;
  }

  const entries = receipt.entries;

  // An empty requirement set is satisfied by any receipt, but never by none:
  // the caller still has to have an approval on file.
  return requiredChainIds.every((chainId) => {
    const chain = chainId as ChainId;
    const wallet = connectorFor(connectors, chain)?.connectedWallet;
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

/** Chains the stored approval names, whether or not they are required now. */
export function confirmedChains(serialized: string | undefined): ChainId[] {
  if (!serialized) return [];

  try {
    const parsed = JSON.parse(serialized) as Partial<ConfirmationReceipt>;
    if (parsed?.version !== RECEIPT_VERSION || !Array.isArray(parsed.entries)) return [];

    return parsed.entries.filter(isReceiptEntry).map((entry) => entry.chain);
  } catch {
    return [];
  }
}
