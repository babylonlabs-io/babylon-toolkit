/**
 * Concrete BTCVaultRegistry reader using viem's readContract.
 *
 * This is an optional utility — callers can use their own implementation
 * of the VaultRegistryReader interface.
 */

import type { Abi, Address, Hex, PublicClient } from "viem";
import { getAbiItem } from "viem";

import { BTCVaultRegistryABI } from "../../contracts/abis/BTCVaultRegistry.abi";
import { BTCVaultRegistryKeyEpochsABI } from "../../contracts/abis/BTCVaultRegistryKeyEpochs.abi";
import { VaultClaimableByNotFoundError } from "./claimable-event-error";
import { assertOnChainBtcPubkey } from "./onChainBtcPubkey";
import { assertValidOffchainParamsVersion } from "./protocol-params-validation";
import { RegistrationLogsUnavailableError } from "./registration-logs-error";
import { findRegistrationRecord } from "./registration-records";
import type {
  KeyEpochs,
  OnChainBtcPubkey,
  PeginRegistrationRecord,
  VaultBasicInfo,
  VaultClaimableByEvent,
  VaultData,
  VaultProtocolInfo,
  VaultRegistryReader,
} from "./types";

/**
 * Inclusive upper bound the BTCVaultRegistry contract enforces on a vault
 * provider's commission (the contract check is `< 10000`).
 */
const MAX_VP_COMMISSION_BPS = 9999;

/** Raw `getBtcVaultBasicInfo` tuple as decoded by viem. */
type RawVaultBasicInfo = {
  depositor: Address;
  depositorBtcPubKey: Hex;
  amount: bigint;
  vaultProvider: Address;
  status: number;
  applicationEntryPoint: Address;
  createdAt: bigint;
};

/**
 * Raw `getBtcVaultProtocolInfo` tuple as decoded by viem.
 *
 * Mirrors the ABI's components except `claimExpiredUntil`, which nothing
 * consumes: it is the post-expiry grace deadline for `claimExpired`, scoped to
 * vaults that expired without activating, and it is not a deadline on the
 * depositor's claim right. The ABI still declares it — the decode is
 * positional, so removing it there would shift `vaultCoreVersion`.
 */
type RawVaultProtocolInfo = {
  depositorSignedPeginTx: Hex;
  universalChallengersVersion: number;
  appVaultKeepersVersion: number;
  offchainParamsVersion: number;
  verifiedAt: bigint;
  depositorWotsPkHash: Hex;
  hashlock: Hex;
  htlcVout: number;
  depositorPopSignature: Hex;
  prePeginTxHash: Hex;
  vaultProviderCommissionBps: number;
  vaultCoreVersion: number;
};

function mapVaultBasicInfo(result: RawVaultBasicInfo): VaultBasicInfo {
  return {
    depositor: result.depositor,
    depositorBtcPubKey: result.depositorBtcPubKey,
    amount: result.amount,
    vaultProvider: result.vaultProvider,
    status: result.status,
    applicationEntryPoint: result.applicationEntryPoint,
    createdAt: result.createdAt,
  };
}

function mapVaultProtocolInfo(result: RawVaultProtocolInfo): VaultProtocolInfo {
  const offchainParamsVersion = Number(result.offchainParamsVersion);
  assertValidOffchainParamsVersion(offchainParamsVersion);
  return {
    depositorSignedPeginTx: result.depositorSignedPeginTx,
    universalChallengersVersion: result.universalChallengersVersion,
    appVaultKeepersVersion: result.appVaultKeepersVersion,
    offchainParamsVersion,
    verifiedAt: result.verifiedAt,
    depositorWotsPkHash: result.depositorWotsPkHash,
    hashlock: result.hashlock,
    htlcVout: result.htlcVout,
    depositorPopSignature: result.depositorPopSignature,
    prePeginTxHash: result.prePeginTxHash,
    vaultProviderCommissionBps: result.vaultProviderCommissionBps,
    vaultCoreVersion: result.vaultCoreVersion,
  };
}

