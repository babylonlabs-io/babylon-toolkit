/**
 * Vault Reclaim Service — thin adapter over the SDK's
 * `buildAndBroadcastReclaim`.
 *
 * Every peg-in reserves `depositorClaimValue` at PegIn vout 1 to fund the
 * depositor's own `claim_tx`. When the vault provider claims from its own
 * wallet instead and the depositor withdraws normally, nothing ever spends it.
 * This adapter sweeps it back once the vault has terminally settled.
 *
 * Protocol logic (fee math, PSBT build, the three-way script bind, signature
 * verification) lives in the SDK. This adapter resolves the vault's frozen
 * protocol parameters, observes the reserve on Bitcoin, and provides the
 * signing and broadcast transports.
 *
 * Eligibility is decided in `@/models/reclaimEligibility` and enforced by the
 * caller — read the warning there before changing when this is offered.
 */

import type { SignPsbtOptions } from "@babylonlabs-io/ts-sdk/shared";
import {
  computeMinClaimValue,
  getNetworkFees,
  pushTx,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  getOutspend,
  getTipHeight,
  getUtxoInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { PEGIN_DEPOSITOR_CLAIM_VOUT } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import {
  buildAndBroadcastReclaim,
  type ReclaimVaultData,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Hex } from "viem";

import { assertMinClaimValue } from "@/utils/wasm";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { getVaultFromChain } from "../../clients/eth-contract/btc-vault-registry/query";
import {
  getProtocolParamsReader,
  getUniversalChallengerReader,
  getVaultKeeperReader,
} from "../../clients/eth-contract/sdk-readers";
import {
  PEGIN_VAULT_VOUT,
  isPayoutSettled,
  toOutpointSpend,
  type OutpointSpend,
} from "../../models/reclaimEligibility";

/**
 * Thrown when the reserve turns out to be already spent — typically the
 * depositor reclaimed from another device or session. A pure BTC sweep emits
 * no Ethereum event, so this is detected by probing the outpoint, not from the
 * indexer.
 */
export class ReclaimAlreadySettledError extends Error {
  public readonly spendingTxid?: string;

  constructor(spendingTxid?: string) {
    super("Reclaim already settled: the depositor-claim reserve is spent.");
    this.name = "ReclaimAlreadySettledError";
    this.spendingTxid = spendingTxid;
  }
}

/**
 * Thrown when the Payout that made the reserve reclaimable is no longer settled
 * on Bitcoin by the time the depositor confirms — a reorg deep enough to unwind
 * six confirmations.
 *
 * Distinct from {@link ReclaimAlreadySettledError}, and deliberately so: that
 * one is a resolved outcome (the reserve is gone, nothing left to do), this one
 * is the opposite (the reserve is intact and must stay intact, because the
 * recourse graph it funds is live again).
 */
export class ReclaimNoLongerEligibleError extends Error {
  constructor() {
    super(
      "Reclaim no longer eligible: the vault's Payout is not settled on " +
        "Bitcoin at the required confirmation depth.",
    );
    this.name = "ReclaimNoLongerEligibleError";
  }
}

// bitcoind sendrawtransaction rejection codes meaning "this already happened",
// relayed verbatim by mempool.space. -27 = already in the UTXO set; -25 =
// missing or already-spent inputs. Same classifiers the refund path uses.
const ALREADY_IN_CHAIN_CODE_RE = /"code"\s*:\s*-27\b/;
const MISSING_OR_SPENT_INPUTS_CODE_RE = /"code"\s*:\s*-25\b/;

/** The vault's own PegIn txid plus the two outpoints the gate depends on. */
export interface ReclaimChainState {
  peginTxid: string;
  /** Spend status of the vault UTXO — the Payout signal. */
  payoutSpend: OutpointSpend;
  /** Spend status of the reserve itself. */
  reserveSpend: OutpointSpend;
  /** Current Bitcoin tip height. */
  tipHeight: number;
  /** The reserve's value, as observed on chain. */
  reserveValueSats: bigint;
}

/**
 * Derive a vault's PegIn txid from the contract's own copy of the
 * depositor-signed PegIn transaction.
 *
 * `vaultId` is a one-way hash of the txid, so it cannot be recovered from it.
 * This is the authoritative source and the only one that may feed a signed
 * transaction: the SegWit txid excludes witness data, so it equals the
 * broadcast PegIn's even though the vault provider adds its own witness. The
 * indexer's `peginTxHash` may drive display and polling, never this.
 */
export function derivePeginTxid(depositorSignedPeginTx: Hex): string {
  return stripHexPrefix(calculateBtcTxHash(depositorSignedPeginTx));
}

/**
 * Read everything on Bitcoin the eligibility gate needs for one vault.
 *
 * Both outpoints are probed: vout 0 decides whether the Payout has landed
 * (the gate), vout 1 whether the reserve is still there to sweep.
 *
 * The tip is read **before** the outspends, not alongside them. Issued
 * concurrently, a tip response from after a new block could be paired with a
 * payout response from before it, overstating the confirmation depth by a
 * block — the wrong direction for a gate that exists to keep a shallow Payout
 * out. Reading it first can only ever understate. `useReclaimStatus` orders its
 * reads the same way and for the same reason.
 */
export async function readReclaimChainState(
  vaultId: Hex,
): Promise<ReclaimChainState> {
  const onChainVault = await getVaultFromChain(vaultId);
  const peginTxid = derivePeginTxid(onChainVault.depositorSignedPeginTx);
  const apiUrl = getMempoolApiUrl();

  const tipHeight = await getTipHeight(apiUrl);

  const [payoutOutspend, reserveOutspend, reserveUtxo] = await Promise.all([
    getOutspend(peginTxid, PEGIN_VAULT_VOUT, apiUrl),
    getOutspend(peginTxid, PEGIN_DEPOSITOR_CLAIM_VOUT, apiUrl),
    getUtxoInfo(peginTxid, PEGIN_DEPOSITOR_CLAIM_VOUT, apiUrl),
  ]);

  return {
    peginTxid,
    payoutSpend: toOutpointSpend(payoutOutspend),
    reserveSpend: toOutpointSpend(reserveOutspend),
    tipHeight,
    reserveValueSats: BigInt(reserveUtxo.value),
  };
}

/**
 * Re-assert the chain-derived half of the reclaim gate against a fresh read.
 *
 * The row's eligibility is decided in the render path, off a poller with a
 * 60-second interval and a 55-second stale window, and the modal can sit open
 * for far longer than that. Both conditions this checks can change underneath
 * it: someone sweeps the reserve from another session, or — the one that
 * matters — a reorg unwinds the Payout and makes the depositor's recourse graph
 * necessary again. Signing then destroys the recovery material permanently, and
 * after a reorg that deep the vault provider's own graph is dead too, so the
 * depositor's was the remaining path.
 *
 * The wallet and UI conditions (ownership, Ledger, protocol pause, in-flight)
 * stay owned by the React layer, which is the only place that knows them.
 * Ownership in particular is re-proved far more strongly inside the SDK, which
 * re-derives the claim script from the connected wallet's live key.
 */
export function assertReclaimStillEligible(
  chainState: ReclaimChainState,
): void {
  if (chainState.reserveSpend.spent) {
    throw new ReclaimAlreadySettledError(undefined);
  }
  if (!isPayoutSettled(chainState.payoutSpend, chainState.tipHeight)) {
    throw new ReclaimNoLongerEligibleError();
  }
}

/**
 * Recompute this vault's reserve value from the protocol parameters frozen at
 * its registration — not the currently active ones. Bound against the
 * observed UTXO inside the SDK builder.
 */
async function readExpectedClaimValue(vaultId: Hex): Promise<bigint> {
  const onChainVault = await getVaultFromChain(vaultId);

  const [protocolReader, keeperReader, challengerReader] = await Promise.all([
    getProtocolParamsReader(),
    getVaultKeeperReader(),
    getUniversalChallengerReader(),
  ]);

  const [offchainParams, vaultKeepers, universalChallengers] =
    await Promise.all([
      protocolReader.getOffchainParamsByVersion(
        onChainVault.offchainParamsVersion,
      ),
      keeperReader.getVaultKeepersByVersion(
        onChainVault.applicationEntryPoint,
        onChainVault.appVaultKeepersVersion,
      ),
      challengerReader.getUniversalChallengersByVersion(
        onChainVault.universalChallengersVersion,
      ),
    ]);

  if (vaultKeepers.length === 0) {
    throw new Error(
      `No vault keepers found for version ${onChainVault.appVaultKeepersVersion}; ` +
        `cannot recompute the depositor-claim value.`,
    );
  }
  if (universalChallengers.length === 0) {
    throw new Error(
      `No universal challengers found for version ${onChainVault.universalChallengersVersion}; ` +
        `cannot recompute the depositor-claim value.`,
    );
  }

  const value = await computeMinClaimValue(
    onChainVault.vaultCoreVersion,
    vaultKeepers.length,
    universalChallengers.length,
    offchainParams.councilQuorum,
    offchainParams.securityCouncilKeys.length,
    offchainParams.feeRate,
  );
  return assertMinClaimValue(value);
}

export interface ReclaimPreview {
  /** Gross reserve value before the network fee. */
  reclaimableSats: bigint;
  /** Mempool half-hour rate, or null when the fetch failed. */
  halfHourFeeSatsVb: number | null;
  peginTxid: string;
}

/**
 * Data for the review screen. A failed fee fetch is surfaced as null rather
 * than defaulted — the review screen blocks on it until the depositor sets a
 * rate explicitly.
 */
export async function getReclaimPreview(vaultId: Hex): Promise<ReclaimPreview> {
  const [chainState, fees] = await Promise.all([
    readReclaimChainState(vaultId),
    getNetworkFees(getMempoolApiUrl()).catch(() => null),
  ]);

  // Same gate the row was rendered from, re-asserted against this read, so a
  // vault that stopped being eligible while the list sat idle never gets as far
  // as showing the depositor an amount.
  assertReclaimStillEligible(chainState);

  return {
    reclaimableSats: chainState.reserveValueSats,
    halfHourFeeSatsVb: fees?.halfHourFee ?? null,
    peginTxid: chainState.peginTxid,
  };
}

export interface BroadcastReclaimParams {
  vaultId: Hex;
  /**
   * The connected wallet's live BTC pubkey. Never the indexer's copy — the
   * SDK re-derives the claim script from this to prove the wallet about to
   * sign is the wallet that can spend.
   */
  depositorBtcPubkey: string;
  feeRate: number;
  signPsbt: (psbtHex: string, opts: SignPsbtOptions) => Promise<string>;
  signal?: AbortSignal;
}

/**
 * Build, sign, and broadcast a reclaim sweeping one vault's reserve.
 *
 * @returns the broadcast transaction id
 * @throws {@link ReclaimAlreadySettledError} if the reserve is already spent
 * @throws {@link ReclaimNoLongerEligibleError} if the Payout is no longer
 *   settled deeply enough for the sweep to be safe
 */
export async function buildAndBroadcastReclaimTransaction(
  params: BroadcastReclaimParams,
): Promise<string> {
  const { vaultId, depositorBtcPubkey, feeRate, signPsbt, signal } = params;

  // Re-probe before doing any work. The modal may have been open a while, and
  // both halves of the gate matter: an already-spent reserve is a guaranteed
  // broadcast failure after a pointless wallet prompt, and an unsettled Payout
  // means signing would destroy live recovery material.
  const chainState = await readReclaimChainState(vaultId);
  assertReclaimStillEligible(chainState);

  const expectedClaimValue = await readExpectedClaimValue(vaultId);
  const onChainVault = await getVaultFromChain(vaultId);
  const apiUrl = getMempoolApiUrl();
  const reserveUtxo = await getUtxoInfo(
    chainState.peginTxid,
    PEGIN_DEPOSITOR_CLAIM_VOUT,
    apiUrl,
  );

  const readVaults = async (): Promise<ReclaimVaultData[]> => [
    {
      depositorSignedPeginTxHex: onChainVault.depositorSignedPeginTx,
      observed: {
        // The outpoint this observation was taken from. The SDK binds it to
        // the PegIn it builds the input from — the script and value are
        // identical across every vault this depositor owns, so they cannot.
        txid: chainState.peginTxid,
        vout: PEGIN_DEPOSITOR_CLAIM_VOUT,
        scriptPubKey: reserveUtxo.scriptPubKey,
        value: BigInt(reserveUtxo.value),
      },
      expectedClaimValue,
    },
  ];

  // …and again at the signing boundary itself. Everything between the check
  // above and this point is preparation — recomputing the reserve value from
  // frozen parameters, re-reading the vault, the UTXO probe, then the SDK's own
  // fee caps, PSBT build and vault-id derivation (which initialises WASM on a
  // cold load). That is seconds, not milliseconds, and this is a safety control
  // on an irreversible spend: the only reading that means anything is the one
  // taken immediately before the wallet is asked to sign. The extra probe costs
  // one round trip on an action a depositor performs once per vault.
  const gatedSignPsbt: typeof signPsbt = async (psbtHex, opts) => {
    signal?.throwIfAborted();
    assertReclaimStillEligible(await readReclaimChainState(vaultId));
    return signPsbt(psbtHex, opts);
  };

  try {
    const { txId } = await buildAndBroadcastReclaim({
      vaultIds: [vaultId],
      depositorEthAddress: onChainVault.depositor,
      depositorBtcPubkey,
      readVaults,
      feeRate,
      signPsbt: gatedSignPsbt,
      broadcastTx: async (signedTxHex: string) => ({
        txId: await pushTx(signedTxHex, apiUrl),
      }),
      signal,
    });
    return txId;
  } catch (error) {
    // A concurrent sweep from another device lands here rather than at the
    // pre-probe above. Both rejection codes mean the same thing for us: the
    // reserve is gone, and the depositor's money is where they wanted it.
    if (error instanceof Error) {
      if (
        ALREADY_IN_CHAIN_CODE_RE.test(error.message) ||
        MISSING_OR_SPENT_INPUTS_CODE_RE.test(error.message)
      ) {
        throw new ReclaimAlreadySettledError(undefined);
      }
    }
    throw error;
  }
}
