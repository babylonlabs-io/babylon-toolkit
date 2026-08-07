/**
 * Concrete RFC-006 operation-key reader spanning all three registries.
 *
 * This is an optional utility — callers can use their own implementation of
 * the {@link OperationKeyReader} interface.
 */

import type { Abi, Address, Hex, PublicClient } from "viem";

import { ApplicationRegistryABI } from "../../contracts/abis/ApplicationRegistry.abi";
import { BTCVaultRegistryABI } from "../../contracts/abis/BTCVaultRegistry.abi";
import { ProtocolParamsABI } from "../../contracts/abis/ProtocolParams.abi";
import type {
  KeyEpochs,
  OperationKeyQuery,
  OperationKeyReader,
  RawOperationKeys,
  RawPayoutScripts,
} from "./types";

/** Addresses of the three registries an operation-key resolution spans. */
export interface OperationKeyContracts {
  btcVaultRegistry: Address;
  applicationRegistry: Address;
  protocolParams: Address;
}

/** One `multicall` entry. Loosely typed because the three ABIs differ. */
type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

/**
 * Split a flat multicall result into VP / keepers / challengers.
 *
 * Every method below builds its calls in the same order — vault provider
 * first, then keepers in roster order, then challengers in roster order — so
 * the results stay index-aligned with `query.vaultKeepers` /
 * `query.universalChallengers`. That alignment is what lets the resolver pair
 * a resolved key back to its admin address; the sorted key arrays it exposes
 * are derived from those pairs, never the other way round.
 */
function partition<T>(
  results: readonly T[],
  keeperCount: number,
): { vaultProvider: T; vaultKeepers: T[]; universalChallengers: T[] } {
  return {
    vaultProvider: results[0],
    vaultKeepers: results.slice(1, 1 + keeperCount),
    universalChallengers: results.slice(1 + keeperCount),
  };
}

/**
 * Reads RFC-006 operation keys and payout scripts.
 *
 * Usage:
 * ```ts
 * const reader = new ViemOperationKeyReader(publicClient, contracts);
 * const keys = await reader.getCurrentOperationKeys(query);
 * ```
 */
export class ViemOperationKeyReader implements OperationKeyReader {
  constructor(
    private publicClient: PublicClient,
    private contracts: OperationKeyContracts,
  ) {}

  /**
   * One multicall, `allowFailure: false`, so every key in the set is read at
   * the same block. A rotation landing between two separate `eth_call`s would
   * otherwise produce a mixed-epoch key set and a lock no counterparty agrees
   * with.
   */
  private async readAll<T>(calls: Call[], keeperCount: number) {
    const results = (await this.publicClient.multicall({
      contracts: calls,
      allowFailure: false,
    })) as readonly T[];

    return partition(results, keeperCount);
  }

  async getCurrentOperationKeys(
    query: OperationKeyQuery,
  ): Promise<RawOperationKeys> {
    const calls: Call[] = [
      {
        address: this.contracts.btcVaultRegistry,
        abi: BTCVaultRegistryABI as Abi,
        functionName: "getCurrentOperationBtcKey",
        args: [query.vaultProviderEthAddress],
      },
      ...query.vaultKeepers.map((keeper) => ({
        address: this.contracts.applicationRegistry,
        abi: ApplicationRegistryABI as Abi,
        functionName: "getCurrentOperationBtcKey",
        args: [query.applicationEntryPoint, keeper.ethAddress],
      })),
      ...query.universalChallengers.map((challenger) => ({
        address: this.contracts.protocolParams,
        abi: ProtocolParamsABI as Abi,
        functionName: "getCurrentOperationBtcKey",
        args: [challenger.ethAddress],
      })),
    ];

    return this.readAll<Hex>(calls, query.vaultKeepers.length);
  }

  async getOperationKeysAtEpochs(
    query: OperationKeyQuery,
    epochs: KeyEpochs,
  ): Promise<RawOperationKeys> {
    const calls: Call[] = [
      // The VP takes the plain `AtEpoch` variant: it has no membership
      // version, so its genesis (the registration key at version 0) is
      // unambiguous and the contract resolves it internally.
      {
        address: this.contracts.btcVaultRegistry,
        abi: BTCVaultRegistryABI as Abi,
        functionName: "getOperationBtcKeyAtEpoch",
        args: [query.vaultProviderEthAddress, epochs.vpKeyEpoch],
      },
      // Keepers and challengers take `...OrGenesis` with their roster key
      // passed explicitly, because the correct genesis for them is their key
      // in *this vault's frozen membership version*. An operator dropped from
      // the current roster, or listed under a different key in an older
      // version, would otherwise resolve against the wrong genesis.
      ...query.vaultKeepers.map((keeper) => ({
        address: this.contracts.applicationRegistry,
        abi: ApplicationRegistryABI as Abi,
        functionName: "getOperationBtcKeyAtEpochOrGenesis",
        args: [
          query.applicationEntryPoint,
          keeper.ethAddress,
          epochs.appKeeperKeyEpoch,
          keeper.btcPubKey,
        ],
      })),
      ...query.universalChallengers.map((challenger) => ({
        address: this.contracts.protocolParams,
        abi: ProtocolParamsABI as Abi,
        functionName: "getOperationBtcKeyAtEpochOrGenesis",
        args: [challenger.ethAddress, epochs.ucKeyEpoch, challenger.btcPubKey],
      })),
    ];

    return this.readAll<Hex>(calls, query.vaultKeepers.length);
  }

  async getPayoutScriptsAtEpochs(
    query: OperationKeyQuery,
    epochs: KeyEpochs,
  ): Promise<RawPayoutScripts> {
    // Universal challengers are never claimers, so they have no payout script
    // and no call here.
    const results = (await this.publicClient.multicall({
      contracts: [
        {
          address: this.contracts.btcVaultRegistry,
          abi: BTCVaultRegistryABI as Abi,
          functionName: "getPayoutScriptAtEpoch",
          args: [query.vaultProviderEthAddress, epochs.vpKeyEpoch],
        },
        ...query.vaultKeepers.map((keeper) => ({
          address: this.contracts.applicationRegistry,
          abi: ApplicationRegistryABI as Abi,
          functionName: "getPayoutScriptAtEpoch",
          args: [
            query.applicationEntryPoint,
            keeper.ethAddress,
            epochs.appKeeperKeyEpoch,
          ],
        })),
      ],
      allowFailure: false,
    })) as readonly Hex[];

    return {
      vaultProvider: results[0],
      vaultKeepers: [...results.slice(1)],
    };
  }
}
