/**
 * Redeem an expired BTCVault whose HTLC the PegIn spent — the submission half
 * of the redeem modal (`ClaimExpiredVaultModal` derives the secret).
 *
 * Every input the decision rests on is re-read immediately before the secret
 * is used, because the dashboard's view of it can be a poll interval old:
 *
 * 1. the on-chain status (Expired), `verifiedAt` and hashlock, plus a fresh
 *    pause read — never the indexer's;
 * 2. the chain head against the vault's frozen `claimExpiredUntil`;
 * 3. a fresh Bitcoin probe that the PegIn — identified from the on-chain
 *    signed PegIn, not the indexer — is what spent the HTLC. This is the one
 *    check that protects value: revealing the secret while the HTLC is
 *    unspent lets anyone broadcast the PegIn ahead of the depositor's own
 *    refund. It fails closed;
 * 4. `sha256(secret) === hashlock` against the on-chain hashlock, which the
 *    SDK checks once more before calldata exists.
 *
 * An unreadable head does not block: the registry enforces the window, and
 * `executeWrite`'s simulation refuses a redeem past the cutoff without a
 * transaction. A redeem simulated before the cutoff but mined after it still
 * reverts — one sent on the cutoff block itself, or one signed in the wallet's
 * confirmation prompt across it — a gas cost, accepted over withholding the
 * only exit on a failed read. A readable head at the cutoff is refused here,
 * on the click and again just before the write.
 */

import { ensureHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { validateSecretAgainstHashlock } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { getSharedWagmiConfig } from "@babylonlabs-io/wallet-connector";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Hex, zeroHash } from "viem";
import { getWalletClient, switchChain } from "wagmi/actions";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { fetchHtlcSpend, isHtlcSpentByPegin } from "@/clients/btc/outspend";
import { ethClient } from "@/clients/eth-contract/client";
import { getOnChainPauseState } from "@/clients/eth-contract/pause-state/query";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import {
  composeGateState,
  isActivateAndRedeemBlocked,
} from "@/components/shared/protocolStatus";
import { getETHChain } from "@/config/network";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";
import { COPY } from "@/copy";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { logger } from "@/infrastructure";
import {
  captureFunnelFailure,
  shortId,
  TELEMETRY_EVENT,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import { getNextLocalStatus, PeginAction } from "@/models/peginStateMachine";
import { ACTIVITIES_QUERY_KEY } from "@/services/activity";
import { claimExpiredVaultWithSecret } from "@/services/vault/vaultActivationService";
import type { VaultActivity } from "@/types/activity";
import { isVaultRecordEmptyError } from "@/utils/errors";
import { invalidateVaultQueries } from "@/utils/queryKeys";

/**
 * A refusal no retry can change — the vault's on-chain state rules the redeem
 * out. The modal disables its confirm button for these.
 */
class ClaimExpiredNotPossibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimExpiredNotPossibleError";
  }
}

export interface UseClaimExpiredVaultProps {
  activity: VaultActivity;
  depositorEthAddress: string;
}

export interface UseClaimExpiredVaultResult {
  /** Pre-checks or the redeem transaction in flight. */
  claiming: boolean;
  /** The redeem transaction confirmed. */
  claimed: boolean;
  error: string | null;
  /** The vault's on-chain state rules the redeem out — no Retry. */
  errorTerminal: boolean;
  handleClaim: (secretHex: string) => Promise<void>;
}

