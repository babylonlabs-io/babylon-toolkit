/**
 * Two-epoch rotation fixture for RFC-006 participant key resolution.
 *
 * Models one application across two epochs:
 *
 * | operator | genesis | at epoch 5 | note |
 * |---|---|---|---|
 * | VP        | vpGenesis | rotated | |
 * | keeper A  | static | static | control: never rotates |
 * | keeper B  | static | rotated | rotated key sorts **before** its genesis |
 * | keeper C  | static | static | registers a custom P2WPKH payout script |
 * | UC 1      | static | rotated | |
 * | UC 2      | static | static | control |
 *
 * Keeper B is the load-bearing case. Rotation changes a key, and therefore
 * changes where it lands in the lexicographic sort that feeds script
 * construction — so the fixture deliberately makes B's rotated key sort ahead
 * of its genesis. Any code that index-joins a sorted key array back to a
 * roster entry breaks on exactly this input and passes on every other one.
 *
 * Keeper C exercises the payout path: the registry returns a registered script
 * for C and the on-chain BIP-86 backfill for everyone else, which is what
 * makes adopting registry reads a no-op until an operator opts in.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import type { Address, Hex } from "viem";

import type {
  AddressBTCKeyPair,
  KeyEpochs,
  OperationKeyQuery,
  OperationKeyReader,
  RawOperationKeys,
  RawPayoutScripts,
} from "../../../../clients/eth/types";
import { deriveBip86ScriptPubKeyHex } from "../../../../primitives/utils/bitcoin";

/** Epoch every operator's genesis key is bonded at. */
export const EPOCH_GENESIS = 0n;
/** Epoch after the rotations above have landed. */
export const EPOCH_AFTER_ROTATION = 5n;

/** Derive a deterministic, real secp256k1 x-only pubkey (lowercase, no `0x`). */
export function xOnlyFromSeed(seed: number): string {
  const scalar = Buffer.alloc(32);
  scalar.writeUInt32BE(seed, 28);
  const point = ecc.pointFromScalar(scalar, true);
  if (!point) throw new Error(`seed ${seed} did not yield a curve point`);
  return Buffer.from(point.subarray(1)).toString("hex");
}

const KEY_POOL = Array.from({ length: 12 }, (_, i) => xOnlyFromSeed(i + 1));

// Pick B's pair so the rotated key sorts strictly before the genesis key,
// rather than hoping two arbitrary keys happen to land that way.
const [KEEPER_B_ROTATED, KEEPER_B_GENESIS] = [KEY_POOL[4], KEY_POOL[5]].sort();

export const KEYS = {
  vpGenesis: KEY_POOL[0],
  vpRotated: KEY_POOL[1],
  keeperAGenesis: KEY_POOL[2],
  keeperBGenesis: KEEPER_B_GENESIS,
  keeperBRotated: KEEPER_B_ROTATED,
  keeperCGenesis: KEY_POOL[6],
  challenger1Genesis: KEY_POOL[7],
  challenger1Rotated: KEY_POOL[8],
  challenger2Genesis: KEY_POOL[9],
  /** Unrelated key, for collision and unknown-participant cases. */
  outsider: KEY_POOL[10],
} as const;

// Real hex throughout: the build path now compares the application entry point
// with `isAddressEqual`, which parses both sides and rejects a mnemonic
// placeholder. Kept visually distinct rather than sequential so a mix-up in a
// fixture is still obvious on sight.
export const ADDRESSES = {
  vaultProvider: "0x00000000000000000000000000000000000000d1" as Address,
  applicationEntryPoint:
    "0x0000000000000000000000000000000000000abc" as Address,
  keeperA: "0x000000000000000000000000000000000000000a" as Address,
  keeperB: "0x000000000000000000000000000000000000000b" as Address,
  keeperC: "0x000000000000000000000000000000000000000c" as Address,
  challenger1: "0x0000000000000000000000000000000000000001" as Address,
  challenger2: "0x0000000000000000000000000000000000000002" as Address,
} as const;

/** Keeper C's registered payout script — a P2WPKH, deliberately not BIP-86. */
export const KEEPER_C_PAYOUT_SCRIPT = `0x0014${"ab".repeat(20)}` as Hex;

/** An operator's append-only key history, as the registry stores it. */
interface OperatorHistory {
  adminAddress: Address;
  genesisKey: string;
  /** Appended operation-key versions, each stamped with the epoch it landed at. */
  rotations: { epoch: bigint; key: string }[];
  /** Registered payout script, stamped with its epoch. Absent = BIP-86 backfill. */
  payoutScript?: { epoch: bigint; script: Hex };
}

const VAULT_PROVIDER: OperatorHistory = {
  adminAddress: ADDRESSES.vaultProvider,
  genesisKey: KEYS.vpGenesis,
  rotations: [{ epoch: 1n, key: KEYS.vpRotated }],
};

const KEEPERS: OperatorHistory[] = [
  {
    adminAddress: ADDRESSES.keeperA,
    genesisKey: KEYS.keeperAGenesis,
    rotations: [],
  },
  {
    adminAddress: ADDRESSES.keeperB,
    genesisKey: KEYS.keeperBGenesis,
    rotations: [{ epoch: 2n, key: KEYS.keeperBRotated }],
  },
  {
    adminAddress: ADDRESSES.keeperC,
    genesisKey: KEYS.keeperCGenesis,
    rotations: [],
    payoutScript: { epoch: 3n, script: KEEPER_C_PAYOUT_SCRIPT },
  },
];

const CHALLENGERS: OperatorHistory[] = [
  {
    adminAddress: ADDRESSES.challenger1,
    genesisKey: KEYS.challenger1Genesis,
    rotations: [{ epoch: 1n, key: KEYS.challenger1Rotated }],
  },
  {
    adminAddress: ADDRESSES.challenger2,
    genesisKey: KEYS.challenger2Genesis,
    rotations: [],
  },
];

