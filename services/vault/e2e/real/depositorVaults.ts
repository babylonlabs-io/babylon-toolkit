/**
 * A deposit's vaults as the registry records them, found from the deposit's Pre-PegIn txid.
 *
 * The indexer only names the candidates: a vault is a candidate when the Pre-PegIn the indexer serves
 * for it hashes to the deposit's txid. Everything a caller then judges (status, HTLC outpoint, the
 * signed PegIn, the depositor key) comes from the vault's on-chain registry record, which must name the
 * same Pre-PegIn.
 */
import {
  calculateBtcTxHash,
  ViemVaultRegistryReader,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import type { VaultData } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { gql } from "graphql-request";
import type { Hex } from "viem";

import type { NetworkName } from "./config";
import {
  createEthClient,
  createGraphQLClient,
  resolveNetworkContracts,
} from "./networkContracts";

/** Ponder's max page size and a runaway-cursor backstop, as in peginParams.ts. */
const INDEXER_VAULTS_PAGE_SIZE = 1000;
const INDEXER_MAX_VAULT_PAGES = 50;

const DEPOSITOR_VAULTS_FIRST = gql`
  query DepositorVaultsFirst($depositor: String!, $limit: Int!) {
    vaults(where: { depositor: $depositor }, limit: $limit) {
      items {
        id
        unsignedPrePeginTx
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const DEPOSITOR_VAULTS_NEXT = gql`
  query DepositorVaultsNext(
    $depositor: String!
    $limit: Int!
    $after: String!
  ) {
    vaults(where: { depositor: $depositor }, limit: $limit, after: $after) {
      items {
        id
        unsignedPrePeginTx
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface IndexerVault {
  id: Hex;
  unsignedPrePeginTx: string | null;
}

interface IndexerVaultPage {
  vaults: {
    items: IndexerVault[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

/** One vault of the deposit: its registry record, plus the funded Pre-PegIn it was built on. */
export interface RegisteredVault extends VaultData {
  vaultId: Hex;
  /** The funded Pre-PegIn as the indexer serves it; its txid is the deposit's Pre-PegIn txid. */
  fundedPrePeginTxHex: string;
}

const stripHex = (value: string): string => value.replace(/^0x/i, "");

/**
 * Every vault of the depositor, across the indexer's pages. Refuses a list that does not fit rather than
 * searching part of it, which would report a deposit as missing when it is not.
 */
async function fetchDepositorVaults(
  graphqlEndpoint: string,
  depositor: string,
): Promise<IndexerVault[]> {
  const client = createGraphQLClient(graphqlEndpoint);
  const vaults: IndexerVault[] = [];
  let after: string | null = null;
  for (let pageIndex = 0; pageIndex < INDEXER_MAX_VAULT_PAGES; pageIndex++) {
    const page: IndexerVaultPage = after
      ? await client.request(DEPOSITOR_VAULTS_NEXT, {
          depositor,
          limit: INDEXER_VAULTS_PAGE_SIZE,
          after,
        })
      : await client.request(DEPOSITOR_VAULTS_FIRST, {
          depositor,
          limit: INDEXER_VAULTS_PAGE_SIZE,
        });
    vaults.push(...page.vaults.items);
    after = page.vaults.pageInfo.hasNextPage
      ? page.vaults.pageInfo.endCursor
      : null;
    if (!after) return vaults;
  }
  throw new Error(
    `${depositor} has more vaults than ${INDEXER_MAX_VAULT_PAGES} indexer pages hold; refusing to search a partial list.`,
  );
}

/**
 * The depositor's vaults funded by Pre-PegIn `prePeginTxid` (lowercase, no `0x`), each read from the
 * registry. Throws when the depositor has no such deposit, or when a vault's record names another
 * Pre-PegIn than the one the indexer served for it.
 */
export async function findRegisteredVaults(
  network: NetworkName,
  depositorEthAddress: string,
  prePeginTxid: string,
): Promise<RegisteredVault[]> {
  const { registry, graphqlEndpoint, ethRpcUrl } =
    resolveNetworkContracts(network);
  const vaults = await fetchDepositorVaults(
    graphqlEndpoint,
    depositorEthAddress.toLowerCase(),
  );
  const candidates = vaults.flatMap((v) =>
    v.unsignedPrePeginTx !== null &&
    stripHex(calculateBtcTxHash(v.unsignedPrePeginTx)).toLowerCase() ===
      prePeginTxid
      ? [{ id: v.id, fundedPrePeginTxHex: stripHex(v.unsignedPrePeginTx) }]
      : [],
  );
  if (candidates.length === 0)
    throw new Error(
      `No deposit of ${depositorEthAddress} has Pre-PegIn txid ${prePeginTxid}.`,
    );

  const reader = new ViemVaultRegistryReader(
    createEthClient(ethRpcUrl),
    registry,
  );
  const registered: RegisteredVault[] = [];
  for (const candidate of candidates) {
    const record = await reader.getVaultData(candidate.id);
    const recordedPrePeginTxid = stripHex(
      record.protocol.prePeginTxHash,
    ).toLowerCase();
    if (recordedPrePeginTxid !== prePeginTxid)
      throw new Error(
        `The registry records vault ${candidate.id}'s HTLC on Pre-PegIn ${recordedPrePeginTxid}, not ${prePeginTxid}.`,
      );
    registered.push({
      vaultId: candidate.id,
      fundedPrePeginTxHex: candidate.fundedPrePeginTxHex,
      ...record,
    });
  }
  return registered;
}
