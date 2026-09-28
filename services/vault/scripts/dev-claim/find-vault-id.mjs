#!/usr/bin/env node
// Finds the registry vault id for a PegIn txid. The dApp names the artifacts
// download after the PegIn txid (babylon-vault-artifacts-<first 8 hex>.json),
// but every claim step takes the vault id. Scans the registry's registration
// events, whose first indexed topic is the vault id and second the PegIn txid.
//
// Usage: node find-vault-id.mjs <peginTxid, or its first 8+ hex chars> [maxBlocksBack]
//
// Dev-only tooling for the delegated-claim devnet run; never shipped.

import { createPublicClient, http } from "viem";

import { loadVaultEnv } from "./loadVaultEnv.mjs";

const DEFAULT_MAX_BLOCKS_BACK = 200_000n;
const CHUNK_BLOCKS = 5_000n;

const [, , txidArg, maxBackArg] = process.argv;
if (!txidArg || !/^(0x)?[0-9a-fA-F]{8,64}$/.test(txidArg)) {
  console.error("Usage: node find-vault-id.mjs <peginTxid or its first 8+ hex chars> [maxBlocksBack]");
  process.exit(1);
}
const needle = txidArg.toLowerCase().replace(/^0x/, "");
const maxBack = maxBackArg ? BigInt(maxBackArg) : DEFAULT_MAX_BLOCKS_BACK;

const requireEnv = loadVaultEnv();
const registry = requireEnv("NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY").toLowerCase();
const client = createPublicClient({ transport: http(requireEnv("NEXT_PUBLIC_ETH_RPC_URL")) });

const latest = await client.getBlockNumber();
const floor = latest > maxBack ? latest - maxBack : 0n;
const found = new Map();
for (let to = latest; to > floor; to -= CHUNK_BLOCKS) {
  const from = to - CHUNK_BLOCKS + 1n > floor ? to - CHUNK_BLOCKS + 1n : floor;
  const logs = await client.getLogs({ address: registry, fromBlock: from, toBlock: to });
  for (const log of logs) {
    const [, vaultId, peginTxid, depositor] = log.topics;
    if (peginTxid?.toLowerCase().replace(/^0x/, "").startsWith(needle) && vaultId) {
      found.set(vaultId, { peginTxid, depositor: `0x${depositor?.slice(-40)}`, block: log.blockNumber });
    }
  }
  if (found.size > 0) break;
}

if (found.size === 0) {
  console.error(`No registration event for PegIn ${needle} in the last ${maxBack} blocks; pass a larger maxBlocksBack.`);
  process.exit(1);
}
for (const [vaultId, { peginTxid, depositor, block }] of found) {
  console.log(`vaultId   ${vaultId}\npeginTxid ${peginTxid}\ndepositor ${depositor}\nblock     ${block}`);
}
