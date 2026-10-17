// Authoritative confirmation that a suspected-stuck vault is REALLY still
// unactivated on chain, and that its PegIn is a valid spend of the HTLC.
//
// The stuck state (VERIFIED + HTLC swept by the pegin tx) is derived from the
// INDEXER's contract status plus a BTC-side probe. Both can be right while the
// conclusion is wrong: activation succeeds on chain, the indexer has not caught
// up, and the vault still reads VERIFIED. The BTC evidence is then entirely
// consistent with a healthy, activated deposit.
//
// That mattered because the only thing standing between a lagging indexer and a
// false "Activation incomplete" was a per-device `localStorage` marker. On a
// second device, or after a cleared profile, the marker is absent: the deposit
// renders as stuck, `useSigningRequiredNotifications` fires a push saying the
// vault could not be activated, and clicking it opens a BTC signing popup -
// the secret is derived before any on-chain status read. A fresh VERIFIED check
// downstream stops real harm, but the user has already been alarmed and asked
// for a signature they did not need to give.
//
// So the stuck state now requires a POSITIVE on-chain confirmation, in the same
// shape as `useActivationDeadlineGate`: the indexer supplies cheap Tier-1
// suspects, and only a chain read that still reports VERIFIED promotes one to
// genuinely stuck.
//
// The BTC-side probe is also only the mempool API's word. An API that names
// the vault's public PegIn txid as the HTLC's spender turns a healthy VERIFIED
// vault "stuck": normal activation disappears and the only action offered is
// the irreversible activate-and-redeem. So Tier 3 proves the spend from the
// PegIn itself, fetched by the txid of the on-chain signed PegIn: its witness
// must be one Bitcoin accepts — the preimage of the on-chain hashlock and every
// participant's signature (`provePeginSpendsHtlc`). The signatures are public,
// so no API can produce one before the secret is public. Once it is (a
// reverted activation's calldata), anyone can build that PegIn, and broadcast
// it while the HTLC is unspent: the proof shows a valid spend of the HTLC, not
// that one was broadcast.

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { type Hex, zeroAddress } from "viem";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { provePeginSpendsHtlc } from "@/clients/btc/outspend";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { logger } from "@/infrastructure";
import { shortId, TELEMETRY_EVENT } from "@/infrastructure/telemetryEvents";
import { mapWithConcurrency } from "@/utils/concurrency";

const STUCK_VAULT_CONFIRM_QUERY_KEY = "stuckVaultChainConfirm";
// The stuck state is terminal-ish and rare; it does not need a fast cadence.
// Matches the activation-deadline gate so the two chain reads batch together.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;
// Cap concurrency — the public mempool.space endpoint rate-limits (429s). Each
// proof fetches the PegIn and the Pre-PegIn at once, so two proofs keep four
// requests in flight, the budget `useBtcHtlcRefundStatus` keeps.
const MAX_CONCURRENT_PROOFS = 2;

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Lowercased ids of suspected-stuck vaults the chain confirms are STILL
 * `VERIFIED` — i.e. genuinely unactivated — and whose PegIn, fetched from
 * Bitcoin, is proven a valid spend of the HTLC.
 *
 * Fails OPEN in every uncertain case: an absent id means "not confirmed stuck",
 * so an RPC failure, an unregistered vault, a vault the chain already reports
 * ACTIVE, or a PegIn that cannot be fetched or proven all leave the deposit
 * rendering normally. That direction is deliberate. Failing the other way
 * produces exactly the defect this exists to remove — a false alarm plus a
 * signing prompt on a healthy deposit. The cost of failing open is that a
 * genuinely stuck depositor waits for the escape hatch until the chain read
 * and the PegIn proof both succeed — one poll interval when they do, longer
 * while the mempool API keeps failing to serve the PegIn or the Pre-PegIn —
 * which is recoverable; the cost of failing closed is not. Failing open
 * grants the mempool API nothing either: answering "unspent" already hides the
 * stuck state at Tier 1.
 *
 * One carry-forward: a vault an earlier poll of this suspect set proved keeps
 * its confirmation through a poll where the PegIn or the Pre-PegIn cannot be
 * fetched, while the chain still reports it VERIFIED. A valid witness cannot
 * stop being valid, and the row would otherwise flip between Withdraw and
 * Activate on every rate limit.
 */
