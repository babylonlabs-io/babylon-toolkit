// Node.js entry point for the WASM bindings.
//
// Uses the --target nodejs wasm-pack build which loads the .wasm file
// from disk via fs.readFileSync instead of fetch().

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// The nodejs target generates CJS — load it via createRequire.
const wasmModule = require("./generated-node/btc_vault.cjs");

const {
  WasmPrePeginTx,
  WasmPrePeginHtlcConnector,
  WasmPeginPayoutConnector,
  WasmAssertPayoutNoPayoutConnector,
  WasmAssertChallengeAssertConnector,
  computeMinClaimValue: wasmComputeMinClaimValue,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = wasmModule as any;

import type {
  PrePeginParams,
  PrePeginResult,
  PeginTxResult,
  HtlcConnectorParams,
  HtlcConnectorInfo,
  PayoutConnectorParams,
  PayoutConnectorInfo,
  Network,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
} from "./types.js";

/**
 * HTLC output index for single deposits.
 */
const SINGLE_DEPOSIT_HTLC_VOUT = 0;

/**
 * No-op for Node.js — the nodejs WASM target initializes synchronously on require().
 */
export async function initWasm(): Promise<void> {
  // Nothing to do: wasm-pack --target nodejs loads the .wasm synchronously.
}

export async function createPrePeginTransaction(
  params: PrePeginParams,
): Promise<PrePeginResult> {
  const tx = new WasmPrePeginTx(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    params.timelockRefund,
    params.pegInAmount,
    params.feeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
  );

  try {
    return {
      txHex: tx.toHex(),
      txid: tx.getTxid(),
      htlcValue: tx.getHtlcValue(SINGLE_DEPOSIT_HTLC_VOUT),
      htlcScriptPubKey: tx.getHtlcScriptPubKey(SINGLE_DEPOSIT_HTLC_VOUT),
      htlcAddress: tx.getHtlcAddress(SINGLE_DEPOSIT_HTLC_VOUT),
      peginAmount: tx.getPeginAmount(),
      depositorClaimValue: tx.getDepositorClaimValue(),
    };
  } finally {
    tx.free();
  }
}

export async function buildPeginTxFromPrePegin(
  params: PrePeginParams,
  timelockPegin: number,
  fundedPrePeginTxHex: string,
  htlcVout: number,
): Promise<PeginTxResult> {
  const unfundedTx = new WasmPrePeginTx(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    params.timelockRefund,
    params.pegInAmount,
    params.feeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
  );

  let fundedTx: InstanceType<typeof WasmPrePeginTx> | null = null;
  let peginTx: ReturnType<typeof unfundedTx.buildPeginTx> | null = null;
  try {
    fundedTx = unfundedTx.fromFundedTransaction(
      fundedPrePeginTxHex,
      params.pegInAmount,
      unfundedTx.getDepositorClaimValue(),
    );
    peginTx = fundedTx.buildPeginTx(timelockPegin, htlcVout);

    return {
      txHex: peginTx.toHex(),
      txid: peginTx.getTxid(),
      vaultScriptPubKey: peginTx.getVaultScriptPubKey(),
      vaultValue: peginTx.getVaultValue(),
    };
  } finally {
    peginTx?.free();
    fundedTx?.free();
    unfundedTx.free();
  }
}

export async function getPrePeginHtlcConnectorInfo(
  params: HtlcConnectorParams,
): Promise<HtlcConnectorInfo> {
  const connector = new WasmPrePeginHtlcConnector(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    params.hashlock,
    params.timelockRefund,
  );

  try {
    return {
      hashlockScript: connector.getHashlockScript(),
      hashlockControlBlock: connector.getHashlockControlBlock(),
      refundScript: connector.getRefundScript(),
      refundControlBlock: connector.getRefundControlBlock(),
      address: connector.getAddress(params.network),
      scriptPubKey: connector.getScriptPubKey(params.network),
    };
  } finally {
    connector.free();
  }
}

export async function computeMinClaimValue(
  numLocalChallengers: number,
  numUniversalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): Promise<bigint> {
  return wasmComputeMinClaimValue(
    numLocalChallengers,
    numUniversalChallengers,
    councilQuorum,
    councilSize,
    feeRate,
  );
}

export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network,
): Promise<PayoutConnectorInfo> {
  const connector = new WasmPeginPayoutConnector(
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.timelockPegin,
  );

  return {
    payoutScript: connector.getPayoutScript(),
    taprootScriptHash: connector.getTaprootScriptHash(),
    scriptPubKey: connector.getScriptPubKey(network),
    address: connector.getAddress(network),
  };
}

export async function getPeginPayoutScript(
  params: PayoutConnectorParams,
): Promise<string> {
  const connector = new WasmPeginPayoutConnector(
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.timelockPegin,
  );

  return connector.getPayoutScript();
}

export async function getAssertPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
): Promise<AssertPayoutScriptInfo> {
  const conn = new WasmAssertPayoutNoPayoutConnector(
    params.claimer,
    params.localChallengers,
    params.universalChallengers,
    params.timelockAssert,
    params.councilMembers,
    params.councilQuorum,
  );

  return {
    payoutScript: conn.getPayoutScript(),
    payoutControlBlock: conn.getPayoutControlBlock(),
  };
}

export async function getAssertNoPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
  challengerPubkey: string,
): Promise<AssertNoPayoutScriptInfo> {
  const conn = new WasmAssertPayoutNoPayoutConnector(
    params.claimer,
    params.localChallengers,
    params.universalChallengers,
    params.timelockAssert,
    params.councilMembers,
    params.councilQuorum,
  );

  return {
    noPayoutScript: conn.getNoPayoutScript(challengerPubkey),
    noPayoutControlBlock: conn.getNoPayoutControlBlock(challengerPubkey),
  };
}

export async function getChallengeAssertScriptInfo(
  params: ChallengeAssertConnectorParams,
): Promise<ChallengeAssertScriptInfo> {
  const conn = new WasmAssertChallengeAssertConnector(
    params.claimer,
    params.challenger,
    params.lamportHashesJson,
    params.gcInputLabelHashesJson,
  );

  return {
    script: conn.getScript(),
    controlBlock: conn.getControlBlock(),
  };
}

// Export types
export type {
  Network,
  PrePeginParams,
  PrePeginResult,
  PeginTxResult,
  HtlcConnectorParams,
  HtlcConnectorInfo,
  PayoutConnectorParams,
  PayoutConnectorInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
} from "./types.js";

// Export constants
export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants.js";
export { SINGLE_DEPOSIT_HTLC_VOUT };