/** `findAtEpoch`: the latest appended version stamped `<=` epoch, else genesis. */
function resolveKeyAtEpoch(operator: OperatorHistory, epoch: bigint): string {
  const applicable = operator.rotations.filter((r) => r.epoch <= epoch);
  return applicable.length === 0
    ? operator.genesisKey
    : applicable[applicable.length - 1].key;
}

function resolveCurrentKey(operator: OperatorHistory): string {
  return operator.rotations.length === 0
    ? operator.genesisKey
    : operator.rotations[operator.rotations.length - 1].key;
}

/**
 * Mirrors `getPayoutScriptAtEpoch`: a registered script if one was stamped at
 * or before the epoch, otherwise the on-chain BIP-86 backfill of the operation
 * key bonded at that epoch.
 */
function resolvePayoutScriptAtEpoch(
  operator: OperatorHistory,
  epoch: bigint,
): Hex {
  if (operator.payoutScript && operator.payoutScript.epoch <= epoch) {
    return operator.payoutScript.script;
  }
  return deriveBip86ScriptPubKeyHex(resolveKeyAtEpoch(operator, epoch)) as Hex;
}

function toPair(operator: OperatorHistory): AddressBTCKeyPair {
  return {
    ethAddress: operator.adminAddress,
    btcPubKey: `0x${operator.genesisKey}` as Hex,
  };
}

/** The roster + VP genesis, as every call site supplies them. */
export function buildQuery(
  overrides: Partial<OperationKeyQuery> = {},
): OperationKeyQuery {
  return {
    vaultProviderEthAddress: ADDRESSES.vaultProvider,
    vaultProviderGenesisBtcPubkey: `0x${KEYS.vpGenesis}` as Hex,
    applicationEntryPoint: ADDRESSES.applicationEntryPoint,
    vaultKeepers: KEEPERS.map(toPair),
    universalChallengers: CHALLENGERS.map(toPair),
    ...overrides,
  };
}

export function epochsAt(epoch: bigint): KeyEpochs {
  return {
    vpKeyEpoch: epoch,
    appKeeperKeyEpoch: epoch,
    ucKeyEpoch: epoch,
  };
}

/**
 * An {@link OperationKeyReader} backed by the histories above.
 *
 * Resolves the same way the contracts do, so tests exercise the resolver's own
 * logic rather than a viem mock's. `calls` records what was asked, which is how
 * "current mode never issues an epoch read" is asserted.
 */
export class FakeOperationKeyReader implements OperationKeyReader {
  readonly calls: string[] = [];

  constructor(
    private overrides: {
      /** Force a specific raw key for one admin address, e.g. to test collisions. */
      forceKey?: Map<Address, Hex>;
    } = {},
  ) {}

  private apply(operator: OperatorHistory, resolved: string): Hex {
    const forced = this.overrides.forceKey?.get(operator.adminAddress);
    return forced ?? (`0x${resolved}` as Hex);
  }

  async getCurrentOperationKeys(
    query: OperationKeyQuery,
  ): Promise<RawOperationKeys> {
    this.calls.push("getCurrentOperationKeys");
    return {
      vaultProvider: this.apply(
        VAULT_PROVIDER,
        resolveCurrentKey(VAULT_PROVIDER),
      ),
      vaultKeepers: query.vaultKeepers.map((pair) => {
        const operator = operatorFor(KEEPERS, pair.ethAddress);
        return this.apply(operator, resolveCurrentKey(operator));
      }),
      universalChallengers: query.universalChallengers.map((pair) => {
        const operator = operatorFor(CHALLENGERS, pair.ethAddress);
        return this.apply(operator, resolveCurrentKey(operator));
      }),
    };
  }

  async getOperationKeysAtEpochs(
    query: OperationKeyQuery,
    epochs: KeyEpochs,
  ): Promise<RawOperationKeys> {
    this.calls.push("getOperationKeysAtEpochs");
    return {
      vaultProvider: this.apply(
        VAULT_PROVIDER,
        resolveKeyAtEpoch(VAULT_PROVIDER, epochs.vpKeyEpoch),
      ),
      vaultKeepers: query.vaultKeepers.map((pair) => {
        const operator = operatorFor(KEEPERS, pair.ethAddress);
        return this.apply(
          operator,
          resolveKeyAtEpoch(operator, epochs.appKeeperKeyEpoch),
        );
      }),
      universalChallengers: query.universalChallengers.map((pair) => {
        const operator = operatorFor(CHALLENGERS, pair.ethAddress);
        return this.apply(
          operator,
          resolveKeyAtEpoch(operator, epochs.ucKeyEpoch),
        );
      }),
    };
  }

  async getPayoutScriptsAtEpochs(
    query: OperationKeyQuery,
    epochs: KeyEpochs,
  ): Promise<RawPayoutScripts> {
    this.calls.push("getPayoutScriptsAtEpochs");
    return {
      vaultProvider: resolvePayoutScriptAtEpoch(
        VAULT_PROVIDER,
        epochs.vpKeyEpoch,
      ),
      vaultKeepers: query.vaultKeepers.map((pair) =>
        resolvePayoutScriptAtEpoch(
          operatorFor(KEEPERS, pair.ethAddress),
          epochs.appKeeperKeyEpoch,
        ),
      ),
    };
  }
}

function operatorFor(
  operators: OperatorHistory[],
  adminAddress: Address,
): OperatorHistory {
  const found = operators.find((o) => o.adminAddress === adminAddress);
  if (!found) throw new Error(`no fixture operator for ${adminAddress}`);
  return found;
}