/**
 * Exclusive upper bound for a `uint64` epoch.
 *
 * viem does not range-check a decoded `uint64`, so a misaligned decode can
 * hand back a value far larger than the field can hold. Rejecting those is
 * cheap defence in depth against a mis-decode of the extended ABI.
 *
 * The state this is load-bearing for is narrower than "a registry that predates
 * RFC-006". Against a *fully* pre-RFC-006 registry the path fails closed on its
 * own: `resolveParticipantKeysAtEpochs` goes on to call
 * `getOperationBtcKeyAtEpochOrGenesis` on ApplicationRegistry and
 * ProtocolParams, which do not exist there, so the multicall reverts and these
 * epochs are never used. The reachable gap is a registry that *has* the
 * operation-key getters but whose `BTCVaultProtocolInfo` struct is not
 * extended — there the tail-data epochs resolve with no error at all, and this
 * range check is the only thing looking at them.
 *
 * Even for that case it is only a backstop, and a weak one: a misaligned decode
 * can land on a small, plausible-looking integer this range accepts. Correctness
 * rests on only ever pointing at an RFC-006 registry, which is a deployment
 * precondition rather than something this call can establish — see
 * https://github.com/babylonlabs-io/babylon-toolkit/issues/2192 for where that
 * check is owned, and `BTCVaultRegistryKeyEpochs.abi.ts` for the decode hazard.
 */
const UINT64_EXCLUSIVE_UPPER_BOUND = 1n << 64n;

/**
 * The epoch a vault provider's registration key is bonded at.
 *
 * A provider's operation-key history is append-only and every appended version
 * is stamped at epoch 1 or later, so epoch 0 always resolves to the key set at
 * registration. This is what lets `getOperationBtcKeyAtEpoch` stand in for the
 * removed `getVaultProviderBTCKey` getter.
 */
const VP_GENESIS_KEY_EPOCH = 0n;

/**
 * Both registration events, queried together so one answer settles whether a
 * vault's V2 log is missing (pre-upgrade registration) or the node served no
 * logs for the block at all.
 */
const PEGIN_SUBMITTED_EVENTS = [
  getAbiItem({ abi: BTCVaultRegistryABI, name: "PegInSubmitted" }),
  getAbiItem({ abi: BTCVaultRegistryABI, name: "PegInSubmittedV2" }),
] as const;

const VAULT_CLAIMABLE_BY_EVENT = getAbiItem({
  abi: BTCVaultRegistryABI,
  name: "VaultClaimableBy",
});

/**
 * Block span of one `VaultClaimableBy` query: btc-vault's own scan chunk
 * (`EVENT_QUERY_CHUNK_BLOCKS = 7200`, `crates/eth-client/src/client.rs:793`
 * @ ac4954e7), about a day of Ethereum blocks, so a recent redeem costs one
 * request. Not every provider serves a range this wide — an Alchemy free key
 * caps `eth_getLogs` at 10 blocks
 * (https://www.alchemy.com/docs/reference/eth-getlogs) — and a provider that
 * answered a wide range short instead of erroring would make this scan report
 * not-found, so confirming the RPC honours 7,200-block ranges is a
 * prerequisite of a claim run.
 */
const VAULT_CLAIMABLE_BY_QUERY_CHUNK_BLOCKS = 7_200n;

