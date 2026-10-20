// Why the registry redeemed each listed vault at activation, read from the activation tx the indexer names.
// Rows poll while any listed vault has no row; a reason, once read, is cached for good.

import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { Hex } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { getReadersAtBlock } from "@/clients/eth-contract/sdk-readers";
import { CONTRACTS } from "@/config/contracts";
import { getETHChain } from "@/config/network";
import { POLLING_INTERVAL_MS } from "@/config/polling";
import {
  fetchActivationRows,
  type ActivationRow,
} from "@/services/activity/activationTxQuery";
import {
  activationFunctionFromTransaction,
  classifyActivationRedeem,
  isCapInferenceAllowed,
  type ActivationRedeemReason,
} from "@/services/vault/activationRedeemReason";
import type { VaultActivity } from "@/types/activity";

export const ACTIVATION_REDEEM_REASON_QUERY_KEY = "activationRedeemReason";

/** Never part of a vault id (a `0x` hex string), so the joined key is unambiguous. */
const VAULT_IDS_KEY_SEPARATOR = ",";

function hasEveryRow(
  rows: ReadonlyMap<string, ActivationRow> | undefined,
  vaultIds: readonly string[],
): boolean {
  return rows !== undefined && vaultIds.every((id) => rows.has(id));
}

/** True when the registry had the activation gas gate (would emit ActivationFailed) at `blockNumber`; false when unreadable. */
async function gatePresentAt(blockNumber: bigint): Promise<boolean> {
  try {
    // Block-end state through the ProtocolParams pointer as resolved at that block; its width signals the registry emits
    // ActivationFailed. Assumes both proxies upgraded in one tx (devnet 0x65450d11…, block 11952508); a non-archive RPC throws.
    const { protocolParamsReader } = await getReadersAtBlock(blockNumber);
    return (
      (await protocolParamsReader.getTBVProtocolParams(blockNumber))
        .minActivationGas !== null
    );
  } catch {
    return false;
  }
}

async function fetchActivationRedeemReason(
  activity: VaultActivity,
  txHash: Hex,
): Promise<ActivationRedeemReason> {
  const client = ethClient.getPublicClient();
  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash: txHash }),
    client.getTransaction({ hash: txHash }),
  ]);
  const reason = classifyActivationRedeem({
    logs: receipt.logs,
    vaultId: activity.id,
    calledFunction: activationFunctionFromTransaction(tx, activity.id),
    gatePresentAtReceipt: await gatePresentAt(receipt.blockNumber),
    capInferenceAllowed: isCapInferenceAllowed(activity.applicationEntryPoint),
  });
  return reason ?? { kind: "unknown" };
}

/** The resolved redeem reason by `activity.id`, as listed. */
export function useActivationRedeemReasons(
  activities: VaultActivity[],
): ReadonlyMap<string, ActivationRedeemReason> {
  const deployment = [getETHChain().id, CONTRACTS.BTC_VAULT_REGISTRY] as const;
  // Keyed on membership, not on the list's identity.
  const vaultIdsKey = useMemo(
    () =>
      activities
        .map((activity) => activity.id)
        .sort()
        .join(VAULT_IDS_KEY_SEPARATOR),
    [activities],
  );
  const vaultIds = useMemo(
    () =>
      vaultIdsKey === ""
        ? []
        : (vaultIdsKey.split(VAULT_IDS_KEY_SEPARATOR) as Hex[]),
    [vaultIdsKey],
  );

  const { data: rows } = useQuery({
    queryKey: [
      ACTIVATION_REDEEM_REASON_QUERY_KEY,
      ...deployment,
      "activationRows",
      vaultIdsKey,
    ],
    queryFn: () => fetchActivationRows(vaultIds),
    enabled: vaultIds.length > 0,
    retry: 1,
    refetchInterval: (query) =>
      hasEveryRow(query.state.data, vaultIds) ? false : POLLING_INTERVAL_MS,
  });

  const activations = useMemo(
    () =>
      activities.flatMap((activity) => {
        const row = rows?.get(activity.id);
        return row?.kind === "activation"
          ? [{ activity, txHash: row.txHash }]
          : [];
      }),
    [activities, rows],
  );

  const combine = useCallback(
    (results: { data?: ActivationRedeemReason }[]) => {
      const reasons = new Map<string, ActivationRedeemReason>();
      results.forEach((result, index) => {
        if (result.data !== undefined) {
          reasons.set(activations[index].activity.id, result.data);
        }
      });
      return reasons as ReadonlyMap<string, ActivationRedeemReason>;
    },
    [activations],
  );

  return useQueries({
    queries: activations.map(({ activity, txHash }) => ({
      queryKey: [
        ACTIVATION_REDEEM_REASON_QUERY_KEY,
        ...deployment,
        activity.id,
        txHash,
      ],
      queryFn: () => fetchActivationRedeemReason(activity, txHash),
      staleTime: Infinity,
      retry: 1,
    })),
    combine,
  });
}
