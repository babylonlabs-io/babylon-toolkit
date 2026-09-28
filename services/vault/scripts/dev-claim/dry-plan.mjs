#!/usr/bin/env node
// Device-free check of everything before the Ledger ceremony: reads the vault
// from chain (dry-run shim: Active vault read as Redeemed with a block-0
// event, unless --real), rebuilds the deposit terms, and builds + binds the
// whole delegated-claim signing plan against the slim graph. No wallet.
//
// Usage: node dry-plan.mjs --vault 0x<id> --slim <x.slim.json> [--real]
// Reads services/vault/.env and .env.local for RPC, registry and mempool.
//
// Dev-only tooling for the delegated-claim devnet run; never shipped.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  buildVaultContextInputForClaim,
  rebuildDepositTermsForClaim,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  OnChainBtcVaultStatus,
  ViemOperationKeyReader,
  ViemProtocolParamsReader,
  ViemUniversalChallengerReader,
  ViemVaultKeeperReader,
  ViemVaultRegistryReader,
  assertOnChainBtcPubkey,
  findRegistrationRecord,
  getTxHex,
  resolveProtocolAddresses,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX,
  assertTermsMatchVault,
  planDelegatedClaimSigning,
  readDelegatedClaimVaultContext,
} from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

import { loadVaultEnv } from "./loadVaultEnv.mjs";

const { values: args } = parseArgs({
  options: {
    vault: { type: "string" },
    slim: { type: "string" },
    real: { type: "boolean", default: false },
  },
});
if (!args.vault || !args.slim) {
  console.error("Usage: node dry-plan.mjs --vault 0x<id> --slim <x.slim.json> [--real]");
  process.exit(1);
}

const requireEnv = loadVaultEnv();
const registryAddress = requireEnv("NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY");
const btcNetwork = requireEnv("NEXT_PUBLIC_BTC_NETWORK");
const mempoolApiUrl = `${requireEnv("NEXT_PUBLIC_MEMPOOL_API")}${btcNetwork === "signet" ? "/signet" : ""}/api`;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(requireEnv("NEXT_PUBLIC_ETH_RPC_URL")),
});
const addresses = await resolveProtocolAddresses(publicClient, registryAddress);
const registryReader = new ViemVaultRegistryReader(publicClient, registryAddress);

const dryRunRegistry = {
  getVaultKeyEpochs: (id) => registryReader.getVaultKeyEpochs(id),
  getVaultProviderGenesisBtcPubKey: (...a) => registryReader.getVaultProviderGenesisBtcPubKey(...a),
  getRegistrationRecordsAtBlock: (block) => registryReader.getRegistrationRecordsAtBlock(block),
  getVaultData: async (id) => {
    const vault = await registryReader.getVaultData(id);
    console.log(`  on-chain status ${vault.basic.status} (read as Redeemed for the dry run)`);
    return { ...vault, basic: { ...vault.basic, status: OnChainBtcVaultStatus.REDEEMED } };
  },
  getVaultClaimableBy: async (id, claimerPk, createdAt) => {
    const record = findRegistrationRecord(
      await registryReader.getRegistrationRecordsAtBlock(createdAt),
      id,
      createdAt,
    );
    return {
      blockNumber: 0n,
      claimerPk: assertOnChainBtcPubkey(claimerPk, "dry-run claimerPk"),
      peginTxHash: record.peginTxHash,
      vaultCoreVersion: record.vaultCoreVersion,
      proverCircuitVersion: record.proverCircuitVersion,
      offchainParamsVersion: record.offchainParamsVersion,
      universalChallengersVersion: record.universalChallengersVersion,
      appVaultKeepersVersion: record.appVaultKeepersVersion,
    };
  },
};

const readers = {
  registryReader: args.real ? registryReader : dryRunRegistry,
  protocolParamsReader: new ViemProtocolParamsReader(publicClient, addresses.protocolParams),
  vaultKeeperReader: new ViemVaultKeeperReader(publicClient, addresses.applicationRegistry),
  universalChallengerReader: new ViemUniversalChallengerReader(publicClient, addresses.protocolParams),
  operationKeyReader: new ViemOperationKeyReader(publicClient, {
    btcVaultRegistry: registryAddress,
    applicationRegistry: addresses.applicationRegistry,
    protocolParams: addresses.protocolParams,
  }),
};

const slim = JSON.parse(readFileSync(resolve(args.slim), "utf8"));

console.log(`1. readDelegatedClaimVaultContext (${args.real ? "REAL" : "dry run"})`);
const read = await readDelegatedClaimVaultContext({ vaultId: args.vault, readers });
const ctx = read.context;
console.log(`  pegin ${read.peginTxHash}, prePegin ${read.prePeginTxHash}:${read.htlcVout}`);
console.log(`  depositor btc ${ctx.depositorBtcPubkey}, eth ${ctx.depositorEthAddress}`);
console.log(`  graph v${ctx.txGraphVersion}, prover circuit ${ctx.proverCircuitVersion}, claimable block ${ctx.claimableEventBlockNumber}`);
console.log(`  keepers ${ctx.vaultKeeperBtcPubkeys.length}, universal challengers ${ctx.universalChallengerBtcPubkeys.length}`);

const graphPrePegin = JSON.parse(slim.tx_graph_json).pegin_tx.tx.input[0].previous_output.split(":")[0];
if (graphPrePegin !== read.prePeginTxHash.replace(/^0x/, "").toLowerCase()) {
  throw new Error(`slim graph spends Pre-PegIn ${graphPrePegin}, vault's is ${read.prePeginTxHash}: wrong file`);
}

console.log("2. funded Pre-PegIn + vault context + deposit terms");
const fundedPrePeginTxHex = await getTxHex(read.prePeginTxHash.replace(/^0x/, ""), mempoolApiUrl);
const vaultContext = buildVaultContextInputForClaim({
  depositorBtcPubKey: read.depositorBtcPubKeyBytes32,
  fundedPrePeginTxHex,
  prePeginTxHash: read.prePeginTxHash,
});
console.log(`  funding outpoints: ${vaultContext.fundingOutpoints.length}`);
const depositTerms = await rebuildDepositTermsForClaim({
  read,
  depositorBtcPubkey: ctx.depositorBtcPubkey,
  fundedPrePeginTxHex,
  siblingReader: registryReader,
  mempoolApiUrl,
  network: btcNetwork,
});
assertTermsMatchVault(depositTerms, ctx);
console.log("  terms rebuilt and matched");

console.log("3. planDelegatedClaimSigning (VP-served verifying key used as trusted — test only)");
const plan = await planDelegatedClaimSigning({
  depositorPublicKey: ctx.depositorBtcPubkey,
  btcNetwork,
  source: { txGraphJson: slim.tx_graph_json, verifyingKeyHex: slim.verifying_key_hex },
  trustedVerifyingKeyHex: slim.verifying_key_hex,
  vault: ctx,
  babeSessionsJson: JSON.stringify(
    Object.fromEntries(
      slim.babe_challengers.map((k) => [k, { decryptor_artifacts_hex: BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX }]),
    ),
  ),
});
const kinds = {};
for (const request of plan.requests) kinds[request.kind] = (kinds[request.kind] ?? 0) + 1;
console.log(`  ${plan.requests.length} signing requests: ${JSON.stringify(kinds)}`);
console.log("OK — everything up to the Ledger ceremony checks out.");
