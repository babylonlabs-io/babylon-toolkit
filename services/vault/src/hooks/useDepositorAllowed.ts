/**
 * Hook returning whether the connected Ethereum account is on the depositor
 * allow-list of the application it would deposit into, read from the on-chain
 * AllowListPolicy.
 *
 * The registry refuses a registration from an unlisted depositor with
 * `DepositNotAllowed()`. The deposit form uses this read to stop such a deposit
 * before the depositor signs anything, rather than after the BTC wallet's
 * signing prompts.
 */

import { skipToken, useQuery } from "@tanstack/react-query";

import { readDepositorAllowed } from "@/clients/eth-contract/allow-list-policy";
import { toCheckedAddress } from "@/utils/addressUtils";

/** Exported so the deposit flow can refresh the form after it refuses the depositor itself. */
export const DEPOSITOR_ALLOWED_QUERY_KEY = "depositorAllowed";
const DEPOSITOR_ALLOWED_REFETCH_INTERVAL_MS = 60_000;
const DEPOSITOR_ALLOWED_STALE_TIME_MS = 30_000;

/**
 * Returns the chain's answer, or `null` while the read loads, after it fails,
 * or while either address is missing.
 *
 * Fails open: the registry checks the list at registration, before any BTC is
 * broadcast or ETH spent, so a deposit this check lets through still stops
 * there with no funds moved. Blocking on an unreadable value would instead stop
 * every deposit, including on networks whose gate is removed.
 */
export function useDepositorAllowed(
  applicationEntryPoint: string,
  depositor: string | undefined,
): boolean | null {
  const app = toCheckedAddress(applicationEntryPoint);
  const account = toCheckedAddress(depositor);

  const { data, isError } = useQuery({
    queryKey: [DEPOSITOR_ALLOWED_QUERY_KEY, app ?? null, account ?? null],
    queryFn:
      app === undefined || account === undefined
        ? skipToken
        : () =>
            readDepositorAllowed({
              applicationEntryPoint: app,
              depositor: account,
            }),
    staleTime: DEPOSITOR_ALLOWED_STALE_TIME_MS,
    refetchInterval: DEPOSITOR_ALLOWED_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  if (data === undefined || isError) return null;
  return data;
}
