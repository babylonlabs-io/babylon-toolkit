/**
 * BTCVaultRegistry On-Chain Query Client
 *
 * Thin app-side wrappers around the SDK's `ViemVaultRegistryReader` that
 * preserve vault's existing flat / 0x-prefixed result shapes for callers.
 * The actual contract reads, validations, and multicalls live in the SDK.
 */

import { assertValidVaultCoreVersion } from "@babylonlabs-io/ts-sdk/tbv/core";
import type { KeyEpochs } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { type Address, type Hex, zeroAddress } from "viem";

import { isVaultRecordEmptyError } from "@/utils/errors";

import { getVaultRegistryReader } from "../sdk-readers";

/**
 * Signing-critical fields read directly from the BTCVaultRegistry contract.
 * Flat shape merged from the SDK's `{basic, protocol}` payload.
 */
export interface OnChainVaultData {
  /** Depositor's Ethereum address — the authoritative owner of this vault. */
  depositor: Address;
  depositorSignedPeginTx: Hex;
  applicationEntryPoint: Address;
  vaultProvider: Address;
  universalChallengersVersion: number;
  appVaultKeepersVersion: number;
  /** Offchain params version locked at vault creation — use for timelockPegin lookup */
  offchainParamsVersion: number;
  /**
   * Vault core (tx-graph) version stamped at registration (uint16 ≥ 1).
   * Resume flows (payout signing, refund) must rebuild scripts under this
   * version, not the contract's current `activeVaultCoreVersion`.
   */
  vaultCoreVersion: number;
  /** SHA-256 hash commitment for the HTLC (bytes32, 0x-prefixed) */
  hashlock: Hex;
  /** Index of the HTLC output in the Pre-PegIn transaction */
  htlcVout: number;
  /** Vault deposit amount in satoshis */
  amount: bigint;
  /** Hash of the Pre-PegIn transaction (bytes32, 0x-prefixed) */
  prePeginTxHash: Hex;
  /**
   * VP commission in basis points (`1..=9999`) locked at vault creation.
   * Required by `buildPayoutPsbt` to cap the VP-claimer commission output.
   */
  vaultProviderCommissionBps: number;
  /**
   * Live `BTCVaultStatus` enum value from `basic.status`. Compare against
   * `OnChainBtcVaultStatus`, not the app-side `ContractStatus` — the
   * indexer enum reassigns the contract's Expired(4) to LIQUIDATED and
   * would mislabel a chain read.
   */
  status: number;
  /**
   * Ethereum **block number** the registration was mined at (not a timestamp
   * — the contract compares it against `block.number`). Feeds the activation
   * deadline check and the Pre-PegIn broadcast finality gate, which measures
   * confirmation depth as `tip - createdAt + 1`.
   */
  createdAt: bigint;
}

/**
 * Read signing-critical vault fields from the BTCVaultRegistry contract.
 *
 * @param vaultId - Vault ID: keccak256(abi.encode(peginTxHash, depositor)), bytes32
 * @throws if the vault does not exist on-chain (empty depositorSignedPeginTx).
 */
export async function getVaultFromChain(
  vaultId: Hex,
): Promise<OnChainVaultData> {
  const { basic, protocol } =
    await getVaultRegistryReader().getVaultData(vaultId);

  // Fail closed on 0: it means the vault predates the contract's
  // vaultCoreVersion field (or the read was mis-decoded) — vaultd rejects
  // core version 0 too, so guessing a graph version here would only defer
  // the failure to after wallet popups.
  assertValidVaultCoreVersion(
    Number(protocol.vaultCoreVersion),
    `BTCVaultRegistry.getBtcVaultProtocolInfo(${vaultId})`,
  );

  return {
    depositor: basic.depositor,
    depositorSignedPeginTx: protocol.depositorSignedPeginTx,
    applicationEntryPoint: basic.applicationEntryPoint,
    vaultProvider: basic.vaultProvider,
    universalChallengersVersion: Number(protocol.universalChallengersVersion),
    appVaultKeepersVersion: Number(protocol.appVaultKeepersVersion),
    offchainParamsVersion: Number(protocol.offchainParamsVersion),
    vaultCoreVersion: Number(protocol.vaultCoreVersion),
    hashlock: protocol.hashlock,
    htlcVout: Number(protocol.htlcVout),
    amount: basic.amount,
    prePeginTxHash: protocol.prePeginTxHash,
    vaultProviderCommissionBps: Number(protocol.vaultProviderCommissionBps),
    status: basic.status,
    createdAt: basic.createdAt,
  };
}

/**
 * Backoff schedule (ms) for {@link getVaultFromChainWithGrace}. Totals ~15s,
 * long enough to outlast normal RPC index lag while staying inside a user's
 * patience for a button press.
 */
const EMPTY_RECORD_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];

/**
 * {@link getVaultFromChain} that tolerates a transiently empty record.
 *
 * A vault registered moments ago can read back empty from a load-balanced RPC
 * node that has not indexed the registration's block yet — the node answers
 * HTTP 200 with a zero struct, so viem's transport retry cannot see it. This
 * is the read-after-write race behind #1835.
 *
 * Retries **only** the empty-record case; every other error (revert, network,
 * bad core version) propagates on the first attempt, because retrying those
 * would just delay a real failure. If the record is still empty after the
 * schedule, the reader's error is rethrown and callers map it to
 * "still confirming" copy rather than "not found".
 */