function maxBigint(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * A `PegInSubmittedV2` log's decoded args, as viem's strict `getLogs` hands
 * them back after the `eventName` narrowing.
 */
interface PegInSubmittedV2Args {
  vaultId: Hex;
  peginTxHash: Hex;
  depositor: Address;
  vaultProvider: Address;
  amount: bigint;
  vaultCoreVersion: number;
  universalChallengersVersion: number;
  appVaultKeepersVersion: number;
  proverCircuitVersion: number;
  offchainParamsVersion: number;
  depositorPayoutBtcAddress: Hex;
  depositorWotsPkHash: Hex;
  hashlock: Hex;
  htlcVout: number;
  unsignedPrePeginTx: Hex;
  maxAcceptableCommissionBps: number;
}

function mapRegistrationRecord(
  args: PegInSubmittedV2Args,
  blockNumber: bigint,
): PeginRegistrationRecord {
  // A plain decode of every V2 log in the block, strangers' included: nothing
  // here parses a transaction or bound-checks a script, so one malformed
  // registration elsewhere in the block cannot fail the caller's read. The
  // strict per-record checks live in registration-records.ts. A duplicate
  // vault id is not covered: a vault registers once, so two logs for one id
  // are an inconsistent node and fail the read closed (see the caller).
  return {
    vaultId: args.vaultId.toLowerCase() as Hex,
    depositor: args.depositor,
    vaultProvider: args.vaultProvider,
    amount: args.amount,
    vaultCoreVersion: args.vaultCoreVersion,
    universalChallengersVersion: args.universalChallengersVersion,
    appVaultKeepersVersion: args.appVaultKeepersVersion,
    proverCircuitVersion: args.proverCircuitVersion,
    offchainParamsVersion: args.offchainParamsVersion,
    peginTxHash: args.peginTxHash.toLowerCase() as Hex,
    depositorPayoutScriptPubKey:
      args.depositorPayoutBtcAddress.toLowerCase() as Hex,
    unsignedPrePeginTx: args.unsignedPrePeginTx,
    maxAcceptableCommissionBps: args.maxAcceptableCommissionBps,
    blockNumber,
  };
}

function assertEpochInRange(
  value: bigint,
  field: string,
  vaultId: Hex,
): bigint {
  if (value < 0n || value >= UINT64_EXCLUSIVE_UPPER_BOUND) {
    throw new Error(
      `getBtcVaultProtocolInfo returned ${field}=${value} for vault ${vaultId}, ` +
        `outside the uint64 range — the registry may predate RFC-006`,
    );
  }
  return value;
}

function mapKeyEpochs(result: KeyEpochs, vaultId: Hex): KeyEpochs {
  return {
    vpKeyEpoch: assertEpochInRange(result.vpKeyEpoch, "vpKeyEpoch", vaultId),
    appKeeperKeyEpoch: assertEpochInRange(
      result.appKeeperKeyEpoch,
      "appKeeperKeyEpoch",
      vaultId,
    ),
    ucKeyEpoch: assertEpochInRange(result.ucKeyEpoch, "ucKeyEpoch", vaultId),
  };
}

/**
 * Concrete vault registry reader using viem.
 *
 * Usage:
 * ```ts
 * const reader = new ViemVaultRegistryReader(publicClient, registryAddress);
 * const data = await reader.getVaultData(vaultId);
 * ```
 */
export class ViemVaultRegistryReader implements VaultRegistryReader {
  constructor(
    private publicClient: PublicClient,
    private contractAddress: Address,
  ) {}

  /**
   * Read the VP's **genesis** (registration) x-only BTC pubkey — the key bonded
   * at version 0, which never moves when the operator rotates.
   *
   * Resolved as "the operation key at epoch 0" rather than through the
   * dedicated `getVaultProviderBTCKey` getter, which
   * https://github.com/babylonlabs-io/vault-contracts-aave-v4/pull/539 removes.
   * Epoch 0 predates any rotation — appended versions are stamped at epoch 1 or
   * later — so it resolves to the registration key, and the contracts team has
   * confirmed that is a property we can rely on rather than an implementation
   * detail. The devnet comparison behind that claim — both getters returning the
   * identical key for a provider that *has* rotated, while
   * `getCurrentOperationBtcKey` differed — is recorded in
   * https://github.com/babylonlabs-io/babylon-toolkit/issues/2188.
   *
   * This makes the read RFC-006-only, where the removed getter also existed on a
   * legacy registry. That costs nothing: every caller of this method already
   * resolves participant keys through `OperationKeyReader`, so all of them
   * require an RFC-006 registry regardless.
   *
   * Validates length, hex form, and secp256k1 curve membership before minting
   * the brand. Returns 64-char lowercase hex without the `0x` prefix.
   */
  async getVaultProviderGenesisBtcPubKey(
    vpAddress: Address,
    blockNumber?: bigint,
  ): Promise<OnChainBtcPubkey> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getOperationBtcKeyAtEpoch",
      args: [vpAddress, VP_GENESIS_KEY_EPOCH],
      blockNumber,
    })) as Hex;
    return assertOnChainBtcPubkey(
      result,
      `getOperationBtcKeyAtEpoch (vp=${vpAddress}, epoch=${VP_GENESIS_KEY_EPOCH})`,
    );
  }

  /**
   * Read the application entry point a vault provider is registered for.
   *
   * This is the registry's own `vaultProviders[vp].applicationEntryPoint`, and
   * it is the value the peg-in submit path resolves internally — it selects
   * which application's vault-keeper roster, roster version and keeper key
   * epoch a deposit is bonded to. The dApp separately carries an entry point
   * from its own configuration; the two agree today, but they are different
   * sources of truth, so the build path reads this one and asserts the
   * configured value matches it rather than trusting either alone.
   */
  async getVaultProviderApplication(
    vpAddress: Address,
    blockNumber?: bigint,
  ): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getVaultProviderApplication",
      args: [vpAddress],
      blockNumber,
    })) as Address;
  }

  /**
   * Read a vault provider's *current* RFC-006 operation BTC key.
   *
   * Falls back on-chain to the registration key when the provider has never
   * rotated, so this returns the same value as
   * `getVaultProviderGenesisBtcPubKey` until the first rotation.
   *
   * This is the key the VP's server signs its BIP-322 auth tokens with — a
   * live per-operator identity, not a per-vault binding, so the auth pin uses
   * the current key rather than any vault's frozen epoch.
   */
  async getCurrentVaultProviderOperationBtcKey(
    vpAddress: Address,
  ): Promise<OnChainBtcPubkey> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getCurrentOperationBtcKey",
      args: [vpAddress],
    })) as Hex;
    return assertOnChainBtcPubkey(
      result,
      `getCurrentOperationBtcKey (vp=${vpAddress})`,
    );
  }

  /**
   * Read a vault's frozen RFC-006 operation-key epochs.
   *
   * Reads `getBtcVaultProtocolInfo` through the **extended** ABI, which is only
   * valid against an RFC-006 registry: against one whose `BTCVaultProtocolInfo`
   * struct is not extended this call does not fail for a populated vault, it
   * silently returns three words of tail data as epochs. Nothing here can detect
   * that, so the guarantee is a deployment one — every network this ships to has
   * the RFC-006 getters, and mainnet is a fresh RFC-006 deploy.
   *
   * A registry missing the operation-key getters entirely is the *safer* of the
   * two cases: `resolveParticipantKeysAtEpochs` reverts downstream and these
   * epochs never reach key resolution. See {@link UINT64_EXCLUSIVE_UPPER_BOUND}
   * for which state the range check actually guards, and
   * `BTCVaultRegistryKeyEpochs.abi.ts` for the decode hazard.
   */
  async getVaultKeyEpochs(vaultId: Hex): Promise<KeyEpochs> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryKeyEpochsABI,
      functionName: "getBtcVaultProtocolInfo",
      args: [vaultId],
    })) as unknown as KeyEpochs;

    return mapKeyEpochs(result, vaultId);
  }

  async getVaultKeyEpochsBatch(vaultIds: readonly Hex[]): Promise<KeyEpochs[]> {
    if (vaultIds.length === 0) return [];

    const results = await this.publicClient.multicall({
      contracts: vaultIds.map((vaultId) => ({
        address: this.contractAddress,
        abi: BTCVaultRegistryKeyEpochsABI as Abi,
        functionName: "getBtcVaultProtocolInfo" as const,
        args: [vaultId] as const,
      })),
      allowFailure: false,
    });

    return results.map((info, i) =>
      mapKeyEpochs(info as unknown as KeyEpochs, vaultIds[i]),
    );
  }

  async getVaultBasicInfo(vaultId: Hex): Promise<VaultBasicInfo> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultBasicInfo",
      args: [vaultId],
    })) as RawVaultBasicInfo;

    return mapVaultBasicInfo(result);
  }

  async getVaultProtocolInfo(vaultId: Hex): Promise<VaultProtocolInfo> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultProtocolInfo",
      args: [vaultId],
    })) as RawVaultProtocolInfo;

    return mapVaultProtocolInfo(result);
  }

  async getProtocolInfoBatch(
    vaultIds: readonly Hex[],
  ): Promise<VaultProtocolInfo[]> {
    if (vaultIds.length === 0) return [];

    const results = await this.publicClient.multicall({
      contracts: vaultIds.map((vaultId) => ({
        address: this.contractAddress,
        abi: BTCVaultRegistryABI as Abi,
        functionName: "getBtcVaultProtocolInfo" as const,
        args: [vaultId] as const,
      })),
      allowFailure: false,
    });

    return results.map((info, i) => {
      const result = info as unknown as RawVaultProtocolInfo;
      if (
        !result.depositorSignedPeginTx ||
        result.depositorSignedPeginTx === "0x"
      ) {
        // An empty record is not proof the vault is absent: a lagging RPC
        // node returns HTTP 200 with a zero struct, so no retry below this
        // layer can see it. Single-shot is only safe because the finality
        // gate (`waitForPeginRegistrationDepth`) runs first on the deposit
        // path — move this ahead of it and the read-after-write race returns.
        // The vault app matches this message to render "still confirming".
        throw new Error(
          `Vault ${vaultIds[i]} not found on-chain or has no pegin transaction`,
        );
      }
      return mapVaultProtocolInfo(result);
    });
  }

  /**
   * Read the protocol pegin fee (in wei) for a given vault provider.
   * Mirrors the `getPegInFee(address)` view on BTCVaultRegistry.
   */
  async getPegInFee(vaultProvider: Address): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getPegInFee",
      args: [vaultProvider],
    })) as bigint;
  }

  /**
   * Read a vault provider's current commission in basis points from
   * BTCVaultRegistry. The contract enforces `commissionBps < 10000`, so the
   * legitimate range is `[0, 9999]`; anything outside indicates a wrong
   * contract address or ABI drift and is surfaced as an error rather than
   * trusted.
   */
  async getVaultProviderCommission(vaultProvider: Address): Promise<number> {
    // viem infers `number` from the `uint16` return in the `as const` ABI.
    const bps = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getVaultProviderCommission",
      args: [vaultProvider],
    });

    if (!Number.isInteger(bps) || bps < 0 || bps > MAX_VP_COMMISSION_BPS) {
      throw new Error(
        `getVaultProviderCommission returned ${bps} bps for ${vaultProvider}, ` +
          `outside the protocol range [0, ${MAX_VP_COMMISSION_BPS}]`,
      );
    }

    return bps;
  }

  async getVaultData(vaultId: Hex): Promise<VaultData> {
    // One round-trip for both structs (hard-fail): they feed signing/refund/
    // broadcast rebinds, so reading them in a single multicall also pins both
    // to the same block — no basic/protocol skew across two `eth_call`s.
    const [basicRaw, protocolRaw] = await this.publicClient.multicall({
      contracts: [
        {
          address: this.contractAddress,
          abi: BTCVaultRegistryABI,
          functionName: "getBtcVaultBasicInfo",
          args: [vaultId],
        },
        {
          address: this.contractAddress,
          abi: BTCVaultRegistryABI,
          functionName: "getBtcVaultProtocolInfo",
          args: [vaultId],
        },
      ],
      allowFailure: false,
    });

    const basic = mapVaultBasicInfo(basicRaw);
    const protocol = mapVaultProtocolInfo(protocolRaw);

    if (
      !protocol.depositorSignedPeginTx ||
      protocol.depositorSignedPeginTx === "0x"
    ) {
      throw new Error(
        `Vault ${vaultId} not found on-chain or has no pegin transaction`,
      );
    }

    return { basic, protocol };
  }

  /** @inheritdoc */
  async getRegistrationRecordsAtBlock(
    createdAt: bigint,
  ): Promise<PeginRegistrationRecord[]> {
    // Deliberately no `vaultId` topic filter: both events must come back in
    // ONE answer for the empty-vs-missing discriminator below to hold, and
    // viem's multi-event form takes no `args` — so the block's registration
    // logs are fetched whole and ids are matched client-side. strict: a log
    // whose data does not decode against the ABI is dropped (viem
    // parseEventLogs) instead of surfacing as `args: {}`.
    const logs = await this.publicClient.getLogs({
      address: this.contractAddress,
      events: PEGIN_SUBMITTED_EVENTS,
      fromBlock: createdAt,
      toBlock: createdAt,
      strict: true,
    });
    if (logs.length === 0) {
      throw new RegistrationLogsUnavailableError(createdAt);
    }

    const records = new Map<string, PeginRegistrationRecord>();
    for (const log of logs) {
      if (log.eventName !== "PegInSubmittedV2") continue;
      const record = mapRegistrationRecord(log.args, log.blockNumber);
      // Lenient decoding covers a malformed log, not a duplicate: a vault
      // registers once, so two logs for any id mean the node is inconsistent
      // and every record from this block is suspect — fail closed by design.
      if (records.has(record.vaultId)) {
        throw new Error(
          `Expected one PegInSubmittedV2 log for vault ${record.vaultId} at block ${createdAt}, ` +
            `found more than one`,
        );
      }
      records.set(record.vaultId, record);
    }
    // The registry emits V1 and V2 together on every submission
    // (vault-contracts-aave-v4 `PeginLogic.sol:144-147` @ c559f5c2), so this
    // is as readily a node that served only part of the block as a pre-#548
    // registry — retryable either way.
    if (records.size === 0) {
      throw new RegistrationLogsUnavailableError(
        createdAt,
        `Block ${createdAt} holds ${logs.length} PegInSubmitted registration log(s) but no ` +
          `PegInSubmittedV2 log: either the node served a partial answer for block ${createdAt} ` +
          `(retry, preferably another node) or the registry predates the depositor's commission ` +
          `ceiling (vault-contracts-aave-v4 #548) and the ceiling cannot be recovered on-chain`,
      );
    }
    return [...records.values()];
  }

  /**
   * Read the depositor's commission ceiling (`maxAcceptableCommissionBps`)
   * for vaults registered in the same block, from their `PegInSubmittedV2`
   * logs. Returned in `vaultIds` order.
   *
   * The contract bound-checks the ceiling and discards it (PeginLogic.sol,
   * `VaultProviderCommissionExceeded`), so the registration log is its only
   * on-chain source. Vault ids are matched case-insensitively.
   *
   * @throws As {@link getRegistrationRecordsAtBlock}, plus the same typed
   * transient error when a vault has no registration log in its own
   * `createdAt` block.
   */
  async getMaxAcceptableCommissionBpsBatch(
    vaultIds: readonly Hex[],
    createdAt: bigint,
  ): Promise<number[]> {
    if (vaultIds.length === 0) return [];

    const records = await this.getRegistrationRecordsAtBlock(createdAt);
    return vaultIds.map(
      (vaultId) =>
        findRegistrationRecord(records, vaultId, createdAt)
          .maxAcceptableCommissionBps,
    );
  }

  /** @inheritdoc */
  async getVaultClaimableBy(
    vaultId: Hex,
    claimerPk: Hex,
    createdAt: bigint,
  ): Promise<VaultClaimableByEvent> {
    const claimer = assertOnChainBtcPubkey(
      claimerPk,
      `getVaultClaimableBy claimer (vault=${vaultId})`,
    );
    const claimerTopic = `0x${claimer}` as Hex;
    // viem re-filters the decoded logs client-side against `args`, comparing a
    // bytes32 with `===` against lower-case hex (parseEventLogs.ts:140,172-188).
    const vaultIdTopic = vaultId.toLowerCase() as Hex;
    // Finalized, not latest: the block found here is what the prover proves
    // against, and an unfinalized redeem can reorg away (btc-vault binds the
    // same scan to its finality level, eth-client client.rs:5989-6040).
    const { number: finalized } = await this.publicClient.getBlock({
      blockTag: "finalized",
    });
    if (finalized < createdAt) {
      throw new Error(
        `Finalized block ${finalized} is below vault ${vaultId}'s registration block ${createdAt}; ` +
          `the registration is not finalized yet, or the node is behind it`,
      );
    }

    // Newest first: the redeem usually trails the tip by far less than it
    // trails the registration. The contract emits every VaultClaimableBy of a
    // vault in one transaction, so the first non-empty chunk is the answer.
    let toBlock = finalized;
    for (;;) {
      const fromBlock = maxBigint(
        createdAt,
        toBlock - VAULT_CLAIMABLE_BY_QUERY_CHUNK_BLOCKS + 1n,
      );
      const logs = await this.publicClient.getLogs({
        address: this.contractAddress,
        event: VAULT_CLAIMABLE_BY_EVENT,
        args: { vaultId: vaultIdTopic, claimerPK: claimerTopic },
        fromBlock,
        toBlock,
        strict: true,
      });
      // A redeem emits every VaultClaimableBy of a vault in ONE transaction
      // (RedeemLogic.sol), and `redeemForDepositor` emits the VP's key and
      // then the depositor's — so when those two keys are equal this filter
      // legitimately matches twice. Identical authorizations from one
      // transaction are the same fact; logs spanning transactions are not.
      if (logs.length > 1) {
        const transactions = new Set(logs.map((log) => log.transactionHash));
        if (transactions.size > 1) {
          throw new Error(
            `Found ${logs.length} VaultClaimableBy logs for vault ${vaultId} and claimer ` +
              `${claimerTopic} across ${transactions.size} transactions in blocks ` +
              `${fromBlock}..${toBlock}; a vault is redeemed once, so the node's answer ` +
              `is inconsistent`,
          );
        }
      }
      if (logs.length >= 1) {
        const log = logs[0];
        return {
          blockNumber: log.blockNumber,
          claimerPk: assertOnChainBtcPubkey(
            log.args.claimerPK,
            `VaultClaimableBy.claimerPK (vault=${vaultId})`,
          ),
          peginTxHash: log.args.peginTxHash,
          vaultCoreVersion: log.args.vaultCoreVersion,
          proverCircuitVersion: log.args.proverCircuitVersion,
          offchainParamsVersion: log.args.offchainParamsVersion,
          universalChallengersVersion: log.args.universalChallengersVersion,
          appVaultKeepersVersion: log.args.appVaultKeepersVersion,
        };
      }
      if (fromBlock === createdAt) {
        throw new VaultClaimableByNotFoundError(
          vaultId,
          claimerTopic,
          createdAt,
          finalized,
        );
      }
      toBlock = fromBlock - 1n;
    }
  }
}
