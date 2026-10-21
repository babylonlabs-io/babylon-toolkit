/**
 * The CLI's own on-chain view of the depositor's position capacity: the reads the app's capacity check
 * makes (the registry's `getDepositorVaultIds`, each vault's basic info, the application's
 * `allowedToDeposit`), taken independently so a run can say what the app should have asked, and check on
 * chain what a refused deposit left behind.
 *
 * The rule mirrored here is the app's `services/vault/positionCapacity.ts` (the e2e layer does not
 * import from `src/`, see borrowParams.ts): in flight = the depositor's Pending and Verified vaults in the
 * same application, minus the deposit's own vaults; before a broadcast, a Pending vault the registry
 * lists after the deposit's own is left out too when the mempool API answers "not found" for its
 * Pre-PegIn. KEEP IN SYNC.
 */
import { ViemVaultRegistryReader } from "@babylonlabs-io/ts-sdk/tbv/core";
import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Address, Hex } from "viem";

import {
  ALLOWED_TO_DEPOSIT_ABI,
  GET_DEPOSITOR_VAULT_IDS_ABI,
} from "./actions/positionCapacityRpcAnswers";
import { NETWORKS, type NetworkName } from "./config";
import { createEthClient, resolveNetworkContracts } from "./networkContracts";

/** HTTP status the mempool API answers for a transaction it has never seen. */
const HTTP_NOT_FOUND = 404;

/** The depositor's other registered, not yet activated vaults in the application. */
export interface InFlightOccupancy {
  count: number;
  sats: bigint;
}

export interface CapacitySnapshot {
  /** Every vault id the registry lists for the depositor, lowercased. */
  depositorVaultIds: readonly Hex[];
  inFlight: InFlightOccupancy;
  /** The chain's own answer to the question a deposit of `batch` would ask now. */
  allowed: boolean;
}

/** Which of the app's checks to mirror. */
export interface CapacityMirror {
  stage: "registration" | "broadcast";
  /**
   * The deposit's own registered vaults, lowercased: counted as the deposit, never as in flight. At
   * `broadcast` a Pending vault listed after the first of them is left out as well, unless its
   * Pre-PegIn may be on Bitcoin.
   */
  ownVaultIds: readonly Hex[];
}

/** Every vault id the registry lists for the depositor, lowercased, in registration order. */
export async function readDepositorVaultIds(
  network: NetworkName,
  depositor: string,
): Promise<Hex[]> {
  const { registry, ethRpcUrl } = resolveNetworkContracts(network);
  const listed = (await createEthClient(ethRpcUrl).readContract({
    address: registry,
    abi: GET_DEPOSITOR_VAULT_IDS_ABI,
    functionName: "getDepositorVaultIds",
    args: [depositor as Address],
  })) as readonly Hex[];
  return listed.map((id) => id.toLowerCase() as Hex);
}

/** The in-flight vaults among `listed` (the depositor's vault ids, in order) that `mirror`'s check counts. */
export async function readInFlight(
  network: NetworkName,
  listed: readonly Hex[],
  mirror: CapacityMirror,
): Promise<InFlightOccupancy> {
  const { registry, appController, ethRpcUrl } =
    resolveNetworkContracts(network);
  const reader = new ViemVaultRegistryReader(
    createEthClient(ethRpcUrl),
    registry,
  );
  const own = new Set(mirror.ownVaultIds);
  const firstOwnIndex = listed.findIndex((id) => own.has(id));
  const registeredLater = new Set(
    mirror.stage === "broadcast" && firstOwnIndex !== -1
      ? listed.slice(firstOwnIndex + 1)
      : [],
  );
  const others = listed.filter((id) => !own.has(id));

  const infos = await Promise.all(
    others.map((id) => reader.getVaultBasicInfo(id)),
  );
  const inFlight: InFlightOccupancy = { count: 0, sats: 0n };
  for (const [index, info] of infos.entries()) {
    if (
      info.applicationEntryPoint.toLowerCase() !== appController.toLowerCase()
    )
      continue;
    const counted =
      info.status === OnChainBtcVaultStatus.VERIFIED ||
      (info.status === OnChainBtcVaultStatus.PENDING &&
        (!registeredLater.has(others[index]) ||
          (await mayBeOnBitcoin(network, reader, others[index]))));
    if (counted) {
      inFlight.count += 1;
      inFlight.sats += info.amount;
    }
  }
  return inFlight;
}

