// The activation tx of each listed vault, from the indexer's activity rows: the `deposit` row comes
// from `PeginActivated` (both activation functions emit it), the `claim_expired` row from `claimExpiredVault`.

import { gql } from "graphql-request";
import type { Hex } from "viem";

import { graphqlClient } from "@/clients/graphql";

export type ActivationRow =
  | { kind: "activation"; txHash: Hex }
  | { kind: "claimed_expired" };

interface ActivationRowsResponse {
  vaultActivitys: {
    items: {
      vaultId: string;
      type: "deposit" | "claim_expired";
      transactionHash: Hex;
    }[];
  };
}

// One such row per vault, so the id count is the limit (Ponder caps it at 1000).
const GET_ACTIVATION_ROWS = gql`
  query GetActivationRows($vaultIds: [String!]!, $limit: Int!) {
    vaultActivitys(
      where: { vaultId_in: $vaultIds, type_in: [deposit, claim_expired] }
      limit: $limit
    ) {
      items {
        vaultId
        type
        transactionHash
      }
    }
  }
`;

/** Each vault's activation row, keyed by the id exactly as given; a vault with no row yet is absent. */
export async function fetchActivationRows(
  vaultIds: readonly Hex[],
): Promise<ReadonlyMap<string, ActivationRow>> {
  // The indexer stores ids lowercase.
  const givenByStored = new Map(vaultIds.map((id) => [id.toLowerCase(), id]));
  const response = await graphqlClient.request<ActivationRowsResponse>(
    GET_ACTIVATION_ROWS,
    { vaultIds: [...givenByStored.keys()], limit: vaultIds.length },
  );
  const rows = new Map<string, ActivationRow>();
  for (const item of response.vaultActivitys.items) {
    const given = givenByStored.get(item.vaultId.toLowerCase());
    if (given === undefined) continue;
    rows.set(
      given,
      item.type === "deposit"
        ? { kind: "activation", txHash: item.transactionHash }
        : { kind: "claimed_expired" },
    );
  }
  return rows;
}