export function useClaimExpiredVault({
  activity,
  depositorEthAddress,
}: UseClaimExpiredVaultProps): UseClaimExpiredVaultResult {
  const gate = useProtocolGateState();
  const { setOptimisticStatus } = usePeginPolling();
  const queryClient = useQueryClient();

  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTerminal, setErrorTerminal] = useState(false);

  // The redeem awaits an on-chain transaction, so the modal can close before
  // it settles; the setters below must not fire on an unmounted tree.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleClaim = useCallback(
    async (secretHex: string) => {
      const vaultId = ensureHexPrefix(activity.id) as Hex;

      // Same governance gate as activate-and-redeem: only a protocol-scope
      // pause blocks `claimExpiredVault`. Surfaced as an error so the caller's
      // spinner clears; the fresh read below closes the stale-gate window.
      if (isActivateAndRedeemBlocked(gate)) {
        setError(COPY.pegin.claimExpiredPaused);
        setErrorTerminal(false);
        return;
      }

      setClaiming(true);
      setError(null);
      setErrorTerminal(false);

      // Telemetry discriminators for the catch below, as in the activation
      // flow: routine pre-submission refusals are not redeem failures, and
      // nothing thrown after the transaction confirmed is one either.
      let expectedInterruption = false;
      let submitted = false;

      try {
        const reader = getVaultRegistryReader();
        const [{ basic, protocol }, freshPauseState, head] = await Promise.all([
          reader.getVaultData(vaultId),
          // A failed pause read falls back to the cached gate: this is an
          // exit, and exits fail open on a read failure.
          getOnChainPauseState().catch(() => null),
          // A failed head read leaves the window to the registry (see the
          // module comment).
          ethClient
            .getPublicClient()
            .getBlockNumber({ cacheTime: 0 })
            .catch(() => null),
        ]);

        const effectiveGate = freshPauseState
          ? composeGateState(freshPauseState)
          : gate;
        if (isActivateAndRedeemBlocked(effectiveGate)) {
          expectedInterruption = true;
          throw new Error(COPY.pegin.claimExpiredPaused);
        }

        const errors = COPY.deposit.claimExpired.errors;
        if (!protocol.hashlock || protocol.hashlock === zeroHash) {
          throw new ClaimExpiredNotPossibleError(errors.hashlockMissing);
        }
        // Compare against `OnChainBtcVaultStatus`, never the app-side
        // `ContractStatus`, which reassigns the contract's Expired value.
        if (basic.status === OnChainBtcVaultStatus.REDEEMED) {
          // The redeem already landed (from another device, or a third party
          // — the call is permissionless). Not a failure.
          expectedInterruption = true;
          throw new ClaimExpiredNotPossibleError(errors.alreadyRedeemed);
        }
        if (basic.status !== OnChainBtcVaultStatus.EXPIRED) {
          throw new ClaimExpiredNotPossibleError(errors.notRedeemable);
        }
        if (protocol.verifiedAt === 0n) {
          throw new ClaimExpiredNotPossibleError(errors.notVerified);
        }
        // A redeem is mined after the head, so head == claimExpiredUntil is
        // already too late: the simulation (run at the head) would pass and
        // the mined transaction revert. See `classifyClaimExpiredWindow`.
        if (head !== null && head >= protocol.claimExpiredUntil) {
          expectedInterruption = true;
          throw new ClaimExpiredNotPossibleError(errors.windowClosed);
        }

        // The value check. The outpoint and the PegIn txid both come from the
        // chain, so a wrong indexer record cannot steer the probe.
        const spend = await fetchHtlcSpend(
          protocol.prePeginTxHash,
          protocol.htlcVout,
          getMempoolApiUrl(),
        ).catch((cause: unknown) => {
          throw new Error(errors.spendUnavailable, { cause });
        });
        // Refused in every case below, but only a confirmed spend by a known
        // other transaction is final. An unspent HTLC may yet be swept by a
        // PegIn the mempool has not shown us, an unconfirmed competing spend
        // can still lose to the PegIn, and a spend with no reported txid
        // cannot be attributed — all stay retryable.
        if (!spend.spent) {
          throw new Error(errors.notSpentByPegin);
        }
        const peginTxid = calculateBtcTxHash(protocol.depositorSignedPeginTx);
        if (!isHtlcSpentByPegin(spend, peginTxid)) {
          if (!spend.spendingTxid) throw new Error(errors.spenderUnknown);
          if (!spend.confirmed) {
            throw new Error(errors.spentByOtherUnconfirmed);
          }
          throw new ClaimExpiredNotPossibleError(errors.spentByOther);
        }

        if (
          !validateSecretAgainstHashlock(
            ensureHexPrefix(secretHex),
            ensureHexPrefix(protocol.hashlock),
          )
        ) {
          throw new Error(errors.secretMismatch);
        }

        const chain = getETHChain();
        const wagmiConfig = getSharedWagmiConfig();
        await switchChain(wagmiConfig, { chainId: chain.id });
        const walletClient = await getWalletClient(wagmiConfig, {
          account: depositorEthAddress as Hex,
        });

        // The chain switch and the wallet client can hold the depositor in
        // prompts, so the window is checked once more on a fresh head as the
        // last step before the write, as activation does. The signing prompt
        // inside `executeWrite` comes after this check: a redeem signed across
        // the cutoff still reverts. A failed read leaves the window to the
        // registry.
        const headBeforeWrite = await ethClient
          .getPublicClient()
          .getBlockNumber({ cacheTime: 0 })
          .catch(() => null);
        if (
          headBeforeWrite !== null &&
          headBeforeWrite >= protocol.claimExpiredUntil
        ) {
          expectedInterruption = true;
          throw new ClaimExpiredNotPossibleError(errors.windowClosed);
        }

        await claimExpiredVaultWithSecret({
          vaultId,
          secret: ensureHexPrefix(secretHex) as Hex,
          hashlock: ensureHexPrefix(protocol.hashlock) as Hex,
          walletClient,
        });
        submitted = true;

        logger.event(TELEMETRY_EVENT.EXPIRED_VAULT_REDEEMED, {
          level: "info",
          category: "activation",
          tags: { vaultId: shortId(vaultId) },
        });

        // The optimistic status hides the redeem until the indexer reports
        // REDEEMED. Written even if the modal closed: the receipt confirmed.
        const nextStatus = getNextLocalStatus(PeginAction.CLAIM_EXPIRED_VAULT);
        if (nextStatus) setOptimisticStatus(activity.id, nextStatus);
        void invalidateVaultQueries(queryClient);
        void queryClient.invalidateQueries({
          queryKey: [ACTIVITIES_QUERY_KEY],
        });

        if (mountedRef.current) {
          setClaimed(true);
          setClaiming(false);
        }
      } catch (err) {
        // Captured regardless of mount — there is no abort signal, and a real
        // failure is worth knowing even if the modal closed mid-flight.
        if (!expectedInterruption && !submitted) {
          captureFunnelFailure(
            TELEMETRY_STAGE.EXPIRED_VAULT_REDEEM,
            err,
            activity.id,
          );
        }
        if (mountedRef.current) {
          const rawMessage =
            err instanceof Error
              ? err.message
              : COPY.deposit.claimExpired.errors.claimFailed;
          setError(
            isVaultRecordEmptyError(err)
              ? COPY.deposit.claimExpired.errors.vaultRecordUnavailable
              : rawMessage,
          );
          setErrorTerminal(err instanceof ClaimExpiredNotPossibleError);
          setClaiming(false);
        }
      }
    },
    [activity.id, depositorEthAddress, gate, queryClient, setOptimisticStatus],
  );

  return { claiming, claimed, error, errorTerminal, handleClaim };
}
