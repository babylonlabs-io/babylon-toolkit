/**
 * Hook returning how many protocol-wide live-vault slots a peg-in
 * registration can reserve, read from the on-chain CapPolicy.
 *
 * Every peg-in reserves one slot at registration, and a batch of N BTCVaults
 * reserves N in the same transaction, so the whole batch reverts with
 * `LiveVaultCapExceeded` when fewer are free. The deposit form uses this read
 * to stop such a deposit before the depositor signs anything.
 *
 * Gated by the `DISABLE_VAULT_CAP` kill-switch, like `useApplicationCap`.
 */

import { useQuery } from "@tanstack/react-query";
import { maxUint256 } from "viem";

import { getAvailableLiveVaultSlots } from "@/clients/eth-contract/cap-policy";
import featureFlags from "@/config/featureFlags";

const LIVE_VAULT_SLOTS_KEY = "liveVaultSlots";
const LIVE_VAULT_REFETCH_INTERVAL_MS = 60_000;
const LIVE_VAULT_STALE_TIME_MS = 30_000;

/**
 * Returns the free slots, or `null` when the gate is off (CapPolicy then
 * reports `type(uint256).max`), when CapPolicy predates the live-vault cap,
 * while the read loads, after it fails, or when the kill-switch is set.
 *
 * Fails open, unlike the supply cap: the slot is reserved at registration,
 * before any BTC is broadcast, so a deposit this check lets through still
 * stops there with no funds moved. Blocking on an unreadable value would
 * instead stop every deposit, for example against a CapPolicy built before
 * the live-vault cap existed.
 */
export function useLiveVaultSlots(): bigint | null {
  const { data, isError } = useQuery({
    queryKey: [LIVE_VAULT_SLOTS_KEY],
    queryFn: getAvailableLiveVaultSlots,
    staleTime: LIVE_VAULT_STALE_TIME_MS,
    refetchInterval: LIVE_VAULT_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    enabled: !featureFlags.isVaultCapDisabled,
  });

  if (data === undefined || isError || data === maxUint256) return null;
  return data;
}