/**
 * Whether a later-registered Pending vault's Pre-PegIn may be on Bitcoin, which is what makes the app
 * count it: anything but the mempool API's explicit "not found", a failed lookup included.
 */
async function mayBeOnBitcoin(
  network: NetworkName,
  reader: ViemVaultRegistryReader,
  vaultId: Hex,
): Promise<boolean> {
  const [{ prePeginTxHash }] = await reader.getProtocolInfoBatch([vaultId]);
  return isTxKnownToMempool(network, prePeginTxHash).catch(() => true);
}

/**
 * Read the depositor's capacity as the app would before registering a deposit of `batch` (`count`
 * vaults, `sats` in total).
 */
export async function readCapacitySnapshot(
  network: NetworkName,
  depositor: string,
  batch: { count: number; sats: bigint },
): Promise<CapacitySnapshot> {
  const { appController, ethRpcUrl } = resolveNetworkContracts(network);
  const client = createEthClient(ethRpcUrl);
  const depositorVaultIds = await readDepositorVaultIds(network, depositor);
  const inFlight = await readInFlight(network, depositorVaultIds, {
    stage: "registration",
    ownVaultIds: [],
  });

  const allowed = (await client.readContract({
    address: appController as Address,
    abi: ALLOWED_TO_DEPOSIT_ABI,
    functionName: "allowedToDeposit",
    args: [
      depositor as Address,
      BigInt(batch.count + inFlight.count),
      batch.sats + inFlight.sats,
    ],
  })) as boolean;

  return { depositorVaultIds, inFlight, allowed };
}

/** A registered vault's on-chain record, for checking what a refused deposit left behind. */
export interface RegistryVaultRecord {
  vaultId: Hex;
  status: number;
  depositor: string;
  applicationEntryPoint: string;
  amount: bigint;
  prePeginTxHash: Hex;
}

export async function readRegisteredVaults(
  network: NetworkName,
  vaultIds: readonly Hex[],
): Promise<RegistryVaultRecord[]> {
  const { registry, ethRpcUrl } = resolveNetworkContracts(network);
  const reader = new ViemVaultRegistryReader(
    createEthClient(ethRpcUrl),
    registry,
  );
  return Promise.all(
    vaultIds.map(async (vaultId) => {
      const { basic, protocol } = await reader.getVaultData(vaultId);
      return {
        vaultId,
        status: basic.status,
        depositor: basic.depositor,
        applicationEntryPoint: basic.applicationEntryPoint,
        amount: basic.amount,
        prePeginTxHash: protocol.prePeginTxHash,
      };
    }),
  );
}

/** The account's transaction count including pending ones: unchanged means it sent nothing. */
export async function readPendingNonce(
  network: NetworkName,
  account: string,
): Promise<number> {
  const { ethRpcUrl } = resolveNetworkContracts(network);
  return createEthClient(ethRpcUrl).getTransactionCount({
    address: account as Address,
    blockTag: "pending",
  });
}

export async function readBlockNumber(network: NetworkName): Promise<bigint> {
  const { ethRpcUrl } = resolveNetworkContracts(network);
  return createEthClient(ethRpcUrl).getBlockNumber();
}

/**
 * Whether the mempool API knows a Bitcoin transaction: `false` only on its explicit "not found", so an
 * outage reads as an error rather than as "never broadcast".
 */
export async function isTxKnownToMempool(
  network: NetworkName,
  txid: string,
): Promise<boolean> {
  const id = txid.replace(/^0x/, "");
  const response = await fetch(`${NETWORKS[network].mempoolApiBase}/tx/${id}`);
  if (response.ok) return true;
  if (response.status === HTTP_NOT_FOUND) return false;
  throw new Error(
    `The mempool API answered ${response.status} for transaction ${id}, so whether it was broadcast is unknown.`,
  );
}