export function useStuckVaultChainConfirm(
  suspectIds: readonly Hex[],
): ReadonlySet<string> {
  const queryClient = useQueryClient();
  // Vaults whose refusal was already reported: the poll repeats it every
  // minute, and one event per vault is the signal. Held per mount, so a
  // remount of the polling provider may report a vault once more.
  const [reportedRefusals] = useState(() => new Set<string>());

  // Joined so an unchanged suspect set keeps a stable query key across renders.
  const suspectKey = useMemo(
    () => [...suspectIds].sort().join(","),
    [suspectIds],
  );
  const queryKey = useMemo(
    () => [STUCK_VAULT_CONFIRM_QUERY_KEY, suspectKey] as const,
    [suspectKey],
  );

  const query = useQuery({
    queryKey,
    enabled: suspectKey.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // No placeholderData: when the suspect set changes the key, the gate must
    // fail open until the chain reconfirms rather than carry a confirmation
    // computed for a different set.
    queryFn: async (): Promise<Set<string>> => {
      const reader = getVaultRegistryReader();
      const apiUrl = getMempoolApiUrl();
      const ids = suspectKey.split(",") as Hex[];
      const prior = queryClient.getQueryData<Set<string>>(queryKey);

      // Per-vault reads coalesce into one Multicall3 round-trip (client
      // batch). Two plain reads rather than `getVaultData`: that one is a
      // multicall itself, which the client batch never folds in.
      const records = await Promise.all(
        ids.map(async (id) => {
          try {
            const [basic, protocol] = await Promise.all([
              reader.getVaultBasicInfo(id),
              reader.getVaultProtocolInfo(id),
            ]);
            return { id, basic, protocol };
          } catch {
            // Not on chain yet / transient RPC error → don't confirm.
            return null;
          }
        }),
      );

      // Unregistered / zero record → nothing to conclude. Otherwise only a
      // vault the CHAIN still reports VERIFIED is stuck: ACTIVE means
      // activation landed and the indexer is behind.
      const verified = records.filter(
        (record): record is NonNullable<typeof record> =>
          record !== null &&
          record.basic.depositor !== zeroAddress &&
          record.basic.status === OnChainBtcVaultStatus.VERIFIED,
      );

      // Failing open must not fail silently: a refusal hides the escape hatch,
      // and a wrong one would hide the only exit of a stuck vault, so it is
      // sent as an event, once per vault. Nothing reported is secret — the
      // PegIn is public data.
      const reportRefusal = (id: Hex, detail: Record<string, string>) => {
        const key = id.toLowerCase();
        if (reportedRefusals.has(key)) return;
        reportedRefusals.add(key);
        logger.event(TELEMETRY_EVENT.ACTIVATION_STUCK_PROOF_REFUSED, {
          level: "warning",
          category: "activation",
          tags: { vaultId: shortId(id) },
          ...detail,
        });
      };

      const proven = await mapWithConcurrency(
        verified,
        MAX_CONCURRENT_PROOFS,
        async ({ id, protocol }): Promise<string | null> => {
          const key = id.toLowerCase();
          try {
            const proof = await provePeginSpendsHtlc(protocol, apiUrl);
            if (proof.status === "proven") return key;
            if (proof.status === "unproven") {
              reportRefusal(id, { reason: proof.reason });
              return null;
            }
            // A failed fetch is routine (a rate limit): a breadcrumb, not an
            // event.
            logger.warn("Stuck-state PegIn proof unavailable", {
              category: "activation",
              vaultId: shortId(id),
              cause: String(proof.cause),
            });
            return prior?.has(key) ? key : null;
          } catch (error) {
            // A malformed on-chain record proves nothing.
            reportRefusal(id, { error: String(error) });
            return null;
          }
        },
      );
      return new Set(proven.filter((id): id is string => id !== null));
    },
  });

  // Intersect with the live suspect set so a confirmation can never outlive the
  // suspicion that produced it (React Query retains data per key).
  const confirmed = query.data;
  return useMemo(() => {
    if (!confirmed || confirmed.size === 0 || suspectIds.length === 0) {
      return EMPTY_SET;
    }
    const current = new Set(suspectIds.map((id) => id.toLowerCase()));
    const gated = new Set<string>();
    for (const id of confirmed) {
      if (current.has(id)) gated.add(id);
    }
    return gated;
  }, [confirmed, suspectIds]);
}
