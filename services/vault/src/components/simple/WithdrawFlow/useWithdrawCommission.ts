/**
 * VP commission for the vaults under review (issue #2546).
 *
 * Each vault freezes its vault provider's commission when it is created, and
 * the payout deducts `floor(amount × bps / 10_000)` per vault at that rate. The
 * protocol-wide minimum can be lower, so it must not stand in for the rate.
 * Both reads go to the env-pinned BTCVaultRegistry. A failed read fails
 * closed: Review shows an error and Confirm stays disabled.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";

import { BPS_SCALE } from "@/applications/aave/constants";
import { getBtcVaultBasicInfoFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { assertVpCommissionInProtocolRange } from "@/services/vault/vaultPayoutSignatureService";

const WITHDRAW_COMMISSION_QUERY_KEY = "withdrawVpCommission";

export type WithdrawCommission =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      /** The vaults the commission was read for — the set Confirm submits. */
      vaultIds: Hex[];
      commissionSats: bigint;
    };

/** Sum of the payout commission of each vault, at the vault's own rate. */
export async function readWithdrawCommissionSats(
  vaultIds: readonly Hex[],
): Promise<bigint> {
  const [protocolInfos, basicInfos] = await Promise.all([
    getVaultRegistryReader().getProtocolInfoBatch(vaultIds),
    getBtcVaultBasicInfoFromChain(vaultIds),
  ]);

  return vaultIds.reduce((total, vaultId, i) => {
    const bps = protocolInfos[i].vaultProviderCommissionBps;
    // The vault's snapshot is the only rate that applies: this checks only
    // that the read is a rate the registry could have accepted.
    assertVpCommissionInProtocolRange(bps);
    const basicInfo = basicInfos.get(vaultId.toLowerCase() as Hex);
    if (!basicInfo) {
      throw new Error(`No on-chain amount read for vault ${vaultId}`);
    }
    return total + (basicInfo.amount * BigInt(bps)) / BigInt(BPS_SCALE);
  }, 0n);
}

export function useWithdrawCommission(
  vaultIds: readonly string[],
): WithdrawCommission {
  // Joined so an unchanged selection keeps a stable query key across renders.
  // Not sorted: Confirm submits these IDs in the caller's order.
  const selectionKey = vaultIds.join(",");
  const selectedIds = useMemo(
    () => (selectionKey ? (selectionKey.split(",") as Hex[]) : []),
    [selectionKey],
  );

  // No placeholder data: a result for another selection must never show, or
  // reach the submission, while this one loads.
  const query = useQuery({
    queryKey: [WITHDRAW_COMMISSION_QUERY_KEY, selectionKey] as const,
    queryFn: () => readWithdrawCommissionSats(selectedIds),
    enabled: selectedIds.length > 0,
    // Rate and amount are frozen on-chain per vault.
    staleTime: Infinity,
  });

  const { isError, data } = query;
  return useMemo(() => {
    if (isError) return { status: "error" };
    if (data === undefined) return { status: "loading" };
    return { status: "ready", vaultIds: selectedIds, commissionSats: data };
  }, [isError, data, selectedIds]);
}