export async function getVaultFromChainWithGrace(
  vaultId: Hex,
  signal?: AbortSignal,
): Promise<OnChainVaultData> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getVaultFromChain(vaultId);
    } catch (err) {
      if (
        !isVaultRecordEmptyError(err) ||
        attempt >= EMPTY_RECORD_RETRY_DELAYS_MS.length
      ) {
        throw err;
      }
      await waitOrAbort(EMPTY_RECORD_RETRY_DELAYS_MS[attempt], signal);
    }
  }
}

/** Sleep that rejects with the caller's abort reason instead of resolving. */
function waitOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Read a vault's frozen RFC-006 operation-key epochs.
 *
 * Deliberately a **separate** read from {@link getVaultFromChain} rather than
 * three more fields on `OnChainVaultData`. It goes through the extended
 * `getBtcVaultProtocolInfo` ABI, and `getVaultFromChain` is on the status,
 * resume, refund and payout paths — folding the epochs into it would make all
 * of those depend on the registry having been upgraded. See
 * `BTCVaultRegistryKeyEpochs.abi.ts`.
 *
 * Only valid against an RFC-006 registry: on an older one it returns plausible
 * garbage rather than throwing.
 */
export async function getVaultKeyEpochsFromChain(
  vaultId: Hex,
): Promise<KeyEpochs> {
  return getVaultRegistryReader().getVaultKeyEpochs(vaultId);
}

/**
 * Read a vault provider's *genesis* (registration) BTC public key from
 * BTCVaultRegistry, returning a 0x-prefixed `Hex` string for compatibility with
 * existing callers (the SDK reader returns the 64-char lowercase form without
 * the prefix; this wrapper re-attaches `0x`).
 *
 * This is the key that seeds epoch-based resolution, never the key to sign or
 * build with — see `getVaultProviderGenesisBtcPubKey` in the SDK.
 */
export async function getVaultProviderGenesisBtcPubkeyFromChain(
  vaultProvider: Address,
): Promise<Hex> {
  const xOnly =
    await getVaultRegistryReader().getVaultProviderGenesisBtcPubKey(
      vaultProvider,
    );
  return `0x${xOnly}` as Hex;
}

/**
 * Read the protocol pegin fee (in wei) for a given vault provider.
 *
 * Mirrors the same on-chain read that `PeginManager.preparePegin` uses
 * before submitting `submitPeginRequest`. Surfaced here so the deposit
 * form can display the fee before signing.
 */
export async function getPegInFeeFromChain(
  vaultProvider: Address,
): Promise<bigint> {
  return getVaultRegistryReader().getPegInFee(vaultProvider);
}

/**
 * Signing-critical subset of `getBtcVaultBasicInfo` used by the reorder
 * integrity guard. Returned by `getBtcVaultBasicInfoFromChain` in a map
 * keyed by lowercased vault ID.
 */
export interface OnChainVaultBasicInfo {
  /** Vault deposit amount in satoshis. */
  amount: bigint;
  /** Numeric `BTCVaultStatus` (see `ContractStatus`). 2 = ACTIVE. */
  status: number;
  /** Application controller bound at vault creation. */
  applicationEntryPoint: Address;
}

/**
 * Read per-vault signing-critical fields for many vaults in parallel
 * via the SDK's strongly-typed `ViemVaultRegistryReader.getVaultBasicInfo`.
 *
 * Returned map keys are lowercased vault IDs (case-insensitive lookup);
 * the same key form is used by the reorder integrity guard so the caller
 * does not need to worry about checksum casing.
 *
 * Delegates to the SDK's typed reader rather than running its own
 * multicall+cast — the strongly-typed path catches ABI shape
 * regressions at compile time instead of through a late `TypeError` in
 * a downstream consumer.
 *
 * @throws if any input vault is unregistered on-chain (`depositor` is the
 * zero address). The reorder guard treats an unregistered vault as
 * untrusted membership and refuses to sign.
 */
export async function getBtcVaultBasicInfoFromChain(
  vaultIds: readonly Hex[],
): Promise<Map<Hex, OnChainVaultBasicInfo>> {
  if (vaultIds.length === 0) return new Map();

  const reader = getVaultRegistryReader();
  const results = await Promise.all(
    vaultIds.map((vaultId) => reader.getVaultBasicInfo(vaultId)),
  );

  const out = new Map<Hex, OnChainVaultBasicInfo>();
  results.forEach((info, i) => {
    if (info.depositor === zeroAddress) {
      throw new Error(
        `Vault ${vaultIds[i]} not registered on-chain — refusing to recompute reorder against unverified basic info`,
      );
    }
    out.set(vaultIds[i].toLowerCase() as Hex, {
      amount: info.amount,
      status: info.status,
      applicationEntryPoint: info.applicationEntryPoint,
    });
  });
  return out;
}
