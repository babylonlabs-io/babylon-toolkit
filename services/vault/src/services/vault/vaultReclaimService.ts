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

function toOutpointSpend(res: {
  spent?: boolean;
  txid?: string;
  status?: { confirmed?: boolean; block_height?: number };
}): OutpointSpend {
  return {
    spent: res.spent === true,
    confirmed: res.spent === true && res.status?.confirmed === true,
    blockHeight: res.status?.block_height,
  };
}

/**
 * Read everything on Bitcoin the eligibility gate needs for one vault.
 *
 * Both outpoints are probed: vout 0 decides whether the Payout has landed
 * (the gate), vout 1 whether the reserve is still there to sweep.
 */
export async function readReclaimChainState(
  vaultId: Hex,
): Promise<ReclaimChainState> {
  const onChainVault = await getVaultFromChain(vaultId);
  const peginTxid = derivePeginTxid(onChainVault.depositorSignedPeginTx);
  const apiUrl = getMempoolApiUrl();

  const [payoutOutspend, reserveOutspend, tipHeight, reserveUtxo] =
    await Promise.all([
      getOutspend(peginTxid, PEGIN_VAULT_VOUT, apiUrl),
      getOutspend(peginTxid, PEGIN_DEPOSITOR_CLAIM_VOUT, apiUrl),
      getTipHeight(apiUrl),
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

  if (chainState.reserveSpend.spent) {
    throw new ReclaimAlreadySettledError(undefined);
  }

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
 */
export async function buildAndBroadcastReclaimTransaction(
  params: BroadcastReclaimParams,
): Promise<string> {
  const { vaultId, depositorBtcPubkey, feeRate, signPsbt, signal } = params;

  // Re-probe immediately before signing: the modal may have been open a while,
  // and sweeping an already-spent reserve is a guaranteed broadcast failure
  // after a pointless wallet prompt.
  const chainState = await readReclaimChainState(vaultId);
  if (chainState.reserveSpend.spent) {
    throw new ReclaimAlreadySettledError(undefined);
  }

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
        scriptPubKey: reserveUtxo.scriptPubKey,
        value: BigInt(reserveUtxo.value),
      },
      expectedClaimValue,
    },
  ];

  try {
    const { txId } = await buildAndBroadcastReclaim({
      vaultIds: [vaultId],
      depositorBtcPubkey,
      readVaults,
      feeRate,
      signPsbt,
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
